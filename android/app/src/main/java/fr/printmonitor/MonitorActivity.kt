package fr.printmonitor

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import fr.printmonitor.ui.Dashboard
import fr.printmonitor.ui.SettingsScreen

class MonitorActivity : ComponentActivity() {

    private val notifPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)

        val cfg = MonitorHub.config.value
        if (cfg.backgroundMonitoring && !cfg.isEmpty) MonitorService.update(this, true)

        // Retour système : revenir à l'application (et non la fermer)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = backToApp()
        })

        setContent {
            MaterialTheme(colorScheme = if (isSystemInDarkTheme()) darkColorScheme() else lightColorScheme()) {
                var settings by remember { mutableStateOf(MonitorHub.config.value.isEmpty) }
                BackHandler(enabled = settings) { settings = false }
                if (settings) SettingsScreen(onDone = { settings = false })
                else Dashboard(onSettings = { settings = true }, onBack = { backToApp() })
            }
        }
    }

    /**
     * Revient à l'écran principal de l'application. Fonctionne aussi quand la surveillance a été ouverte
     * depuis une notification, ou quand Android a déchargé l'écran principal pendant l'impression :
     * il est alors recréé au lieu de fermer l'application.
     */
    private fun backToApp() {
        val i = Intent(this, fr.svg2print.app.MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        try { startActivity(i) } catch (_: Exception) { }
        finish()
    }
}
