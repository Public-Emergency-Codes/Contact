package com.contact.app

import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.telecom.Call
import android.telecom.InCallService

/**
 * Android InCallService implementation that replaces the stock AOSP call UI.
 *
 * When this app is set as the default phone app (via RoleManager.ROLE_DIALER on
 * Android 10+ or TelecomManager.ACTION_CHANGE_DEFAULT_DIALER on older versions),
 * the Telecom framework binds this service for every incoming and outgoing call,
 * giving us full programmatic control:
 *   - Hang up via [CallManager.endCall]
 *   - Mute via [CallManager.setMuted]
 *   - Hold/resume via [CallManager.setOnHold]
 *
 * State changes are forwarded to the React Native layer through [CallManager]
 * so the E911 call screen can react to call events in real time.
 */
class EmergencySwitchInCallService : InCallService() {

    @Volatile private var lastUiLaunchState: Int = -1
    @Volatile private var lastUiLaunchAtMs: Long = 0L

    private val answeredCalls = mutableSetOf<Call>()

    private fun shouldLaunchUiForState(state: Int): Boolean {
        val shouldShow =
            state == Call.STATE_RINGING ||
            state == Call.STATE_DIALING ||
            state == Call.STATE_ACTIVE
        if (!shouldShow) return false

        val now = System.currentTimeMillis()
        val sameStateTooSoon = state == lastUiLaunchState && (now - lastUiLaunchAtMs) < 1200L
        if (sameStateTooSoon) return false

        lastUiLaunchState = state
        lastUiLaunchAtMs = now
        return true
    }

    private fun launchInCallUi(call: Call?) {
        if (CallManager.suppressInCallUi) return
        val uiIntent = Intent(this, InCallUiActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            putExtra("number", call?.details?.handle?.schemeSpecificPart ?: "")
        }
        startActivity(uiIntent)
    }

    private val callCallback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            if (state == Call.STATE_ACTIVE) {
                answeredCalls.add(call)
            }
            CallManager.emitStateChanged(stateToString(state))
            pushCallNotification(call)
            if (shouldLaunchUiForState(state)) {
                launchInCallUi(call)
            }
        }
        override fun onDetailsChanged(call: Call, details: Call.Details) {
            CallManager.emitStateChanged(stateToString(call.state))
        }
    }

    // ── InCallService lifecycle ─────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        CallManager.setInCallService(this)
    }

    override fun onDestroy() {
        CallManager.setInCallService(null)
        super.onDestroy()
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        lastUiLaunchState = -1
        lastUiLaunchAtMs = 0L
        CallManager.onCallAdded(call)
        call.registerCallback(callCallback)
        pushCallNotification(call)
        launchInCallUi(call)
        CallManager.emitCallAdded(
            state  = stateToString(call.state),
            number = call.details?.handle?.schemeSpecificPart ?: ""
        )
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        lastUiLaunchState = -1
        lastUiLaunchAtMs = 0L
        call.unregisterCallback(callCallback)
        CallManager.onCallRemoved(call)

        answeredCalls.remove(call)

        @Suppress("DEPRECATION")
        stopForeground(true)
        InCallNotificationHelper.cancel(this)
        CallManager.emitCallRemoved()
    }

    private fun pushCallNotification(call: Call?) {
        val n = InCallNotificationHelper.buildForCallService(this, call)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(InCallNotificationHelper.NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
            } else {
                @Suppress("DEPRECATION")
                startForeground(InCallNotificationHelper.NOTIF_ID, n)
            }
        } catch (_: Throwable) {
            InCallNotificationHelper.showOrUpdate(this, call)
        }
    }

    // ── Helpers ─────────────────────────────────────────────────

    companion object {
        const val ACTION_ANSWER = "com.contact.app.ACTION_ANSWER"
        const val ACTION_END = "com.contact.app.ACTION_END"
        const val ACTION_TOGGLE_MUTE = "com.contact.app.ACTION_TOGGLE_MUTE"
        const val ACTION_TOGGLE_SPEAKER = "com.contact.app.ACTION_TOGGLE_SPEAKER"

        fun stateToString(state: Int): String = when (state) {
            Call.STATE_ACTIVE        -> "ACTIVE"
            Call.STATE_DIALING       -> "DIALING"
            Call.STATE_RINGING       -> "RINGING"
            Call.STATE_DISCONNECTED  -> "DISCONNECTED"
            Call.STATE_DISCONNECTING -> "DISCONNECTING"
            Call.STATE_HOLDING       -> "HOLDING"
            Call.STATE_CONNECTING    -> "CONNECTING"
            else                     -> "UNKNOWN"
        }
    }
}
