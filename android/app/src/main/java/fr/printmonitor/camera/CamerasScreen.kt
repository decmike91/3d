package fr.printmonitor.camera

import android.view.ViewGroup

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.rtsp.RtspMediaSource
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.launch

// ---------------------------------------------------------------- Visualisation

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CamerasScreen(onBack: () -> Unit, onSetup: () -> Unit) {
    val ctx = LocalContext.current
    LaunchedEffect(Unit) { CameraStore.load(ctx) }
    val cams by CameraStore.cams.collectAsStateWithLifecycle()
    var focus by remember { mutableStateOf<Int?>(null) } // une caméra en grand
    val shown = cams.withIndex().filter { it.value.configured && (focus == null || focus == it.index) }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Caméras") },
            navigationIcon = { TextButton(onClick = { if (focus != null) focus = null else onBack() }) { Text("‹ Retour") } },
            actions = { TextButton(onClick = onSetup) { Text("Configurer") } },
        )
    }) { pad ->
        if (shown.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(pad).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Aucune caméra configurée.", style = MaterialTheme.typography.titleMedium)
                Text(
                    "Ajoutez jusqu'à 2 caméras Tapo (C210…). Il faut d'abord créer un « compte de la caméra » dans l'appli Tapo : " +
                        "caméra › Paramètres › Paramètres avancés › Compte de la caméra.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Button(onClick = onSetup) { Text("Configurer les caméras") }
            }
            return@Scaffold
        }
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            shown.forEach { (i, cam) ->
                item(key = "cam$i-${cam.ip}-${cam.hd}") {
                    CameraCard(i, cam, big = focus == i, onToggleBig = { focus = if (focus == i) null else i })
                }
            }
        }
    }
}

@kotlin.OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
private fun CameraCard(i: Int, cam: TapoCam, big: Boolean, onToggleBig: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val ptz = remember(cam.ip, cam.user, cam.password) { OnvifPtz(cam) }
    var status by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<Preset?>(null) }
    var presets by remember(cam.ip) { mutableStateOf(cam.presets) }

    fun act(label: String, f: suspend () -> Unit) = scope.launch {
        status = label
        status = try { f(); null } catch (e: Exception) { "Orientation impossible : ${e.message}" }
    }
    // Positions lues dans la caméra (celles de l'appli Tapo aussi)
    LaunchedEffect(cam.ip, cam.user, cam.password) {
        try {
            val p = ptz.presets()
            presets = p
            CameraStore.update(ctx, i) { it.copy(presets = p) }
        } catch (_: Exception) { }
    }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(cam.displayName(i), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                FilterChip(selected = cam.hd, onClick = { CameraStore.update(ctx, i) { it.copy(hd = !it.hd) } }, label = { Text(if (cam.hd) "HD" else "SD") })
                Spacer(Modifier.width(6.dp))
                TextButton(onClick = onToggleBig) { Text(if (big) "Réduire" else "Agrandir") }
            }
            RtspPlayer(cam.rtspUrl(), Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(8.dp)))

            // Orientation (C210 motorisée)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    PadButton("▲") { act("…") { ptz.nudge(0f, 1f) } }
                    Row { PadButton("◀") { act("…") { ptz.nudge(-1f, 0f) } }; Spacer(Modifier.size(52.dp)); PadButton("▶") { act("…") { ptz.nudge(1f, 0f) } } }
                    PadButton("▼") { act("…") { ptz.nudge(0f, -1f) } }
                }
                Column(Modifier.weight(1f).padding(start = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Positions", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)
                    if (presets.isEmpty()) Text("Aucune position mémorisée.", style = MaterialTheme.typography.bodySmall)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        presets.forEach { p ->
                            Box(
                                Modifier.clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.secondaryContainer)
                                    .combinedClickable(onClick = { act("Déplacement vers « ${p.name} »…") { ptz.goTo(p) } }, onLongClick = { deleting = p })
                                    .padding(horizontal = 12.dp, vertical = 6.dp),
                            ) { Text(p.name, style = MaterialTheme.typography.bodyMedium) }
                        }
                    }
                    OutlinedButton(onClick = { saving = true }) { Text("Mémoriser la position") }
                }
            }
            status?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = if (it.startsWith("Orientation")) MaterialTheme.colorScheme.error else Color.Unspecified) }
            if (presets.isNotEmpty()) Text("Appui long sur une position pour la supprimer.", style = MaterialTheme.typography.bodySmall)
        }
    }

    if (saving) {
        var name by remember { mutableStateOf(if (presets.size < 2) listOf("Imprimante 1", "Imprimante 2")[presets.size] else "Position ${presets.size + 1}") }
        AlertDialog(
            onDismissRequest = { saving = false },
            title = { Text("Mémoriser la position") },
            text = { OutlinedTextField(name, { name = it }, label = { Text("Nom") }, singleLine = true) },
            confirmButton = {
                TextButton(onClick = {
                    saving = false
                    act("Enregistrement…") {
                        val p = ptz.save(name.trim().ifBlank { "Position" })
                        presets = presets + p
                        CameraStore.update(ctx, i) { it.copy(presets = presets) }
                    }
                }) { Text("Enregistrer") }
            },
            dismissButton = { TextButton(onClick = { saving = false }) { Text("Annuler") } },
        )
    }
    deleting?.let { p ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("Supprimer « ${p.name} » ?") },
            text = { Text("La position est aussi supprimée de la caméra.") },
            confirmButton = {
                TextButton(onClick = {
                    deleting = null
                    act("Suppression…") {
                        ptz.remove(p)
                        presets = presets - p
                        CameraStore.update(ctx, i) { it.copy(presets = presets) }
                    }
                }) { Text("Supprimer") }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Annuler") } },
        )
    }
}

@Composable
private fun PadButton(label: String, onClick: () -> Unit) {
    FilledTonalButton(onClick = onClick, modifier = Modifier.size(52.dp), contentPadding = PaddingValues(0.dp)) { Text(label) }
}

/** Lecteur RTSP (Media3), en TCP pour passer aussi par le VPN ; arrêté quand l'écran n'est plus visible. */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun RtspPlayer(url: String, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    var error by remember(url) { mutableStateOf<String?>(null) }
    var retry by remember(url) { mutableStateOf(0) }
    val player = remember(url, retry) {
        ExoPlayer.Builder(ctx).build().apply {
            setMediaSource(RtspMediaSource.Factory().setForceUseRtpTcp(true).setTimeoutMs(8000).createMediaSource(MediaItem.fromUri(url)))
            volume = 0f
            playWhenReady = true
            prepare()
        }
    }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(player) {
        val l = object : Player.Listener {
            override fun onPlayerError(e: PlaybackException) {
                error = when {
                    e.message?.contains("401") == true || e.cause?.message?.contains("401") == true -> "Identifiant ou mot de passe de la caméra refusé."
                    else -> "Pas d'image (${e.errorCodeName}). Vérifiez l'adresse IP et le compte de la caméra."
                }
            }
            override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_READY) error = null }
        }
        player.addListener(l)
        val obs = LifecycleEventObserver { _, ev ->
            when (ev) {
                Lifecycle.Event.ON_STOP -> player.stop()
                Lifecycle.Event.ON_START -> { player.prepare(); player.playWhenReady = true }
                else -> {}
            }
        }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs); player.removeListener(l); player.release() }
    }
    Box(modifier.background(Color.Black), contentAlignment = Alignment.Center) {
        AndroidView(
            factory = { c ->
                PlayerView(c).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                }
            },
            update = { it.player = player },
            modifier = Modifier.fillMaxSize(),
        )
        error?.let {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(16.dp)) {
                Text(it, color = Color.White, style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { error = null; retry++ }) { Text("Réessayer") }
            }
        }
    }
}

// ---------------------------------------------------------------- Configuration

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CameraSetupScreen(onDone: () -> Unit) {
    val ctx = LocalContext.current
    var list by remember { mutableStateOf(CameraStore.load(ctx)) }
    val scope = rememberCoroutineScope()
    val test = remember { mutableStateOf(List<String?>(CameraStore.SLOTS) { null }) }

    fun set(i: Int, f: (TapoCam) -> TapoCam) { list = list.toMutableList().also { it[i] = f(it[i]) } }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Caméras Tapo") },
            actions = { TextButton(onClick = { CameraStore.save(ctx, list); onDone() }) { Text("Enregistrer") } },
        )
    }) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                "Dans l'appli Tapo : caméra › Paramètres › Paramètres avancés › Compte de la caméra. " +
                    "Créez un identifiant et un mot de passe (différents de votre compte TP-Link) et saisissez-les ici. " +
                    "Donnez une adresse IP fixe à chaque caméra dans la box. Laissez l'adresse vide pour ne pas utiliser l'emplacement.",
                style = MaterialTheme.typography.bodySmall,
            )
            list.forEachIndexed { i, c ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Caméra ${i + 1}", style = MaterialTheme.typography.titleMedium)
                        OutlinedTextField(c.name, { v -> set(i) { it.copy(name = v) } }, label = { Text("Nom (ex. Atelier)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(c.ip, { v -> set(i) { it.copy(ip = v.filter { ch -> ch.isDigit() || ch == '.' }) } }, label = { Text("Adresse IP") }, singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(c.user, { v -> set(i) { it.copy(user = v.trim()) } }, label = { Text("Identifiant du compte de la caméra") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(c.password, { v -> set(i) { it.copy(password = v) } }, label = { Text("Mot de passe du compte de la caméra") }, singleLine = true,
                            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Haute définition")
                                Text("Flux 1 (2K). Désactivé : flux 2, plus léger, conseillé à distance.", style = MaterialTheme.typography.bodySmall)
                            }
                            Switch(c.hd, { v -> set(i) { it.copy(hd = v) } })
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(enabled = c.configured, onClick = {
                                test.value = test.value.toMutableList().also { it[i] = "Test…" }
                                scope.launch {
                                    val r = try { val p = OnvifPtz(c).presets(); "Connexion réussie · ${p.size} position(s) mémorisée(s)" } catch (e: Exception) { "Échec : ${e.message}" }
                                    test.value = test.value.toMutableList().also { it[i] = r }
                                }
                            }) { Text("Tester") }
                            test.value[i]?.let { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
}
