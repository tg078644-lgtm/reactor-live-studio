package com.castforge.studio

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
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
 * Crash-hardened Native Capacitor Bridge for CastForge Studio.
 *
 * Ensures:
 *  - Runtime permissions (CAMERA, RECORD_AUDIO, POST_NOTIFICATIONS) are requested BEFORE any
 *    MediaProjection or Foreground Service launch.
 *  - EncryptedSharedPreferences falls back safely if device KeyStore throws a crypto error.
 *  - Every plugin method is wrapped in try-catch so uncaught exceptions never force-close the app.
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
    private var usingEncryptedStorage = true

    private val securePrefs: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            usingEncryptedStorage = true
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (t: Throwable) {
            Log.w(TAG, "EncryptedSharedPreferences unavailable; falling back to private SharedPreferences", t)
            usingEncryptedStorage = false
            context.getSharedPreferences(PREFS_FALLBACK_NAME, Context.MODE_PRIVATE)
        }
    }

    private val telemetryReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent == null) return
            try {
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
            } catch (t: Throwable) {
                Log.w(TAG, "Telemetry receiver error", t)
            }
        }
    }

    override fun load() {
        try {
            super.load()
            registerTelemetryReceiver()
        } catch (t: Throwable) {
            Log.e(TAG, "Error during StreamEnginePlugin.load()", t)
        }
    }

    override fun handleOnDestroy() {
        try {
            unregisterTelemetryReceiver()
            super.handleOnDestroy()
        } catch (t: Throwable) {
            Log.w(TAG, "Error during StreamEnginePlugin.handleOnDestroy()", t)
        }
    }

    private fun registerTelemetryReceiver() {
        if (telemetryReceiverRegistered) return
        try {
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
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to register telemetry BroadcastReceiver", t)
        }
    }

    private fun unregisterTelemetryReceiver() {
        if (!telemetryReceiverRegistered) return
        try {
            context.unregisterReceiver(telemetryReceiver)
        } catch (_: Throwable) {
        }
        telemetryReceiverRegistered = false
    }

    private fun hasPermissionGranted(permission: String): Boolean {
        return try {
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        } catch (_: Throwable) {
            false
        }
    }

    private fun missingRequiredAliasesForStart(): Array<String> {
        val missing = mutableListOf<String>()
        if (!hasPermissionGranted(Manifest.permission.CAMERA)) {
            missing.add("camera")
        }
        if (!hasPermissionGranted(Manifest.permission.RECORD_AUDIO)) {
            missing.add("microphone")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            !hasPermissionGranted(Manifest.permission.POST_NOTIFICATIONS)
        ) {
            missing.add("notifications")
        }
        return missing.toTypedArray()
    }

    @PluginMethod
    fun checkNativeCapabilities(call: PluginCall) {
        try {
            val canDrawOverlays = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }

            val result = JSObject().apply {
                put("isNativeAndroid", true)
                put("sdkInt", Build.VERSION.SDK_INT)
                put("supportsInternalAudio", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                put("hasCameraPermission", hasPermissionGranted(Manifest.permission.CAMERA))
                put("hasMicPermission", hasPermissionGranted(Manifest.permission.RECORD_AUDIO))
                put("hasOverlayPermission", canDrawOverlays)
                put("serviceRunning", StreamingForegroundService.isRunning)
            }
            call.resolve(result)
        } catch (t: Throwable) {
            Log.e(TAG, "checkNativeCapabilities error", t)
            call.resolve(
                JSObject()
                    .put("isNativeAndroid", true)
                    .put("sdkInt", Build.VERSION.SDK_INT)
                    .put("supportsInternalAudio", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                    .put("hasCameraPermission", false)
                    .put("hasMicPermission", false)
                    .put("hasOverlayPermission", false)
                    .put("serviceRunning", false)
            )
        }
    }

    @PluginMethod
    fun requestStudioPermissions(call: PluginCall) {
        try {
            val aliases = mutableListOf("camera", "microphone")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                aliases.add("notifications")
            }
            requestPermissionForAliases(aliases.toTypedArray(), call, "permissionsCallback")
        } catch (t: Throwable) {
            Log.e(TAG, "requestStudioPermissions failed", t)
            call.resolve(
                JSObject()
                    .put("camera", hasPermissionGranted(Manifest.permission.CAMERA))
                    .put("microphone", hasPermissionGranted(Manifest.permission.RECORD_AUDIO))
                    .put("notifications", Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || hasPermissionGranted(Manifest.permission.POST_NOTIFICATIONS))
            )
        }
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        try {
            val result = JSObject().apply {
                put("camera", getPermissionState("camera") == PermissionState.GRANTED || hasPermissionGranted(Manifest.permission.CAMERA))
                put("microphone", getPermissionState("microphone") == PermissionState.GRANTED || hasPermissionGranted(Manifest.permission.RECORD_AUDIO))
                put(
                    "notifications",
                    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                        getPermissionState("notifications") == PermissionState.GRANTED ||
                        hasPermissionGranted(Manifest.permission.POST_NOTIFICATIONS)
                )
            }
            call.resolve(result)
        } catch (t: Throwable) {
            Log.e(TAG, "permissionsCallback error", t)
            call.resolve(JSObject().put("camera", false).put("microphone", false).put("notifications", false))
        }
    }

    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        try {
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
        } catch (t: Throwable) {
            Log.e(TAG, "requestOverlayPermission failed", t)
            call.resolve(JSObject().put("granted", false).put("openedSettings", false))
        }
    }

    @PluginMethod
    fun startStream(call: PluginCall) {
        try {
            // Always request runtime CAMERA, RECORD_AUDIO, POST_NOTIFICATIONS before starting stream/screen capture
            val missing = missingRequiredAliasesForStart()
            if (missing.isNotEmpty()) {
                requestPermissionForAliases(missing, call, "startStreamAfterPermissions")
                return
            }
            proceedStartStream(call)
        } catch (t: Throwable) {
            Log.e(TAG, "startStream failed safely", t)
            call.reject("Could not initialize broadcast: ${t.localizedMessage ?: "unknown error"}")
        }
    }

    @PermissionCallback
    private fun startStreamAfterPermissions(call: PluginCall) {
        try {
            val micOk = hasPermissionGranted(Manifest.permission.RECORD_AUDIO)
            val camOk = hasPermissionGranted(Manifest.permission.CAMERA)
            val sourceMode = call.getString("sourceMode", "screen") ?: "screen"

            if (sourceMode == "camera" && !camOk) {
                call.reject("Camera permission is required for Camera IRL streaming.")
                return
            }
            if (!micOk && !camOk && sourceMode == "dual_pip") {
                call.reject("Camera and Microphone permissions are required for Dual PiP mode.")
                return
            }
            proceedStartStream(call)
        } catch (t: Throwable) {
            Log.e(TAG, "startStreamAfterPermissions error", t)
            call.reject("Permission check failed: ${t.localizedMessage ?: "unknown error"}")
        }
    }

    private fun proceedStartStream(call: PluginCall) {
        try {
            val sourceMode = call.getString("sourceMode", "screen") ?: "screen"
            val needsProjection = sourceMode == "screen" || sourceMode == "dual_pip"

            if (needsProjection) {
                val projectionManager =
                    context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
                if (projectionManager == null) {
                    call.reject("MediaProjection service is unavailable on this device.")
                    return
                }
                pendingStartCall = call
                startActivityForResult(
                    call,
                    projectionManager.createScreenCaptureIntent(),
                    "handleMediaProjectionResult"
                )
            } else {
                launchStreamingService(call, Activity.RESULT_OK, null)
            }
        } catch (t: Throwable) {
            Log.e(TAG, "proceedStartStream failed", t)
            call.reject("Unable to launch capture intent: ${t.localizedMessage ?: "unknown error"}")
        }
    }

    @ActivityCallback
    private fun handleMediaProjectionResult(call: PluginCall?, result: ActivityResult) {
        val activeCall = call ?: pendingStartCall ?: return
        pendingStartCall = null

        try {
            if (result.resultCode != Activity.RESULT_OK || result.data == null) {
                activeCall.reject("Screen capture permission was denied by the user.")
                return
            }
            launchStreamingService(activeCall, result.resultCode, result.data)
        } catch (t: Throwable) {
            Log.e(TAG, "handleMediaProjectionResult failed", t)
            activeCall.reject("Failed to start screen broadcast: ${t.localizedMessage ?: "unknown error"}")
        }
    }

    private fun launchStreamingService(call: PluginCall, resultCode: Int, projectionData: Intent?) {
        try {
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

            if (showFloatingBubble &&
                (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)) &&
                (sourceMode == "screen" || sourceMode == "dual_pip")
            ) {
                runCatching {
                    val bubbleIntent = Intent(context, FloatingBubbleService::class.java).apply {
                        action = FloatingBubbleService.ACTION_SHOW
                    }
                    context.startService(bubbleIntent)
                }
            }

            call.resolve(
                JSObject()
                    .put("started", true)
                    .put("sourceMode", sourceMode)
                    .put("foregroundService", true)
            )
        } catch (t: Throwable) {
            Log.e(TAG, "launchStreamingService failed", t)
            call.reject("Foreground service failed to start: ${t.localizedMessage ?: "unknown error"}")
        }
    }

    @PluginMethod
    fun stopStream(call: PluginCall) {
        try {
            runCatching {
                val stopIntent = Intent(context, StreamingForegroundService::class.java).apply {
                    action = StreamingForegroundService.ACTION_STOP
                }
                context.startService(stopIntent)
            }
            runCatching {
                val hideBubbleIntent = Intent(context, FloatingBubbleService::class.java).apply {
                    action = FloatingBubbleService.ACTION_HIDE
                }
                context.startService(hideBubbleIntent)
            }
            call.resolve(JSObject().put("stopped", true))
        } catch (t: Throwable) {
            Log.e(TAG, "stopStream error", t)
            call.resolve(JSObject().put("stopped", true))
        }
    }

    @PluginMethod
    fun switchScene(call: PluginCall) {
        try {
            if (StreamingForegroundService.isRunning) {
                val sceneJson = call.getObject("scene")?.toString() ?: "{}"
                val intent = Intent(context, StreamingForegroundService::class.java).apply {
                    action = StreamingForegroundService.ACTION_UPDATE_SCENE
                    putExtra(StreamingForegroundService.EXTRA_SCENE_JSON, sceneJson)
                }
                context.startService(intent)
            }
            call.resolve(JSObject().put("switched", true))
        } catch (t: Throwable) {
            Log.w(TAG, "switchScene error", t)
            call.resolve(JSObject().put("switched", false))
        }
    }

    @PluginMethod
    fun setSourceMode(call: PluginCall) {
        try {
            val mode = call.getString("sourceMode", "screen") ?: "screen"
            if (StreamingForegroundService.isRunning) {
                val pipConfig = call.getObject("pipConfig")?.toString() ?: "{}"
                val intent = Intent(context, StreamingForegroundService::class.java).apply {
                    action = StreamingForegroundService.ACTION_SET_SOURCE_MODE
                    putExtra(StreamingForegroundService.EXTRA_SOURCE_MODE, mode)
                    putExtra(StreamingForegroundService.EXTRA_PIP_JSON, pipConfig)
                }
                context.startService(intent)
            }
            call.resolve(JSObject().put("sourceMode", mode))
        } catch (t: Throwable) {
            Log.w(TAG, "setSourceMode error", t)
            call.resolve(JSObject().put("sourceMode", call.getString("sourceMode", "screen")))
        }
    }

    @PluginMethod
    fun setCameraControl(call: PluginCall) {
        try {
            if (StreamingForegroundService.isRunning) {
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
            }
            call.resolve(JSObject().put("applied", true))
        } catch (t: Throwable) {
            Log.w(TAG, "setCameraControl error", t)
            call.resolve(JSObject().put("applied", false))
        }
    }

    @PluginMethod
    fun setAudioMix(call: PluginCall) {
        try {
            if (StreamingForegroundService.isRunning) {
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
            }
            call.resolve(JSObject().put("updated", true))
        } catch (t: Throwable) {
            Log.w(TAG, "setAudioMix error", t)
            call.resolve(JSObject().put("updated", false))
        }
    }

    @PluginMethod
    fun toggleFloatingBubble(call: PluginCall) {
        try {
            val enabled = call.getBoolean("enabled", false) ?: false
            if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
                call.resolve(JSObject().put("enabled", false))
                return
            }
            val intent = Intent(context, FloatingBubbleService::class.java).apply {
                action = if (enabled) FloatingBubbleService.ACTION_SHOW else FloatingBubbleService.ACTION_HIDE
            }
            context.startService(intent)
            call.resolve(JSObject().put("enabled", enabled))
        } catch (t: Throwable) {
            Log.w(TAG, "toggleFloatingBubble error", t)
            call.resolve(JSObject().put("enabled", false))
        }
    }

    @PluginMethod
    fun saveDestinationsSecure(call: PluginCall) {
        try {
            val destinations: JSArray = call.getArray("destinations") ?: JSArray()
            securePrefs.edit()
                .putString(KEY_RTMP_DESTINATIONS, destinations.toString())
                .apply()
            val backend = if (usingEncryptedStorage) "EncryptedSharedPreferences" else "Private SharedPreferences"
            call.resolve(JSObject().put("saved", true).put("storage", backend))
        } catch (t: Throwable) {
            Log.e(TAG, "saveDestinationsSecure error", t)
            call.resolve(JSObject().put("saved", false).put("storage", "Unavailable"))
        }
    }

    @PluginMethod
    fun loadDestinationsSecure(call: PluginCall) {
        try {
            val raw = securePrefs.getString(KEY_RTMP_DESTINATIONS, "[]") ?: "[]"
            call.resolve(JSObject().put("destinations", JSArray(raw)))
        } catch (t: Throwable) {
            Log.e(TAG, "loadDestinationsSecure error", t)
            call.resolve(JSObject().put("destinations", JSArray()))
        }
    }

    companion object {
        private const val TAG = "CastForgePlugin"
        private const val PREFS_NAME = "castforge_secure_rtmp_vault"
        private const val PREFS_FALLBACK_NAME = "castforge_private_rtmp_vault"
        private const val KEY_RTMP_DESTINATIONS = "rtmp_destinations_json"
    }
}
