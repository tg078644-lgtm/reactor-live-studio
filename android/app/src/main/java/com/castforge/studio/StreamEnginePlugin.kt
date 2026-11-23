package com.castforge.studio

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Native Capacitor Bridge for CastForge Studio.
 *
 * Coordinates:
 *  - MediaProjection permission & screen + internal game audio capture
 *  - Camera2 / CameraX live controls (front/back, zoom, torch, beauty filter, tap-to-focus)
 *  - EncryptedSharedPreferences storage for RTMP URLs & Stream Keys
 *  - Persistent StreamingForegroundService lifecycle & live telemetry event forwarding
 *  - FloatingBubbleService (SYSTEM_ALERT_WINDOW) control overlay
 */
@CapacitorPlugin(
    name = "StreamEngine",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera"),
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone"),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")
    ]
)
class StreamEnginePlugin : Plugin() {

    private var pendingStartCall: PluginCall? = null
    private var telemetryReceiverRegistered = false

    private val encryptedPrefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private val telemetryReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent == null) return
            when (intent.action) {
                StreamingForegroundService.ACTION_TELEMETRY -> {
                    val payload = JSObject().apply {
                        put("status", intent.getStringExtra("status") ?: "idle")
                        put("fps", intent.getDoubleExtra("fps", 0.0))
                        put("bitrateKbps", intent.getIntExtra("bitrateKbps", 0))
                        put("droppedFramesPct", intent.getDoubleExtra("droppedFramesPct", 0.0))
                        put("uptimeSec", intent.getLongExtra("uptimeSec", 0L))
                        put("micDb", intent.getDoubleExtra("micDb", -60.0))
                        put("gameDb", intent.getDoubleExtra("gameDb", -60.0))
                        put("webDb", intent.getDoubleExtra("webDb", -60.0))
                        put("activeEndpoints", intent.getIntExtra("activeEndpoints", 0))
                        put("reconnectAttempt", intent.getIntExtra("reconnectAttempt", 0))
                        put("isRecording", intent.getBooleanExtra("isRecording", false))
                    }
                    notifyListeners("telemetry", payload)
                }

                FloatingBubbleService.ACTION_BUBBLE_COMMAND -> {
                    val command = intent.getStringExtra("command") ?: return
                    val event = JSObject().apply {
                        put("command", command)
                        put("value", intent.getBooleanExtra("value", false))
                    }
                    notifyListeners("bubbleCommand", event)
                }
            }
        }
    }

    override fun load() {
        super.load()
        registerTelemetryReceiver()
    }

    override fun handleOnDestroy() {
        unregisterTelemetryReceiver()
        super.handleOnDestroy()
    }

    private fun registerTelemetryReceiver() {
        if (telemetryReceiverRegistered) return
        val filter = IntentFilter().apply {
            addAction(StreamingForegroundService.ACTION_TELEMETRY)
            addAction(FloatingBubbleService.ACTION_BUBBLE_COMMAND)
        }
        ContextCompat.registerReceiver(
            context,
            telemetryReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        telemetryReceiverRegistered = true
    }

    private fun unregisterTelemetryReceiver() {
        if (!telemetryReceiverRegistered) return
        try {
            context.unregisterReceiver(telemetryReceiver)
        } catch (_: IllegalArgumentException) {
        }
        telemetryReceiverRegistered = false
    }

    @PluginMethod
    fun checkNativeCapabilities(call: PluginCall) {
        val canDrawOverlays = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }

        val result = JSObject().apply {
            put("isNativeAndroid", true)
            put("sdkInt", Build.VERSION.SDK_INT)
            put("supportsInternalAudio", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            put("hasCameraPermission", getPermissionState("camera") == PermissionState.GRANTED)
            put("hasMicPermission", getPermissionState("microphone") == PermissionState.GRANTED)
            put("hasOverlayPermission", canDrawOverlays)
            put("serviceRunning", StreamingForegroundService.isRunning)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun requestStudioPermissions(call: PluginCall) {
        val aliases = mutableListOf("camera", "microphone")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            aliases.add("notifications")
        }
        requestPermissionForAliases(aliases.toTypedArray(), call, "permissionsCallback")
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        val result = JSObject().apply {
            put("camera", getPermissionState("camera") == PermissionState.GRANTED)
            put("microphone", getPermissionState("microphone") == PermissionState.GRANTED)
            put("notifications", getPermissionState("notifications") == PermissionState.GRANTED)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve(JSObject().put("granted", false).put("openedSettings", true))
        } else {
            call.resolve(JSObject().put("granted", true).put("openedSettings", false))
        }
    }

    @PluginMethod
    fun startStream(call: PluginCall) {
        val sourceMode = call.getString("sourceMode", "screen") ?: "screen"
        val needsProjection = sourceMode == "screen" || sourceMode == "dual_pip"

        if (needsProjection) {
            val projectionManager =
                context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            pendingStartCall = call
            startActivityForResult(
                call,
                projectionManager.createScreenCaptureIntent(),
                "handleMediaProjectionResult"
            )
        } else {
            launchStreamingService(call, Activity.RESULT_OK, null)
        }
    }

    @ActivityCallback
    private fun handleMediaProjectionResult(call: PluginCall?, result: ActivityResult) {
        val activeCall = call ?: pendingStartCall ?: return
        pendingStartCall = null

        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            activeCall.reject("Screen capture permission was denied by the user.")
            return
        }
        launchStreamingService(activeCall, result.resultCode, result.data)
    }

    private fun launchStreamingService(call: PluginCall, resultCode: Int, projectionData: Intent?) {
        val destinationsJson = call.getArray("destinations")?.toString() ?: "[]"
        val qualityJson = call.getObject("quality")?.toString() ?: "{}"
        val sceneJson = call.getObject("activeScene")?.toString() ?: "{}"
        val sourceMode = call.getString("sourceMode", "screen") ?: "screen"
        val recordLocal = call.getBoolean("recordLocal", false) ?: false
        val offlineRecordOnly = call.getBoolean("offlineRecordOnly", false) ?: false
        val disconnectProtection = call.getBoolean("disconnectProtection", true) ?: true
        val showFloatingBubble = call.getBoolean("showFloatingBubble", true) ?: true

        val serviceIntent = Intent(context, StreamingForegroundService::class.java).apply {
            action = StreamingForegroundService.ACTION_START
            putExtra(StreamingForegroundService.EXTRA_RESULT_CODE, resultCode)
            putExtra(StreamingForegroundService.EXTRA_PROJECTION_DATA, projectionData)
            putExtra(StreamingForegroundService.EXTRA_DESTINATIONS_JSON, destinationsJson)
            putExtra(StreamingForegroundService.EXTRA_QUALITY_JSON, qualityJson)
            putExtra(StreamingForegroundService.EXTRA_SCENE_JSON, sceneJson)
            putExtra(StreamingForegroundService.EXTRA_SOURCE_MODE, sourceMode)
            putExtra(StreamingForegroundService.EXTRA_RECORD_LOCAL, recordLocal)
            putExtra(StreamingForegroundService.EXTRA_OFFLINE_RECORD_ONLY, offlineRecordOnly)
            putExtra(StreamingForegroundService.EXTRA_DISCONNECT_PROTECTION, disconnectProtection)
        }

        ContextCompat.startForegroundService(context, serviceIntent)

        if (showFloatingBubble && Settings.canDrawOverlays(context) &&
            (sourceMode == "screen" || sourceMode == "dual_pip")
        ) {
            val bubbleIntent = Intent(context, FloatingBubbleService::class.java).apply {
                action = FloatingBubbleService.ACTION_SHOW
            }
            context.startService(bubbleIntent)
        }

        call.resolve(
            JSObject()
                .put("started", true)
                .put("sourceMode", sourceMode)
                .put("foregroundService", true)
        )
    }

    @PluginMethod
    fun stopStream(call: PluginCall) {
        val stopIntent = Intent(context, StreamingForegroundService::class.java).apply {
            action = StreamingForegroundService.ACTION_STOP
        }
        context.startService(stopIntent)

        val hideBubbleIntent = Intent(context, FloatingBubbleService::class.java).apply {
            action = FloatingBubbleService.ACTION_HIDE
        }
        context.startService(hideBubbleIntent)

        call.resolve(JSObject().put("stopped", true))
    }

    @PluginMethod
    fun switchScene(call: PluginCall) {
        val sceneJson = call.getObject("scene")?.toString() ?: "{}"
        val intent = Intent(context, StreamingForegroundService::class.java).apply {
            action = StreamingForegroundService.ACTION_UPDATE_SCENE
            putExtra(StreamingForegroundService.EXTRA_SCENE_JSON, sceneJson)
        }
        context.startService(intent)
        call.resolve(JSObject().put("switched", true))
    }

    @PluginMethod
    fun setSourceMode(call: PluginCall) {
        val mode = call.getString("sourceMode", "screen") ?: "screen"
        val pipConfig = call.getObject("pipConfig")?.toString() ?: "{}"
        val intent = Intent(context, StreamingForegroundService::class.java).apply {
            action = StreamingForegroundService.ACTION_SET_SOURCE_MODE
            putExtra(StreamingForegroundService.EXTRA_SOURCE_MODE, mode)
            putExtra(StreamingForegroundService.EXTRA_PIP_JSON, pipConfig)
        }
        context.startService(intent)
        call.resolve(JSObject().put("sourceMode", mode))
    }

    @PluginMethod
    fun setCameraControl(call: PluginCall) {
        val intent = Intent(context, StreamingForegroundService::class.java).apply {
            action = StreamingForegroundService.ACTION_CAMERA_CONTROL
            putExtra("facing", call.getString("facing", "front"))
            putExtra("zoom", call.getDouble("zoom", 1.0)?.toFloat() ?: 1.0f)
            putExtra("torch", call.getBoolean("torch", false) ?: false)
            putExtra("beauty", call.getDouble("beauty", 0.2)?.toFloat() ?: 0.2f)
            putExtra("brightness", call.getDouble("brightness", 0.0)?.toFloat() ?: 0.0f)
            putExtra("focusX", call.getDouble("focusX", 0.5)?.toFloat() ?: 0.5f)
            putExtra("focusY", call.getDouble("focusY", 0.5)?.toFloat() ?: 0.5f)
        }
        context.startService(intent)
        call.resolve(JSObject().put("applied", true))
    }

    @PluginMethod
    fun setAudioMix(call: PluginCall) {
        val intent = Intent(context, StreamingForegroundService::class.java).apply {
            action = StreamingForegroundService.ACTION_AUDIO_MIX
            putExtra("micGain", call.getDouble("micGain", 0.85)?.toFloat() ?: 0.85f)
            putExtra("micMuted", call.getBoolean("micMuted", false) ?: false)
            putExtra("gameGain", call.getDouble("gameGain", 0.75)?.toFloat() ?: 0.75f)
            putExtra("gameMuted", call.getBoolean("gameMuted", false) ?: false)
            putExtra("webGain", call.getDouble("webGain", 0.65)?.toFloat() ?: 0.65f)
            putExtra("webMuted", call.getBoolean("webMuted", false) ?: false)
        }
        context.startService(intent)
        call.resolve(JSObject().put("updated", true))
    }

    @PluginMethod
    fun toggleFloatingBubble(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        if (enabled && !Settings.canDrawOverlays(context)) {
            call.reject("Overlay permission (SYSTEM_ALERT_WINDOW) is required.")
            return
        }
        val intent = Intent(context, FloatingBubbleService::class.java).apply {
            action = if (enabled) FloatingBubbleService.ACTION_SHOW else FloatingBubbleService.ACTION_HIDE
        }
        context.startService(intent)
        call.resolve(JSObject().put("enabled", enabled))
    }

    @PluginMethod
    fun saveDestinationsSecure(call: PluginCall) {
        val destinations: JSArray = call.getArray("destinations") ?: JSArray()
        encryptedPrefs.edit()
            .putString(KEY_RTMP_DESTINATIONS, destinations.toString())
            .apply()
        call.resolve(JSObject().put("saved", true).put("storage", "EncryptedSharedPreferences"))
    }

    @PluginMethod
    fun loadDestinationsSecure(call: PluginCall) {
        val raw = encryptedPrefs.getString(KEY_RTMP_DESTINATIONS, "[]") ?: "[]"
        call.resolve(JSObject().put("destinations", JSArray(raw)))
    }

    companion object {
        private const val PREFS_NAME = "castforge_secure_rtmp_vault"
        private const val KEY_RTMP_DESTINATIONS = "rtmp_destinations_json"
    }
}
