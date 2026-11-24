package fr.printmonitor.printers

import fr.printmonitor.data.PrintStatus
import fr.printmonitor.data.PrinterState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.util.UUID

/**
 * Elegoo Centauri Carbon (CC1) — protocole SDCP v3 en local, sans cloud.
 *  - WebSocket : ws://IP:3030/websocket (5 connexions max côté imprimante)
 *  - Caméra    : MJPEG http://IP:3031/video (UN seul flux simultané : fermer la vue caméra
 *                d'Elegoo Slicer / de l'appli Elegoo si l'image ne vient pas)
 *
 * Note : la Centauri Carbon 2 (CC2) utilise MQTT (port 1883) et n'est pas couverte ici.
 */
class ElegooSdcpClient(
    private val ip: String,
    private val cameraOverride: String,
    target: MutableStateFlow<PrinterState>,
    http: OkHttpClient,
    scope: CoroutineScope,
) : WsPrinterClient(target, http, scope) {

    override val url get() = "ws://$ip:3030/websocket"

    @Volatile private var mainboardId = ""

    override fun onOpened() {
        target.update { it.copy(cameraUrl = cameraOverride.ifBlank { "http://$ip:3031/video" }) }
        sendCmd(CMD_ATTRIBUTES)
        sendCmd(CMD_STATUS)
        sendCmd(CMD_VIDEO, JSONObject().put("Enable", 1))
    }

    override fun keepAlive() {
        send("ping")
        sendCmd(CMD_STATUS)
    }

    override fun pause() { sendCmd(CMD_PAUSE) }
    override fun resume() { sendCmd(CMD_RESUME) }
    override fun cancel() { sendCmd(CMD_STOP) }

    /** Cmd 403 avec {"LightStatus":{"SecondLight":0|1}} — éclairage LED du caisson. */
    override fun setLight(on: Boolean) {
        sendCmd(CMD_PARAMS, JSONObject().put("LightStatus", JSONObject().put("SecondLight", if (on) 1 else 0)))
        target.update { it.copy(lightOn = on) } // affichage immédiat, confirmé au prochain statut
        sendCmd(CMD_STATUS)
    }

    private fun sendCmd(cmd: Int, data: JSONObject = JSONObject()) {
        val inner = JSONObject()
            .put("Cmd", cmd)
            .put("Data", data)
            .put("RequestID", UUID.randomUUID().toString().replace("-", ""))
            .put("MainboardID", mainboardId)
            .put("TimeStamp", System.currentTimeMillis() / 1000)
            .put("From", 1)
        val msg = JSONObject()
            .put("Id", "")
            .put("Data", inner)
            .put("Topic", "sdcp/request/$mainboardId")
        send(msg.toString())
    }

    override fun onText(text: String) {
        if (!text.trimStart().startsWith("{")) return // "pong"
        val o = JSONObject(text)

        o.optString("MainboardID").takeIf { it.isNotEmpty() }?.let { mainboardId = it }
        o.optJSONObject("Data")?.optString("MainboardID")?.takeIf { it.isNotEmpty() }?.let { mainboardId = it }
        o.optJSONObject("Attributes")?.optString("MainboardID")?.takeIf { it.isNotEmpty() }?.let { mainboardId = it }

        val topic = o.optString("Topic")
        if (topic.startsWith("sdcp/error")) {
            val code = o.optJSONObject("Data")?.optJSONObject("Data")?.optInt("ErrorCode")
            target.update { it.copy(status = PrintStatus.ERROR, message = "Erreur imprimante (code $code)") }
            return
        }

        // Réponse à la lecture du CANVAS (Cmd 324), demandée quand l'impression passe en pause
        val inner = o.optJSONObject("Data")
        if (inner != null && inner.optInt("Cmd", -1) == CMD_CANVAS) {
            val hint = canvasHint(inner)
            target.update { it.copy(canvasHint = if (it.status == PrintStatus.PAUSED) hint else null) }
            return
        }

        val st = o.optJSONObject("Status") ?: return
        val cur = st.optJSONArray("CurrentStatus")?.let { a -> (0 until a.length()).map { a.optInt(it) } }
            ?: listOf(st.optInt("CurrentStatus", 0))
        val pi = st.optJSONObject("PrintInfo")
        val piStatus = pi?.optInt("Status", -1) ?: -1

        // CurrentStatus : 0 = inactive, 1 = impression ; PrintInfo.Status : 5/6 pause, 7/8 arrêt, 9 terminé
        val status = when {
            piStatus == 5 || piStatus == 6 -> PrintStatus.PAUSED
            1 in cur && piStatus != 9 && piStatus != 8 -> PrintStatus.PRINTING
            piStatus == 9 -> PrintStatus.FINISHED
            piStatus == 7 || piStatus == 8 -> PrintStatus.STOPPED
            else -> PrintStatus.IDLE
        }

        // Passage en pause : fin de bobine probable, on lit le CANVAS pour proposer une bobine compatible
        if (status == PrintStatus.PAUSED && lastStatus != PrintStatus.PAUSED) sendCmd(CMD_CANVAS)
        lastStatus = status

        target.update { s ->
            val cur0 = pi?.lng("CurrentTicks")
            val tot = pi?.lng("TotalTicks")
            val prog = pi?.int("Progress") ?: 0
            val fileNow = pi?.optString("Filename")?.takeIf { it.isNotBlank() }
            // Repli : valeurs mémorisées par l'application à l'envoi du fichier
            val job = if ((pi?.int("TotalLayer") ?: 0) <= 0 || (tot ?: 0) <= 0)
                fr.printmonitor.MonitorHub.sentJob(ip, fileNow ?: s.fileName) else null
            s.copy(
                status = status,
                nozzle = st.dbl("TempOfNozzle") ?: s.nozzle,
                nozzleTarget = st.dbl("TempTargetNozzle") ?: s.nozzleTarget,
                bed = st.dbl("TempOfHotbed") ?: s.bed,
                bedTarget = st.dbl("TempTargetHotbed") ?: s.bedTarget,
                chamber = st.dbl("TempOfBox") ?: s.chamber,
                lightOn = st.optJSONObject("LightStatus")?.int("SecondLight")?.let { it == 1 } ?: s.lightOn,
                // La CC1 n'expose pas l'état du capteur : une fin de filament se traduit par une pause.
                filamentRunout = null,
                progress = pi?.int("Progress") ?: s.progress,
                fileName = pi?.optString("Filename")?.takeIf { it.isNotBlank() } ?: s.fileName,
                layer = pi?.int("CurrentLayer") ?: s.layer,
                // 0 = inconnu (en-tête du G-code non reconnu par l'imprimante) : on affiche « ? »
                totalLayers = pi?.int("TotalLayer")?.takeIf { it > 0 } ?: job?.layers?.takeIf { it > 0 } ?: s.totalLayers,
                elapsedSec = cur0 ?: s.elapsedSec,
                remainingSec = when {
                    cur0 != null && tot != null && tot > 0 && tot >= cur0 -> tot - cur0
                    cur0 != null && job != null && job.seconds > cur0 -> job.seconds - cur0
                    // Durée totale inconnue : estimation d'après l'avancement
                    cur0 != null && cur0 > 60 && prog in 1..99 -> cur0 * (100 - prog) / prog
                    else -> null
                },
                message = if (status == PrintStatus.ERROR) s.message else null,
                canvasHint = if (status == PrintStatus.PAUSED) s.canvasHint else null,
            )
        }
    }

    @Volatile private var lastStatus: PrintStatus? = null

    /** Texte d'aide : bobine active (vide ?) et bobines chargées de même matière. null sans CANVAS. */
    private fun canvasHint(inner: JSONObject): String? {
        fun find(o: Any?, depth: Int = 0): JSONObject? {
            if (depth > 5) return null
            return when (o) {
                is JSONObject -> if (o.has("canvas_list")) o else o.keys().asSequence().firstNotNullOfOrNull { find(o.opt(it), depth + 1) }
                else -> null
            }
        }
        val d = find(inner) ?: return null
        data class Tray(val n: Int, val canvas: Int, val tray: Int, val type: String, val color: String, val loaded: Boolean)
        val trays = mutableListOf<Tray>()
        val list = d.optJSONArray("canvas_list") ?: return null
        for (u in 0 until list.length()) {
            val cv = list.optJSONObject(u) ?: continue
            if (cv.optInt("connected", 1) == 0) continue
            val tl = cv.optJSONArray("tray_list") ?: continue
            for (k in 0 until tl.length()) {
                val t = tl.optJSONObject(k) ?: continue
                val tid = t.optInt("tray_id", k)
                trays += Tray(u * 4 + tid + 1, cv.optInt("canvas_id", u), tid,
                    "${t.optString("brand")} ${t.optString("filament_type")}".trim(),
                    t.optString("filament_color").removePrefix("#").take(6).uppercase(), t.optInt("status", 0) > 0)
            }
        }
        if (trays.isEmpty()) return null
        fun fam(s: String) = when {
            Regex("TPU", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "TPU"
            Regex("PA|NYLON", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "PA"
            Regex("PETG|PET", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "PETG"
            Regex("PLA", RegexOption.IGNORE_CASE).containsMatchIn(s) -> "PLA"
            else -> s.uppercase()
        }
        val active = trays.firstOrNull { it.canvas == d.optInt("active_canvas_id", -1) && it.tray == d.optInt("active_tray_id", -1) }
            ?: return "CANVAS : ${trays.count { it.loaded }} bobine(s) chargée(s). Si c'est une fin de bobine, chargez-en une autre depuis l'écran puis Reprendre."
        val ok = trays.filter { it != active && it.loaded && fam(it.type) == fam(active.type) }
            .sortedBy { if (it.color == active.color) 0 else 1 }
        val etat = if (active.loaded) "en pause" else "vide"
        val alt = if (ok.isEmpty()) "aucune autre bobine de ${fam(active.type)} chargée : rechargez la bobine ${active.n}"
            else "compatible : " + ok.joinToString(", ") { "bobine ${it.n} (${it.type} #${it.color}${if (it.color == active.color) ", même couleur" else ""})" } +
                " — choisissez-la sur l'écran de l'imprimante puis Reprendre"
        val ar = if (d.optBoolean("auto_refill", false)) "" else " (la recharge automatique du CANVAS est désactivée)"
        return "Bobine ${active.n} (${active.type} #${active.color}) $etat. $alt$ar."
    }

    private companion object {
        const val CMD_CANVAS = 324
        const val CMD_STATUS = 0
        const val CMD_ATTRIBUTES = 1
        const val CMD_PAUSE = 129
        const val CMD_STOP = 130
        const val CMD_RESUME = 131
        const val CMD_VIDEO = 386
        const val CMD_PARAMS = 403
    }
}
