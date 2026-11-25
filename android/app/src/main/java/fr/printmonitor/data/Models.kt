package fr.printmonitor.data

import android.content.Context

enum class PrinterType { ELEGOO_CC, CREALITY_K1 }

enum class PrinterId(val type: PrinterType, val defaultName: String, val key: String) {
    ELEGOO(PrinterType.ELEGOO_CC, "Centauri Carbon 1", "elegoo"),
    ELEGOO2(PrinterType.ELEGOO_CC, "Centauri Carbon 2", "elegoo2"),
    K1(PrinterType.CREALITY_K1, "Creality K1", "k1"),
}

enum class PrintStatus(val label: String) {
    OFFLINE("Hors ligne"),
    IDLE("Inactive"),
    PRINTING("Impression"),
    PAUSED("En pause"),
    FINISHED("Terminée"),
    STOPPED("Arrêtée"),
    ERROR("Erreur"),
}

data class PrinterState(
    val name: String,
    val status: PrintStatus = PrintStatus.OFFLINE,
    val nozzle: Double? = null,
    val nozzleTarget: Double? = null,
    val bed: Double? = null,
    val bedTarget: Double? = null,
    val chamber: Double? = null,
    val progress: Int? = null,
    val fileName: String? = null,
    val layer: Int? = null,
    val totalLayers: Int? = null,
    val elapsedSec: Long? = null,
    val remainingSec: Long? = null,
    val cameraUrl: String? = null,
    /** Page caméra de secours (WebRTC Creality, port 8000) si le MJPEG ne répond pas */
    val cameraFallbackUrl: String? = null,
    val message: String? = null,
    /** null = état inconnu */
    val lightOn: Boolean? = null,
    /** true = fin de filament détectée ; null = capteur non exposé par l'imprimante */
    val filamentRunout: Boolean? = null,
    /** Impression en pause avec un CANVAS : bobine en cause et bobines compatibles chargées */
    val canvasHint: String? = null,
)

data class PlugState(
    val configured: Boolean = false,
    val reachable: Boolean = false,
    val on: Boolean? = null,
    val powerW: Double? = null,
    val todayWh: Double? = null,
    val error: String? = null,
)

data class PrinterConfig(
    /** Nom affiché (vide = nom par défaut) */
    val name: String = "",
    val ip: String = "",
    /** Vide = URL caméra par défaut du modèle */
    val cameraUrl: String = "",
    val plugIp: String = "",
    val autoOff: Boolean = false,
)

data class AppConfig(
    val printers: Map<PrinterId, PrinterConfig> = emptyMap(),
    val tapoEmail: String = "",
    val tapoPassword: String = "",
    val backgroundMonitoring: Boolean = true,
) {
    fun printer(id: PrinterId) = printers[id] ?: PrinterConfig()
    fun displayName(id: PrinterId) = printer(id).name.ifBlank { id.defaultName }
    fun with(id: PrinterId, pc: PrinterConfig) = copy(printers = printers + (id to pc))
    val isEmpty get() = PrinterId.entries.all { printer(it).ip.isBlank() }
}

/**
 * Nettoie une adresse saisie : garde seulement ce qui peut former une IP ou un nom d'hôte
 * (lettres, chiffres, point, tiret). Retire « http:// », le port, le chemin, les espaces et
 * caractères invisibles. Une adresse invalide ne peut plus faire planter les connexions.
 */
fun sanitizeHost(raw: String): String {
    var s = raw.replace(Regex("[\\s\\p{Z}\\p{Cf}]"), "")
    s = s.substringAfter("://")          // http://, ws://…
    s = s.substringBefore('/').substringBefore('?').substringBefore('#')
    s = s.substringAfterLast('@')        // identifiants éventuels
    s = s.substringBefore(':')           // port
    return s.filter { it.isLetterOrDigit() && it.code < 128 || it == '.' || it == '-' }.trim('.', '-')
}

/**
 * Chiffrement des mots de passe avant enregistrement (AES-GCM, clé gardée dans l'Android Keystore,
 * jamais exportée ni sauvegardée). Une sauvegarde Google ou adb ne contient donc que du texte chiffré.
 * Restauré sur un autre téléphone, le mot de passe est illisible : il faut le ressaisir.
 */
object SecretBox {
    private const val ALIAS = "printmonitor.secrets"
    private const val PREFIX = "enc1:"

    private fun key(): javax.crypto.SecretKey {
        val ks = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? javax.crypto.SecretKey)?.let { return it }
        val gen = javax.crypto.KeyGenerator.getInstance(android.security.keystore.KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            android.security.keystore.KeyGenParameterSpec.Builder(
                ALIAS,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    fun isEncrypted(v: String) = v.startsWith(PREFIX)

    fun encrypt(plain: String): String {
        if (plain.isEmpty()) return ""
        return try {
            val c = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            c.init(javax.crypto.Cipher.ENCRYPT_MODE, key())
            val out = c.iv + c.doFinal(plain.toByteArray(Charsets.UTF_8))
            PREFIX + android.util.Base64.encodeToString(out, android.util.Base64.NO_WRAP)
        } catch (_: Exception) { "" } // Keystore indisponible : on n'enregistre pas le mot de passe en clair
    }

    /** Texte chiffré → clair. Valeur ancienne (en clair) renvoyée telle quelle ; illisible → "". */
    fun decrypt(stored: String): String {
        if (!isEncrypted(stored)) return stored
        return try {
            val all = android.util.Base64.decode(stored.removePrefix(PREFIX), android.util.Base64.NO_WRAP)
            val c = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            c.init(javax.crypto.Cipher.DECRYPT_MODE, key(), javax.crypto.spec.GCMParameterSpec(128, all, 0, 12))
            String(c.doFinal(all, 12, all.size - 12), Charsets.UTF_8)
        } catch (_: Exception) { "" }
    }
}

object ConfigStore {
    private const val PREFS = "printmonitor"

    fun load(ctx: Context): AppConfig {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        fun str(k: String, legacy: String? = null) =
            p.getString(k, null) ?: legacy?.let { p.getString(it, null) } ?: ""
        val rawPassword = str("tapoPassword")
        val printers = PrinterId.entries.associateWith { id ->
            val k = id.key
            val legacySuffix = k.replaceFirstChar { it.uppercase() } // ex. plugElegooIp, autoOffK1 (v1.0)
            PrinterConfig(
                name = str("${k}Name"),
                // Nettoyées aussi au chargement : répare une adresse invalide enregistrée par une ancienne version
                ip = sanitizeHost(str("${k}Ip")),
                cameraUrl = str("${k}CameraUrl"),
                plugIp = sanitizeHost(str("${k}PlugIp", "plug${legacySuffix}Ip")),
                autoOff = p.getBoolean("${k}AutoOff", p.getBoolean("autoOff$legacySuffix", false)),
            )
        }
        val cfg = AppConfig(
            printers = printers,
            tapoEmail = str("tapoEmail"),
            tapoPassword = SecretBox.decrypt(rawPassword),
            backgroundMonitoring = p.getBoolean("backgroundMonitoring", true),
        )
        // Ancienne version : mot de passe en clair → réenregistré chiffré
        if (rawPassword.isNotEmpty() && !SecretBox.isEncrypted(rawPassword)) save(ctx, cfg)
        return cfg
    }

    fun save(ctx: Context, c: AppConfig) {
        val e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        PrinterId.entries.forEach { id ->
            val pc = c.printer(id)
            val k = id.key
            e.putString("${k}Name", pc.name.trim())
                .putString("${k}Ip", sanitizeHost(pc.ip))
                .putString("${k}CameraUrl", pc.cameraUrl.trim())
                .putString("${k}PlugIp", sanitizeHost(pc.plugIp))
                .putBoolean("${k}AutoOff", pc.autoOff)
        }
        e.putString("tapoEmail", c.tapoEmail.trim())
            .putString("tapoPassword", SecretBox.encrypt(c.tapoPassword))
            .putBoolean("backgroundMonitoring", c.backgroundMonitoring)
            .apply()
    }
}
