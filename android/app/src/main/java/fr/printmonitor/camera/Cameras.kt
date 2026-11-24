package fr.printmonitor.camera

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject

/**
 * Caméra Tapo (C210, C200…) vue en local : flux RTSP et orientation ONVIF.
 * Le compte est le « compte de la caméra » créé dans l'appli Tapo (Paramètres avancés),
 * pas le compte TP-Link.
 */
data class TapoCam(
    val name: String = "",
    val ip: String = "",
    val user: String = "",
    val password: String = "",
    /** true : flux 1 (haute définition) ; false : flux 2 (plus léger, conseillé hors de la maison) */
    val hd: Boolean = false,
    /** Positions mémorisées côté application (numéro de preset ONVIF → nom) */
    val presets: List<Preset> = emptyList(),
) {
    val configured get() = ip.isNotBlank() && user.isNotBlank()
    fun displayName(i: Int) = name.ifBlank { "Caméra ${i + 1}" }
    fun rtspUrl(): String {
        fun enc(s: String) = java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20")
        return "rtsp://${enc(user)}:${enc(password)}@${ip.trim()}:554/${if (hd) "stream1" else "stream2"}"
    }
}

data class Preset(val token: String, val name: String)

/** Deux emplacements de caméra, enregistrés dans les préférences. */
object CameraStore {
    const val SLOTS = 2
    private const val PREFS = "printmonitor.cameras"
    private val _cams = MutableStateFlow(List(SLOTS) { TapoCam() })
    val cams: StateFlow<List<TapoCam>> = _cams

    fun load(ctx: Context): List<TapoCam> {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("cams", null)
        val list = try {
            val a = JSONArray(raw ?: "[]")
            List(SLOTS) { i ->
                val o = a.optJSONObject(i) ?: JSONObject()
                val pa = o.optJSONArray("presets") ?: JSONArray()
                TapoCam(
                    name = o.optString("name"), ip = o.optString("ip"), user = o.optString("user"),
                    password = o.optString("password"), hd = o.optBoolean("hd", false),
                    presets = List(pa.length()) { k -> pa.getJSONObject(k).let { Preset(it.optString("token"), it.optString("name")) } },
                )
            }
        } catch (_: Exception) { List(SLOTS) { TapoCam() } }
        _cams.value = list
        return list
    }

    fun save(ctx: Context, list: List<TapoCam>) {
        val a = JSONArray()
        list.take(SLOTS).forEach { c ->
            a.put(JSONObject().apply {
                put("name", c.name.trim()); put("ip", c.ip.trim()); put("user", c.user.trim())
                put("password", c.password); put("hd", c.hd)
                put("presets", JSONArray().apply { c.presets.forEach { p -> put(JSONObject().put("token", p.token).put("name", p.name)) } })
            })
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("cams", a.toString()).apply()
        _cams.value = list
    }

    fun update(ctx: Context, i: Int, f: (TapoCam) -> TapoCam) {
        val l = _cams.value.toMutableList()
        l[i] = f(l[i])
        save(ctx, l)
    }
}
