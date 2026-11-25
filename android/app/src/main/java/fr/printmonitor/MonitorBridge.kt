package fr.printmonitor

import android.content.Context
import fr.printmonitor.data.ConfigStore
import fr.printmonitor.data.PrintStatus
import fr.printmonitor.data.PrinterId
import fr.printmonitor.data.PrinterType
import org.json.JSONArray
import org.json.JSONObject

/** Passerelle vers l'application web (onglets Relief SVG / Modèle 3D) : état des imprimantes surveillées. */
object MonitorBridge {
    private fun model(id: PrinterId) = if (id.type == PrinterType.CREALITY_K1) "k1" else "cc"

    /** État courant de chaque imprimante de Surveiller (pour choisir une imprimante libre). */
    @JvmStatic
    fun status(): JSONArray {
        val cfg = MonitorHub.config.value
        val arr = JSONArray()
        PrinterId.entries.filter { cfg.printer(it).ip.isNotBlank() }.forEach { id ->
            val s = MonitorHub.printer(id).value
            arr.put(JSONObject().apply {
                put("key", id.key)
                put("name", cfg.displayName(id))
                put("model", model(id))
                put("ip", cfg.printer(id).ip.trim())
                put("status", s.status.name.lowercase())
                put("label", s.status.label)
                put("busy", s.status == PrintStatus.PRINTING || s.status == PrintStatus.PAUSED)
                s.progress?.let { put("progress", it) }
                s.fileName?.let { put("file", it) }
                s.remainingSec?.let { put("remainingSec", it) }
            })
        }
        return arr
    }

    /**
     * Ajoute l'imprimante à Surveiller si son adresse n'y est pas encore (premier emplacement libre du même modèle).
     * Renvoie le nom affiché, ou null s'il n'y a plus d'emplacement libre.
     */
    @JvmStatic
    fun ensurePrinter(ctx: Context, ip: String, modelKey: String, name: String): String? {
        val clean = fr.printmonitor.data.sanitizeHost(ip)
        if (clean.isEmpty()) return null
        MonitorHub.findByIp(clean)?.let { return MonitorHub.config.value.displayName(it) }
        val type = if (modelKey == "k1") PrinterType.CREALITY_K1 else PrinterType.ELEGOO_CC
        val cfg = ConfigStore.load(ctx)
        val free = PrinterId.entries.firstOrNull { it.type == type && cfg.printer(it).ip.isBlank() } ?: return null
        val next = cfg.with(free, cfg.printer(free).copy(ip = clean, name = name.trim()))
        ConfigStore.save(ctx, next)
        MonitorHub.apply(next)
        return next.displayName(free)
    }
}
