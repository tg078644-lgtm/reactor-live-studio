package com.castforge.studio

import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

/**
 * Crash-hardened Floating draggable control bubble overlay (SYSTEM_ALERT_WINDOW).
 */
class FloatingBubbleService : Service() {

    private var windowManager: WindowManager? = null
    private var rootContainer: LinearLayout? = null
    private var actionTray: LinearLayout? = null
    private var layoutParams: WindowManager.LayoutParams? = null

    private var isExpanded = false
    private var micMuted = false
    private var chatVisible = true

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            when (intent?.action) {
                ACTION_SHOW -> showBubble()
                ACTION_HIDE -> {
                    removeBubble()
                    stopSelf()
                }
            }
        } catch (t: Throwable) {
            Log.e(TAG, "FloatingBubbleService error", t)
            removeBubble()
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun showBubble() {
        if (rootContainer != null) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Log.w(TAG, "Cannot show floating bubble without SYSTEM_ALERT_WINDOW permission")
            stopSelf()
            return
        }

        windowManager = getSystemService(WINDOW_SERVICE) as? WindowManager ?: return

        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 24
            y = 260
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val bubble = TextView(this).apply {
            text = "LIVE"
            textSize = 11f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            val sizePx = dp(52)
            layoutParams = LinearLayout.LayoutParams(sizePx, sizePx)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#E11D48"))
                setStroke(dp(2), Color.parseColor("#FFFFFF"))
            }
            elevation = dp(6).toFloat()
        }

        val tray = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            visibility = View.GONE
            setPadding(dp(10), dp(6), dp(10), dp(6))
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                marginStart = dp(8)
            }
            layoutParams = lp
            background = GradientDrawable().apply {
                cornerRadius = dp(24).toFloat()
                setColor(Color.parseColor("#E614181F"))
                setStroke(dp(1), Color.parseColor("#33FFFFFF"))
            }
        }

        val micBtn = createTrayButton("Mic On") { btn ->
            micMuted = !micMuted
            btn.text = if (micMuted) "Muted" else "Mic On"
            btn.setTextColor(if (micMuted) Color.parseColor("#F87171") else Color.WHITE)
            runCatching {
                startService(
                    Intent(this, StreamingForegroundService::class.java)
                        .setAction(StreamingForegroundService.ACTION_TOGGLE_MIC)
                )
            }
            emitBubbleCommand("toggleMic", micMuted)
        }

        val chatBtn = createTrayButton("Chat") { btn ->
            chatVisible = !chatVisible
            btn.text = if (chatVisible) "Chat" else "Chat Off"
            emitBubbleCommand("toggleChat", chatVisible)
        }

        val stopBtn = createTrayButton("Stop") {
            runCatching {
                startService(
                    Intent(this, StreamingForegroundService::class.java)
                        .setAction(StreamingForegroundService.ACTION_STOP)
                )
            }
            emitBubbleCommand("stopStream", true)
            removeBubble()
            stopSelf()
        }.apply {
            setTextColor(Color.parseColor("#FDA4AF"))
        }

        tray.addView(micBtn)
        tray.addView(chatBtn)
        tray.addView(stopBtn)

        attachDragAndTapHandler(bubble, tray)

        container.addView(bubble)
        container.addView(tray)

        try {
            windowManager?.addView(container, layoutParams)
            rootContainer = container
            actionTray = tray
        } catch (t: Throwable) {
            Log.e(TAG, "WindowManager.addView failed safely", t)
            stopSelf()
        }
    }

    private fun createTrayButton(label: String, onClick: (TextView) -> Unit): TextView {
        return TextView(this).apply {
            text = label
            textSize = 12f
            setTextColor(Color.WHITE)
            setPadding(dp(12), dp(8), dp(12), dp(8))
            setOnClickListener { runCatching { onClick(this) } }
        }
    }

    private fun attachDragAndTapHandler(bubble: View, tray: View) {
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var moved = false

        bubble.setOnTouchListener { _, event ->
            val lp = layoutParams ?: return@setOnTouchListener false
            try {
                when (event.action) {
                    MotionEvent.ACTION_DOWN -> {
                        initialX = lp.x
                        initialY = lp.y
                        initialTouchX = event.rawX
                        initialTouchY = event.rawY
                        moved = false
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (event.rawX - initialTouchX).toInt()
                        val dy = (event.rawY - initialTouchY).toInt()
                        if (abs(dx) > 8 || abs(dy) > 8) moved = true
                        lp.x = initialX + dx
                        lp.y = initialY + dy
                        rootContainer?.let { windowManager?.updateViewLayout(it, lp) }
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (!moved) {
                            isExpanded = !isExpanded
                            tray.visibility = if (isExpanded) View.VISIBLE else View.GONE
                        }
                        true
                    }
                    else -> false
                }
            } catch (_: Throwable) {
                false
            }
        }
    }

    private fun emitBubbleCommand(command: String, value: Boolean) {
        runCatching {
            val intent = Intent(ACTION_BUBBLE_COMMAND).apply {
                setPackage(packageName)
                putExtra("command", command)
                putExtra("value", value)
            }
            sendBroadcast(intent)
        }
    }

    private fun removeBubble() {
        rootContainer?.let { view ->
            runCatching { windowManager?.removeView(view) }
        }
        rootContainer = null
        actionTray = null
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        removeBubble()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "CastForgeBubbleSvc"
        const val ACTION_SHOW = "com.castforge.studio.BUBBLE_SHOW"
        const val ACTION_HIDE = "com.castforge.studio.BUBBLE_HIDE"
        const val ACTION_BUBBLE_COMMAND = "com.castforge.studio.BUBBLE_COMMAND"
    }
}
