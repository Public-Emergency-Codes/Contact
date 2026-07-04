package com.contact.app

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.BitmapFactory
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.io.File
import kotlin.math.abs

object ReturnToCallOverlay {
    private data class ContactBadge(
        val displayName: String?,
        val photoUri: String?,
    )

    private data class PendingOverlay(
        val title: String,
        val subtitle: String,
        val callActive: Boolean,
        val emergency: Boolean,
        val profilePhotoUri: String?,
    )

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    @Volatile private var callUiVisible = false
    private var pendingRegularOverlay: PendingOverlay? = null

    fun canDraw(context: Context): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
    }

    fun show(
        context: Context,
        title: String,
        subtitle: String,
        callActive: Boolean,
        emergency: Boolean,
        profilePhotoUri: String?,
    ): Boolean {
        if (!canDraw(context)) return false
        if (!emergency && callUiVisible) {
            pendingRegularOverlay = PendingOverlay(title, subtitle, callActive, emergency, profilePhotoUri)
            hide()
            return true
        }

        val appContext = context.applicationContext
        val wm = appContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        hide()

        val density = appContext.resources.displayMetrics.density
        fun dp(value: Int): Int = (value * density).toInt()

        val accentColor = Color.parseColor(if (emergency) "#B91C1C" else "#16A34A")
        val contactBadge = if (!emergency) resolveContactBadge(appContext) else null

        val container = LinearLayout(appContext).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(9), dp(12), dp(9))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(24).toFloat()
                setColor(accentColor)
                setStroke(dp(1), Color.argb(80, 255, 255, 255))
            }
            elevation = dp(10).toFloat()
        }

        val badgePhotoUri = when {
            emergency -> null
            !profilePhotoUri.isNullOrBlank() -> profilePhotoUri
            !contactBadge?.photoUri.isNullOrBlank() -> contactBadge?.photoUri
            else -> null
        }
        val photoBitmap = if (!badgePhotoUri.isNullOrBlank()) {
            loadBitmap(appContext, badgePhotoUri)
        } else {
            null
        }
        val contactInitials = initialsForName(contactBadge?.displayName)

        val icon: View = if (emergency) {
            badgeTextView(appContext, "911")
        } else if (photoBitmap != null) {
            ImageView(appContext).apply {
                setImageBitmap(photoBitmap)
                scaleType = ImageView.ScaleType.CENTER_CROP
                clipToOutline = true
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.argb(65, 0, 0, 0))
                }
            }
        } else if (!contactInitials.isNullOrBlank()) {
            badgeTextView(appContext, contactInitials)
        } else {
            ImageView(appContext).apply {
                setImageResource(android.R.drawable.ic_menu_myplaces)
                setColorFilter(Color.WHITE)
                scaleType = ImageView.ScaleType.CENTER
                setPadding(dp(9), dp(9), dp(9), dp(9))
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.argb(65, 0, 0, 0))
                }
            }
        }
        container.addView(icon, LinearLayout.LayoutParams(dp(42), dp(42)).apply {
            rightMargin = dp(10)
        })

        val textStack = LinearLayout(appContext).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
        }
        textStack.addView(TextView(appContext).apply {
            text = title
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            maxLines = 1
        })
        textStack.addView(TextView(appContext).apply {
            text = subtitle
            setTextColor(Color.argb(215, 255, 255, 255))
            textSize = 12f
            maxLines = 1
        })
        container.addView(textStack, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        val arrow = TextView(appContext).apply {
            text = ">"
            setTextColor(Color.WHITE)
            textSize = 22f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        container.addView(arrow, LinearLayout.LayoutParams(dp(22), dp(42)))

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            dp(270),
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dp(16)
            y = dp(80)
        }

        var downRawX = 0f
        var downRawY = 0f
        var startX = 0
        var startY = 0
        container.setOnTouchListener { _, event ->
            val currentParams = layoutParams ?: return@setOnTouchListener false
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    downRawX = event.rawX
                    downRawY = event.rawY
                    startX = currentParams.x
                    startY = currentParams.y
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    currentParams.x = startX + (event.rawX - downRawX).toInt()
                    currentParams.y = startY + (event.rawY - downRawY).toInt()
                    try { wm.updateViewLayout(container, currentParams) } catch (_: Exception) {}
                    true
                }
                MotionEvent.ACTION_UP -> {
                    val moved = abs(event.rawX - downRawX) > dp(8) || abs(event.rawY - downRawY) > dp(8)
                    if (!moved) openApp(appContext, emergency)
                    true
                }
                else -> false
            }
        }

        return try {
            wm.addView(container, params)
            windowManager = wm
            overlayView = container
            layoutParams = params
            true
        } catch (_: Exception) {
            overlayView = null
            layoutParams = null
            windowManager = null
            false
        }
    }

    fun hide() {
        val view = overlayView ?: return
        try { windowManager?.removeView(view) } catch (_: Exception) {}
        overlayView = null
        layoutParams = null
        windowManager = null
    }

    fun onCallUiResumed() {
        callUiVisible = true
        hide()
    }

    fun onCallUiPaused(context: Context) {
        callUiVisible = false
        val pending = pendingRegularOverlay ?: PendingOverlay(
            title = "Return to call",
            subtitle = "Call active",
            callActive = CallManager.hasActiveCall(),
            emergency = false,
            profilePhotoUri = null,
        )
        pendingRegularOverlay = null
        if (pending.callActive) {
            show(
                context,
                pending.title,
                pending.subtitle,
                pending.callActive,
                pending.emergency,
                pending.profilePhotoUri,
            )
        }
    }

    private fun openApp(context: Context, emergency: Boolean) {
        if (!emergency) {
            val intent = Intent(context, InCallUiActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
            }
            context.startActivity(intent)
            return
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("contact://return-to-call?target=e911")
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
        }
        context.startActivity(intent)
    }

    private fun loadBitmap(context: Context, rawUri: String): android.graphics.Bitmap? {
        return try {
            val uri = Uri.parse(rawUri)
            when (uri.scheme) {
                "file" -> BitmapFactory.decodeFile(uri.path)
                "content" -> context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
                null, "" -> BitmapFactory.decodeFile(File(rawUri).absolutePath)
                else -> null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun badgeTextView(context: Context, value: String): TextView {
        return TextView(context).apply {
            text = value
            setTextColor(Color.WHITE)
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(65, 0, 0, 0))
            }
        }
    }

    private fun resolveContactBadge(context: Context): ContactBadge? {
        val number = CallManager.getActiveNumber().orEmpty()
        if (number.isBlank()) return null
        return try {
            val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
            val projection = arrayOf(
                ContactsContract.PhoneLookup.DISPLAY_NAME,
                ContactsContract.PhoneLookup.PHOTO_URI,
            )
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (!cursor.moveToFirst()) return null
                ContactBadge(
                    displayName = cursor.getString(0),
                    photoUri = cursor.getString(1),
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun initialsForName(name: String?): String? {
        val parts = name
            ?.trim()
            ?.split(Regex("\\s+"))
            ?.filter { it.isNotBlank() }
            ?: return null
        if (parts.isEmpty()) return null
        val initials = if (parts.size == 1) {
            parts.first().take(2)
        } else {
            parts.take(2).mapNotNull { it.firstOrNull()?.toString() }.joinToString("")
        }
        return initials.uppercase().takeIf { it.isNotBlank() }
    }
}
