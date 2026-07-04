package com.contact.app

import android.annotation.SuppressLint
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telecom.TelecomManager
import android.telecom.VideoProfile
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * React Native bridge for Android Telecom call control.
 *
 * Exposes:
 *  - endCall()            — hang up the active call via InCallService
 *  - muteCall(muted)      — mute / un-mute microphone
 *  - holdCall(hold)       — hold / resume active call
 *  - hasActiveCall()      — returns Boolean
 *  - isDefaultDialer()    — returns Boolean
 *  - requestDefaultDialer() — shows system dialog to set app as default phone app
 *  - placeCall(number)       — place a call through TelecomManager (preferred over Linking)
 *  - placeVideoCall(number)   — place a call with bidirectional video requested
 *
 * Events emitted via DeviceEventEmitter (through CallManager):
 *  - onCallAdded    { state: string, number: string }
 *  - onCallRemoved  {}
 *  - onCallStateChanged { state: string }
 */
class InCallModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private var pendingDialerRolePromise: Promise? = null
    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: android.app.Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != REQUEST_CODE_DIALER) return
            val pending = pendingDialerRolePromise ?: return
            pendingDialerRolePromise = null
            val telecomManager = reactContext.getSystemService(TelecomManager::class.java)
            pending.resolve(telecomManager?.defaultDialerPackage == reactContext.packageName)
        }
    }

    init {
        CallManager.setReactContext(reactContext)
        reactContext.addActivityEventListener(activityEventListener)
    }

    override fun getName() = "InCallModule"

    // ── Missed-call navigation ──────────────────────────────────

    @ReactMethod
    fun getPendingMissedCallTab(promise: Promise) {
        val tab = CallManager.pendingMissedCallTab
        CallManager.pendingMissedCallTab = null
        promise.resolve(tab)
    }

    // ── Call control ────────────────────────────────────────────

    @ReactMethod
    fun endCall(promise: Promise) {
        try {
            promise.resolve(CallManager.endCall())
        } catch (e: Exception) {
            promise.reject("END_CALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun muteCall(muted: Boolean, promise: Promise) {
        try {
            CallManager.setMuted(muted)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MUTE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun holdCall(hold: Boolean, promise: Promise) {
        try {
            CallManager.setOnHold(hold)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("HOLD_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun hasActiveCall(promise: Promise) {
        try {
            val tm = reactContext.getSystemService(TelecomManager::class.java)
            promise.resolve(CallManager.hasActiveCall() || tm?.isInCall == true)
        } catch (_: Exception) {
            promise.resolve(CallManager.hasActiveCall())
        }
    }

    // ── Dialer role ─────────────────────────────────────────────

    @ReactMethod
    fun isDefaultDialer(promise: Promise) {
        try {
            val tm = reactContext.getSystemService(TelecomManager::class.java)
            promise.resolve(tm?.defaultDialerPackage == reactContext.packageName)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestDefaultDialer(promise: Promise) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No foreground activity"); return
        }
        activity.runOnUiThread {
            try {
                val telecomManager = activity.getSystemService(TelecomManager::class.java)
                if (telecomManager?.defaultDialerPackage == activity.packageName) {
                    promise.resolve(true)
                    return@runOnUiThread
                }
                pendingDialerRolePromise?.reject("DIALER_ROLE_REPLACED", "A newer dialer role request replaced this one")
                pendingDialerRolePromise = promise
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val rm = activity.getSystemService(RoleManager::class.java)
                    if (rm != null) {
                        activity.startActivityForResult(
                            rm.createRequestRoleIntent(RoleManager.ROLE_DIALER),
                            REQUEST_CODE_DIALER
                        )
                    } else {
                        pendingDialerRolePromise = null
                        promise.resolve(false)
                    }
                } else {
                    activity.startActivityForResult(
                        Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
                            .putExtra(
                                TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME,
                                activity.packageName
                            ),
                        REQUEST_CODE_DIALER
                    )
                }
            } catch (e: Exception) {
                pendingDialerRolePromise = null
                promise.reject("DIALER_ROLE_ERROR", e.message, e)
            }
        }
    }

    // ── Place call ──────────────────────────────────────────────

    /**
     * Places a call via TelecomManager — preferred when the app IS the default
     * dialer because it properly triggers InCallService binding without
     * switching apps.  Falls back gracefully if permission is denied.
     */
    @ReactMethod
    fun placeCall(number: String, promise: Promise) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No foreground activity"); return
        }
        try {
            ensureInCallServiceEnabled(activity)
            val tm = activity.getSystemService(TelecomManager::class.java)
            val uri = Uri.fromParts("tel", number, null)

            // If we are the default dialer, have CALL_PHONE, or have
            // MANAGE_OWN_CALLS, use TelecomManager directly — the call
            // connects and our InCallService handles the UI, keeping
            // the user inside the E911 screen.
            val hasCallPhone = try {
                activity.checkSelfPermission(android.Manifest.permission.CALL_PHONE) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
            } catch (_: Exception) { false }
            val isDefaultDialer = tm?.defaultDialerPackage == activity.packageName
            val hasManageOwnCalls = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    activity.checkSelfPermission(android.Manifest.permission.MANAGE_OWN_CALLS) ==
                        android.content.pm.PackageManager.PERMISSION_GRANTED
                } catch (_: Exception) { false }
            } else false

            if (tm != null && (isDefaultDialer || hasCallPhone || hasManageOwnCalls)) {
                tm.placeCall(uri, Bundle.EMPTY)
                promise.resolve(true)
                return
            }

            // Not in a position to place the call ourselves — open the
            // dialer with the number pre-filled via ACTION_DIAL.
            // This does NOT auto-dial and does NOT show a chooser.
            promise.resolve(startCallIntent(activity, number))
        } catch (e: SecurityException) {
            promise.resolve(startCallIntent(activity, number))
        } catch (e: Exception) {
            promise.reject("PLACE_CALL_ERROR", e.message, e)
        }
    }

    /**
     * Places a voice call for the E911 React screen without handing UI control
     * to a dialer activity. The E911 screen remains the foreground call UI.
     */
    @ReactMethod
    fun placeE911Call(number: String, promise: Promise) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No foreground activity"); return
        }
        try {
            CallManager.suppressInCallUi = true
            ensureInCallServiceEnabled(activity)
            val tm = activity.getSystemService(TelecomManager::class.java) ?: run {
                promise.resolve(false)
                return
            }
            // Returning to an existing E911 session must never ask Telecom to
            // place another cellular call. Telecom may report the live call
            // before our InCallService callback has populated CallManager.
            if (CallManager.hasActiveCall() || tm.isInCall) {
                promise.resolve(true)
                return
            }
            val now = System.currentTimeMillis()
            val requestStillPending =
                CallManager.e911CallRequested &&
                    now - CallManager.e911CallRequestedAtMs < E911_CALL_REQUEST_TIMEOUT_MS
            if (requestStillPending) {
                promise.resolve(true)
                return
            }
            CallManager.e911CallRequested = false
            CallManager.e911CallRequestedAtMs = 0L
            val hasCallPhone = try {
                activity.checkSelfPermission(android.Manifest.permission.CALL_PHONE) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
            } catch (_: Exception) { false }
            val hasManageOwnCalls = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    activity.checkSelfPermission(android.Manifest.permission.MANAGE_OWN_CALLS) ==
                        android.content.pm.PackageManager.PERMISSION_GRANTED
                } catch (_: Exception) { false }
            } else false
            if (tm.defaultDialerPackage != activity.packageName && !hasCallPhone && !hasManageOwnCalls) {
                promise.resolve(false)
                return
            }
            CallManager.e911CallRequested = true
            CallManager.e911CallRequestedAtMs = now
            tm.placeCall(Uri.fromParts("tel", number, null), Bundle.EMPTY)
            Handler(Looper.getMainLooper()).postDelayed({
                if (!CallManager.hasActiveCall() && !tm.isInCall) {
                    CallManager.e911CallRequested = false
                    CallManager.e911CallRequestedAtMs = 0L
                }
            }, E911_CALL_REQUEST_TIMEOUT_MS)
            promise.resolve(true)
        } catch (_: SecurityException) {
            CallManager.e911CallRequested = false
            CallManager.e911CallRequestedAtMs = 0L
            promise.resolve(false)
        } catch (e: Exception) {
            CallManager.e911CallRequested = false
            CallManager.e911CallRequestedAtMs = 0L
            promise.reject("PLACE_E911_CALL_ERROR", e.message, e)
        }
    }

    /**
     * Places a call with bidirectional video requested.
     */
    @ReactMethod
    fun placeVideoCall(number: String, promise: Promise) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No foreground activity"); return
        }
        try {
            val launchedExternal = startVideoCallIntent(activity, number)
            promise.resolve(launchedExternal)
        } catch (e: SecurityException) {
            try {
                val launched = startVideoCallIntent(activity, number)
                promise.resolve(launched)
            } catch (inner: Exception) {
                promise.reject("PLACE_VIDEO_CALL_ERROR", inner.message, inner)
            }
        } catch (e: Exception) {
            promise.reject("PLACE_VIDEO_CALL_ERROR", e.message, e)
        }
    }

    private fun putVideoExtras(extras: Bundle) {
        extras.putInt(TelecomManager.EXTRA_START_CALL_WITH_VIDEO_STATE, VideoProfile.STATE_BIDIRECTIONAL)
        extras.putInt("android.telecom.extra.START_CALL_WITH_VIDEO_STATE", VideoProfile.STATE_BIDIRECTIONAL)
        extras.putBoolean("android.telecom.extra.IS_VIDEO_CALL", true)
        extras.putBoolean("videocall", true)
    }

    private fun startCallIntent(activity: android.app.Activity, number: String): Boolean {
        // ACTION_DIAL opens the native dialer with the number pre-filled.
        // It does NOT auto-dial, so Android never shows a "Complete action
        // using" chooser — the dialer is the only app that can handle it.
        try {
            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$number")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            return true
        } catch (_: Exception) {}
        return false
    }

    private fun startVideoCallIntent(activity: android.app.Activity, number: String): Boolean {
        val telUri = Uri.parse("tel:$number")
        val attempts = listOf(
            ComponentName("com.android.dialer", "com.android.dialer.precall.externalreceiver.LaunchPreCallActivity") to "com.android.dialer.LAUNCH_PRE_CALL",
            ComponentName("com.google.android.dialer", "com.android.dialer.precall.externalreceiver.LaunchPreCallActivity") to "com.android.dialer.LAUNCH_PRE_CALL",
            ComponentName("com.android.dialer", "com.android.dialer.main.impl.MainActivity") to Intent.ACTION_DIAL,
            ComponentName("com.google.android.dialer", "com.android.dialer.main.impl.MainActivity") to Intent.ACTION_DIAL
        )

        val inCallServiceComponent = ComponentName(activity, EmergencySwitchInCallService::class.java)
        val pm = activity.packageManager
        val originalState = pm.getComponentEnabledSetting(inCallServiceComponent)

        try {
            pm.setComponentEnabledSetting(
                inCallServiceComponent,
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            )

            for ((component, action) in attempts) {
                if (component.packageName == activity.packageName) continue
                try {
                    val intent = Intent(action, telUri).apply {
                        setComponent(component)
                        putExtra(Intent.EXTRA_PHONE_NUMBER, number)
                        putExtra(TelecomManager.EXTRA_START_CALL_WITH_VIDEO_STATE, VideoProfile.STATE_BIDIRECTIONAL)
                        putExtra("android.telecom.extra.START_CALL_WITH_VIDEO_STATE", VideoProfile.STATE_BIDIRECTIONAL)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    activity.startActivity(intent)
                    return true
                } catch (_: Exception) {
                }
            }
        } finally {
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    val restore = if (originalState == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) {
                        PackageManager.COMPONENT_ENABLED_STATE_DEFAULT
                    } else {
                        PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    }
                    pm.setComponentEnabledSetting(
                        inCallServiceComponent,
                        restore,
                        PackageManager.DONT_KILL_APP
                    )
                } catch (_: Exception) {
                }
            }, 5000)
        }

        return false
    }

    private fun ensureInCallServiceEnabled(activity: android.app.Activity) {
        try {
            val component = ComponentName(activity, EmergencySwitchInCallService::class.java)
            activity.packageManager.setComponentEnabledSetting(
                component,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            )
        } catch (_: Exception) {
        }
    }

    /** Bring this app's native ongoing-call UI to the foreground. */
    @ReactMethod
    fun openInCallUI(promise: Promise) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No foreground activity"); return
        }
        val flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT

        try {
            activity.startActivity(Intent(activity, InCallUiActivity::class.java).also { it.addFlags(flags) })
            promise.resolve(true)
            return
        } catch (_: Exception) {}

        try {
            val tm = activity.getSystemService(TelecomManager::class.java)
            val pkg = tm?.defaultDialerPackage
            if (pkg != null) {
                val launch = activity.packageManager.getLaunchIntentForPackage(pkg)
                if (launch != null) {
                    launch.addFlags(flags)
                    activity.startActivity(launch)
                    promise.resolve(true)
                    return
                }
            }
        } catch (_: Exception) {}

        try {
            activity.startActivity(Intent(Intent.ACTION_DIAL).also { it.addFlags(flags) })
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_INCALL_UI_ERROR", e.message, e)
        }
    }

    // ── Event listener stubs (required by RN) ───────────────────

    // ── Call capability checks ─────────────────────────────────

    /**
     * Returns true if the app can place calls in-app (default dialer
     * or MANAGE_OWN_CALLS granted).  When false, placeCall() will fall
     * back to ACTION_DIAL which opens the dialer pre-filled externally.
     */
    @ReactMethod
    fun canPlaceCallInApp(promise: Promise) {
        try {
            val tm = reactContext.getSystemService(TelecomManager::class.java)
            val isDefault = tm?.defaultDialerPackage == reactContext.packageName
            if (isDefault) { promise.resolve(true); return }

            // CALL_PHONE allows TelecomManager.placeCall() on all versions.
            val hasCallPhone = try {
                reactContext.checkSelfPermission(android.Manifest.permission.CALL_PHONE) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
            } catch (_: Exception) { false }
            if (hasCallPhone) { promise.resolve(true); return }

            // MANAGE_OWN_CALLS allows TelecomManager.placeCall() without
            // being the default dialer (Android 10+).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val granted = try {
                    reactContext.checkSelfPermission(android.Manifest.permission.MANAGE_OWN_CALLS) ==
                        android.content.pm.PackageManager.PERMISSION_GRANTED
                } catch (_: Exception) { false }
                promise.resolve(granted)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Opens the system Settings page for MANAGE_OWN_CALLS so the user
     * can grant permission without making the app the default dialer.
     * Only meaningful on Android 10+.
     */
    @ReactMethod
    fun requestManageOwnCalls(promise: Promise) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No foreground activity"); return
        }
        try {
            val intent = Intent("android.settings.MANAGE_OWN_CALLS_SETTINGS").apply {
                data = Uri.parse("package:${activity.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MANAGE_OWN_CALLS_ERROR", e.message, e)
        }
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod
    fun canShowReturnWidget(promise: Promise) {
        promise.resolve(ReturnToCallOverlay.canDraw(reactContext))
    }

    @ReactMethod
    fun requestReturnWidgetPermission(promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactContext.packageName}")
            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_PERMISSION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun showReturnWidget(
        title: String,
        subtitle: String,
        callActive: Boolean,
        emergency: Boolean,
        profilePhotoUri: String?,
        promise: Promise
    ) {
        Handler(Looper.getMainLooper()).post {
            promise.resolve(
                ReturnToCallOverlay.show(
                    reactContext,
                    title,
                    subtitle,
                    callActive,
                    emergency,
                    profilePhotoUri,
                )
            )
        }
    }

    @ReactMethod
    fun hideReturnWidget(promise: Promise) {
        Handler(Looper.getMainLooper()).post {
            ReturnToCallOverlay.hide()
            promise.resolve(true)
        }
    }

    /** Called by the E911 screen to prevent InCallUiActivity from launching while it is active. */
    @ReactMethod
    fun setSuppressInCallUi(suppress: Boolean, promise: Promise) {
        CallManager.suppressInCallUi = suppress
        promise.resolve(true)
    }

    companion object {
        private const val REQUEST_CODE_DIALER = 9001
        private const val E911_CALL_REQUEST_TIMEOUT_MS = 10_000L
    }

    override fun invalidate() {
        reactContext.removeActivityEventListener(activityEventListener)
        pendingDialerRolePromise?.reject("MODULE_INVALIDATED", "InCallModule was invalidated")
        pendingDialerRolePromise = null
        super.invalidate()
    }
}
