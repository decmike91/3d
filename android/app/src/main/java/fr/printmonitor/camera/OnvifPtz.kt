package fr.printmonitor.camera

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * Orientation des caméras Tapo motorisées (C210…) par ONVIF, port 2020, en local.
 * Authentification WS-Security (UsernameToken, mot de passe condensé) avec le compte de la caméra.
 */
class OnvifPtz(private val cam: TapoCam) {
    private val http = OkHttpClient.Builder().connectTimeout(4, TimeUnit.SECONDS).readTimeout(6, TimeUnit.SECONDS).build()
    private val url = "http://${cam.ip.trim()}:2020/onvif/service"
    private var profile: String? = null

    class OnvifError(msg: String) : Exception(msg)

    private fun security(): String {
        val nonce = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val created = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
        val sha = MessageDigest.getInstance("SHA-1")
        sha.update(nonce); sha.update(created.toByteArray()); sha.update(cam.password.toByteArray())
        val digest = Base64.encodeToString(sha.digest(), Base64.NO_WRAP)
        val n64 = Base64.encodeToString(nonce, Base64.NO_WRAP)
        return """<s:Header><Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><UsernameToken><Username>${xml(cam.user)}</Username><Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">$digest</Password><Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">$n64</Nonce><Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">$created</Created></UsernameToken></Security></s:Header>"""
    }

    private fun xml(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private suspend fun call(body: String): String = withContext(Dispatchers.IO) {
        val env = """<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">${security()}<s:Body>$body</s:Body></s:Envelope>"""
        val req = Request.Builder().url(url).post(env.toRequestBody("application/soap+xml; charset=utf-8".toMediaType())).build()
        http.newCall(req).execute().use { r ->
            val t = r.body?.string() ?: ""
            if (!r.isSuccessful || t.contains(":Fault>")) {
                val reason = Regex("<[^>]*Text[^>]*>([^<]+)<").find(t)?.groupValues?.get(1)
                throw OnvifError(when {
                    r.code == 401 || t.contains("NotAuthorized", true) -> "identifiant ou mot de passe de la caméra refusé"
                    reason != null -> reason
                    else -> "HTTP ${r.code}"
                })
            }
            t
        }
    }

    private suspend fun token(): String = profile ?: run {
        val t = call("<trt:GetProfiles/>")
        (Regex("""Profiles[^>]*token="([^"]+)"""").find(t)?.groupValues?.get(1) ?: throw OnvifError("aucun profil vidéo"))
            .also { profile = it }
    }

    /** Petit déplacement : dx, dy entre -1 et 1 (gauche/droite, bas/haut). */
    suspend fun nudge(dx: Float, dy: Float) {
        val tk = token()
        try {
            call("""<tptz:RelativeMove><tptz:ProfileToken>$tk</tptz:ProfileToken><tptz:Translation><tt:PanTilt x="${dx * 0.1f}" y="${dy * 0.1f}"/></tptz:Translation></tptz:RelativeMove>""")
        } catch (e: OnvifError) {
            // Certains firmwares n'acceptent que le mouvement continu : on bouge un court instant puis on arrête
            call("""<tptz:ContinuousMove><tptz:ProfileToken>$tk</tptz:ProfileToken><tptz:Velocity><tt:PanTilt x="${dx * 0.5f}" y="${dy * 0.5f}"/></tptz:Velocity></tptz:ContinuousMove>""")
            delay(350)
            call("""<tptz:Stop><tptz:ProfileToken>$tk</tptz:ProfileToken><tptz:PanTilt>true</tptz:PanTilt></tptz:Stop>""")
        }
    }

    /** Positions mémorisées dans la caméra (les mêmes que dans l'appli Tapo). */
    suspend fun presets(): List<Preset> {
        val t = call("<tptz:GetPresets><tptz:ProfileToken>${token()}</tptz:ProfileToken></tptz:GetPresets>")
        return Regex("""Preset[^>]*token="([^"]+)"[^>]*>(.*?)</[^>]*Preset>""", RegexOption.DOT_MATCHES_ALL).findAll(t).map { m ->
            val name = Regex("""Name>([^<]*)<""").find(m.groupValues[2])?.groupValues?.get(1) ?: m.groupValues[1]
            Preset(m.groupValues[1], name)
        }.toList()
    }

    suspend fun goTo(p: Preset) {
        call("<tptz:GotoPreset><tptz:ProfileToken>${token()}</tptz:ProfileToken><tptz:PresetToken>${xml(p.token)}</tptz:PresetToken></tptz:GotoPreset>")
    }

    /** Mémorise la position actuelle sous ce nom ; renvoie la position créée. */
    suspend fun save(name: String): Preset {
        val t = call("<tptz:SetPreset><tptz:ProfileToken>${token()}</tptz:ProfileToken><tptz:PresetName>${xml(name)}</tptz:PresetName></tptz:SetPreset>")
        val tok = Regex("""PresetToken>([^<]+)<""").find(t)?.groupValues?.get(1) ?: throw OnvifError("position non enregistrée")
        return Preset(tok, name)
    }

    suspend fun remove(p: Preset) {
        call("<tptz:RemovePreset><tptz:ProfileToken>${token()}</tptz:ProfileToken><tptz:PresetToken>${xml(p.token)}</tptz:PresetToken></tptz:RemovePreset>")
    }
}
