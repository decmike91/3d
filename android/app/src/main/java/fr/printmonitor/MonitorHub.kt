package fr.printmonitor

import android.content.Context
import fr.printmonitor.data.AppConfig
import fr.printmonitor.data.PlugState
import fr.printmonitor.data.PrintStatus
import fr.printmonitor.data.PrinterId
import fr.printmonitor.data.PrinterState
import fr.printmonitor.data.PrinterType
import fr.printmonitor.printers.CrealityK1Client
import fr.printmonitor.printers.ElegooSdcpClient
import fr.printmonitor.printers.PrinterClient
import fr.printmonitor.tapo.TapoKlapClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Point central : connexions imprimantes, prises Tapo, alertes et extinction automatique. */
object MonitorHub {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var appContext: Context

    val wsHttp: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()
    val streamHttp: OkHttpClient = wsHttp.newBuilder().readTimeout(15, TimeUnit.SECONDS).build()
    private val tapoHttp: OkHttpClient = wsHttp.newBuilder().readTimeout(5, TimeUnit.SECONDS).build()

    private val _config = MutableStateFlow(AppConfig())
    val config: StateFlow<AppConfig> = _config.asStateFlow()

    private val printerFlows = PrinterId.entries.associateWith { MutableStateFlow(PrinterState(it.defaultName)) }
    private val plugFlows = PrinterId.entries.associateWith { MutableStateFlow(PlugState()) }
    fun printer(id: PrinterId): StateFlow<PrinterState> = printerFlows.getValue(id)
    fun plug(id: PrinterId): StateFlow<PlugState> = plugFlows.getValue(id)

    private val clients = ConcurrentHashMap<PrinterId, PrinterClient>()
    private val plugClients = ConcurrentHashMap<PrinterId, TapoKlapClient>()
    private var plugPoll: Job? = null
    private val autoOffJobs = ConcurrentHashMap<PrinterId, Job>()

    /** Extinction demandée pour l'impression en cours seulement (depuis l'envoi ou le tableau de bord). */
    private val _powerOffOnce = MutableStateFlow<Set<PrinterId>>(emptySet())
    val powerOffOnce: StateFlow<Set<PrinterId>> = _powerOffOnce.asStateFlow()

    fun findByIp(ip: String): PrinterId? = PrinterId.entries.firstOrNull { _config.value.printer(it).ip.trim() == ip.trim() }
    fun hasPlug(id: PrinterId): Boolean = plugClients.containsKey(id)

    /** Arme (ou désarme) la coupure de la prise à la fin de l'impression en cours. */
    fun armPowerOff(id: PrinterId, on: Boolean) {
        _powerOffOnce.update { if (on) it + id else it - id }
        // Le service au premier plan garde la surveillance active écran éteint jusqu'à la coupure
        refreshService()
    }
    /** Fichier envoyé par l'application : nombre de couches et durée estimée, connus au tranchage.
     *  Sert quand l'imprimante ne les donne pas (TotalLayer = 0, TotalTicks = 0). */
    data class SentJob(val file: String, val layers: Int, val seconds: Long, val at: Long)
    private const val JOBS = "svg2print.sentJobs"

    fun noteSentJob(context: Context, ip: String, file: String, layers: Int, seconds: Long) {
        context.applicationContext.getSharedPreferences(JOBS, Context.MODE_PRIVATE).edit()
            .putString(ip.trim(), listOf(file, layers, seconds, System.currentTimeMillis()).joinToString("\t")).apply()
    }

    fun sentJob(ip: String, file: String?): SentJob? {
        val ctx = appContextOrNull() ?: return null
        val raw = ctx.getSharedPreferences(JOBS, Context.MODE_PRIVATE).getString(ip.trim(), null) ?: return null
        val p = raw.split('\t')
        if (p.size < 4) return null
        val job = SentJob(p[0], p[1].toIntOrNull() ?: 0, p[2].toLongOrNull() ?: 0, p[3].toLongOrNull() ?: 0)
        val name = file?.substringAfterLast('/')?.takeIf { it.isNotBlank() }
        return when {
            name != null -> job.takeIf { it.file.substringAfterLast('/') == name }
            else -> job.takeIf { System.currentTimeMillis() - it.at < 3 * 24 * 3600_000L }
        }
    }

    private fun appContextOrNull(): Context? = if (::appContext.isInitialized) appContext else null
    private var watching = false

    fun init(ctx: Context, cfg: AppConfig) {
        appContext = ctx.applicationContext
        if (!watching) {
            watching = true
            PrinterId.entries.forEach { watchTransitions(it) }
        }
        apply(cfg) // configuration seulement : les connexions attendent qu'un écran ou le service les demande
    }

    // ------------------------------------------------------------------ Connexions à la demande
    // Les imprimantes ne sont contactées que si quelqu'un en a besoin : un écran de l'application
    // ouvert, ou le service d'arrière-plan pendant une impression. Application quittée sans
    // impression en cours : plus aucune connexion, plus rien ne tourne.
    private val users = java.util.Collections.synchronizedSet(mutableSetOf<String>())
    @Volatile private var running = false
    private var stopJob: Job? = null

    /** Un écran ou le service a besoin des imprimantes. */
    @Synchronized
    fun acquire(tag: String) {
        users += tag
        stopJob?.cancel(); stopJob = null
        if (!running) startClients()
    }

    /** Plus besoin : connexions coupées quelques secondes plus tard s'il n'y a plus personne. */
    @Synchronized
    fun release(tag: String) {
        users -= tag
        if (users.isEmpty()) {
            stopJob?.cancel()
            stopJob = scope.launch {
                delay(5_000) // passage d'un écran à l'autre : on ne coupe pas
                synchronized(this@MonitorHub) { if (users.isEmpty()) stopClients() }
            }
        }
    }

    @Synchronized
    fun apply(cfg: AppConfig) {
        _config.value = cfg
        PrinterId.entries.forEach { id -> printerFlows.getValue(id).update { it.copy(name = cfg.displayName(id)) } }
        if (running) { stopClients(); startClients() }
        else PrinterId.entries.forEach { id ->
            val pc = cfg.printer(id)
            plugFlows.getValue(id).value = PlugState(configured = cfg.tapoEmail.isNotBlank() && cfg.tapoPassword.isNotBlank() && pc.plugIp.isNotBlank())
        }
        refreshService()
    }

    @Synchronized
    private fun startClients() {
        val cfg = _config.value
        running = true
        val tapoOk = cfg.tapoEmail.isNotBlank() && cfg.tapoPassword.isNotBlank()
        PrinterId.entries.forEach { id ->
            val pc = cfg.printer(id)
            val flow = printerFlows.getValue(id)
            if (pc.ip.isNotBlank()) clients[id] = when (id.type) {
                PrinterType.ELEGOO_CC -> ElegooSdcpClient(pc.ip, pc.cameraUrl, flow, wsHttp, scope)
                PrinterType.CREALITY_K1 -> CrealityK1Client(pc.ip, pc.cameraUrl, flow, wsHttp, scope)
            }
            if (tapoOk && pc.plugIp.isNotBlank()) plugClients[id] =
                TapoKlapClient(pc.plugIp, cfg.tapoEmail, cfg.tapoPassword, tapoHttp)
        }
        clients.values.forEach { it.start() }
        PrinterId.entries.forEach { id ->
            plugFlows.getValue(id).value = PlugState(configured = plugClients.containsKey(id))
        }
        if (plugClients.isNotEmpty()) plugPoll = scope.launch {
            while (isActive) {
                plugClients.keys.toList().forEach { refreshPlug(it) }
                delay(5_000)
            }
        }
    }

    @Synchronized
    private fun stopClients() {
        running = false
        clients.values.forEach { it.stop() }
        clients.clear()
        plugClients.clear()
        plugPoll?.cancel(); plugPoll = null
    }

    // ------------------------------------------------------------------ Service d'arrière-plan
    // Il ne tourne que pendant une impression (ou une extinction automatique en attente),
    // puis s'arrête seul : plus de notification permanente ni de recherche des imprimantes.
    @Volatile private var serviceOn = false
    private var serviceCheck: Job? = null
    @Volatile private var graceUntil = 0L

    private fun printing() = PrinterId.entries.any {
        val st = printerFlows.getValue(it).value.status
        st == PrintStatus.PRINTING || st == PrintStatus.PAUSED
    }
    private fun serviceNeeded() = _config.value.backgroundMonitoring &&
        (printing() || _powerOffOnce.value.isNotEmpty() || autoOffJobs.values.any { it.isActive } || System.currentTimeMillis() < graceUntil)

    /** Une impression vient d'être lancée depuis l'application : surveillance jusqu'à la fin. */
    fun printLaunched() {
        graceUntil = System.currentTimeMillis() + 5 * 60_000L // le temps que l'imprimante passe « en impression »
        refreshService()
    }

    /** Démarre ou arrête le service selon les impressions en cours. */
    fun refreshService() {
        val ctx = appContextOrNull() ?: return
        if (serviceNeeded()) {
            if (!serviceOn) {
                serviceOn = true
                try { MonitorService.update(ctx, true) } catch (_: Exception) { serviceOn = false } // démarrage refusé en arrière-plan
            }
        } else if (serviceOn) {
            serviceOn = false
            try { MonitorService.update(ctx, false) } catch (_: Exception) { }
        }
    }

    /** Appelé par le service : vérifie chaque minute s'il est encore utile. */
    internal fun serviceStarted() {
        serviceOn = true
        if (graceUntil < System.currentTimeMillis()) graceUntil = System.currentTimeMillis() + 2 * 60_000L // relancé par Android : le temps de relire l'état
        serviceCheck?.cancel()
        serviceCheck = scope.launch { while (isActive) { delay(60_000); refreshService() } }
    }
    internal fun serviceStopped() { serviceOn = false; serviceCheck?.cancel(); serviceCheck = null }

    fun pause(id: PrinterId) = clients[id]?.pause()
    fun resume(id: PrinterId) = clients[id]?.resume()
    fun cancel(id: PrinterId) = clients[id]?.cancel()
    fun setLight(id: PrinterId, on: Boolean) = clients[id]?.setLight(on)

    fun setPlug(id: PrinterId, on: Boolean) {
        scope.launch { setPlugNow(id, on) }
    }

    private suspend fun setPlugNow(id: PrinterId, on: Boolean): Boolean {
        val c = plugClients[id] ?: return false
        return try {
            c.setOn(on)
            refreshPlug(id)
            true
        } catch (e: Exception) {
            plugFlows.getValue(id).update { it.copy(error = e.message) }
            false
        }
    }

    private suspend fun refreshPlug(id: PrinterId) {
        val c = plugClients[id] ?: return
        val flow = plugFlows.getValue(id)
        try {
            val info = c.getDeviceInfo()
            val energy = try { c.getEnergyUsage() } catch (_: Exception) { null } // P100/P105 : pas de mesure
            flow.value = PlugState(
                configured = true,
                reachable = true,
                on = info.optBoolean("device_on"),
                powerW = energy?.optDouble("current_power")?.takeIf { !it.isNaN() }?.div(1000.0),
                todayWh = energy?.optDouble("today_energy")?.takeIf { !it.isNaN() },
            )
        } catch (e: Exception) {
            flow.value = PlugState(configured = true, reachable = false, error = e.message)
        }
    }

    /** Alertes sur changement d'état + extinction automatique après impression. */
    private fun watchTransitions(id: PrinterId) = scope.launch {
        var prev: PrintStatus? = null
        var prevRunout: Boolean? = null
        var prevHint: String? = null
        printerFlows.getValue(id).collect { s ->
            if (s.filamentRunout == true && prevRunout == false) {
                Notifier.alert(appContext, id, "${s.name} : fin de filament", "Recharger le filament puis reprendre l'impression")
            }
            prevRunout = s.filamentRunout
            if (s.canvasHint != null && s.canvasHint != prevHint && s.status == PrintStatus.PAUSED) {
                Notifier.alert(appContext, id, "${s.name} : fin de bobine ?", s.canvasHint)
            }
            prevHint = s.canvasHint
            val p = prev
            prev = s.status
            if (p == null || p == s.status) return@collect
            val wasActive = p == PrintStatus.PRINTING || p == PrintStatus.PAUSED
            when (s.status) {
                PrintStatus.FINISHED -> if (wasActive) {
                    Notifier.alert(appContext, id, "${s.name} : impression terminée", s.fileName ?: "")
                    if (autoOffEnabled(id)) scheduleAutoOff(id)
                }
                PrintStatus.PAUSED -> if (p == PrintStatus.PRINTING)
                    Notifier.alert(appContext, id, "${s.name} : impression en pause", "Fin de filament ou pause manuelle ?")
                PrintStatus.ERROR -> Notifier.alert(appContext, id, "${s.name} : erreur", s.message ?: "")
                PrintStatus.STOPPED -> if (wasActive) {
                    Notifier.alert(appContext, id, "${s.name} : impression arrêtée", s.fileName ?: "")
                    // Impression annulée : on ne coupe pas, l'utilisateur intervient sans doute
                    if (id in _powerOffOnce.value) armPowerOff(id, false)
                }
                PrintStatus.OFFLINE -> if (wasActive)
                    Notifier.alert(appContext, id, "${s.name} : connexion perdue", "Pendant une impression — vérifier l'imprimante")
                PrintStatus.PRINTING -> autoOffJobs.remove(id)?.cancel()
                else -> Unit
            }
            refreshService() // impression commencée ou finie (extinction en attente comprise) : service démarré / arrêté
        }
    }

    private fun autoOffEnabled(id: PrinterId) =
        (_config.value.printer(id).autoOff || id in _powerOffOnce.value) && plugClients.containsKey(id)

    /** Seuil de coupure : la buse doit être redescendue sous cette température (ventilation de la tête). */
    const val POWER_OFF_NOZZLE_C = 80.0

    /** Attend que la buse soit redescendue sous 80 °C (deux mesures de suite), puis coupe la prise. */
    private fun scheduleAutoOff(id: PrinterId) {
        autoOffJobs[id]?.cancel()
        autoOffJobs[id] = scope.launch {
            val flow = printerFlows.getValue(id)
            val cooled = withTimeoutOrNull(60 * 60_000L) {
                var below = 0
                flow.first {
                    below = if ((it.nozzle ?: Double.MAX_VALUE) < POWER_OFF_NOZZLE_C) below + 1 else 0
                    below >= 2 // deux mesures consécutives : évite une lecture isolée erronée
                }
            } ?: run { if (id in _powerOffOnce.value) armPowerOff(id, false); return@launch }
            if (flow.value.status == PrintStatus.PRINTING || flow.value.status == PrintStatus.PAUSED) return@launch
            if (setPlugNow(id, false)) {
                Notifier.alert(appContext, id, "${cooled.name} : prise coupée", "Buse sous 80 °C, imprimante éteinte automatiquement")
            } else {
                Notifier.alert(appContext, id, "${cooled.name} : coupure impossible", "La prise Tapo n'a pas répondu : éteignez l'imprimante à la main")
            }
            if (id in _powerOffOnce.value) armPowerOff(id, false)
            autoOffJobs.remove(id)
            refreshService()
        }
    }
}
