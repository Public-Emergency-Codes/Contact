package com.contact.app

import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.VideoProfile
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Singleton that holds a reference to the current active telecom [Call]
 * and bridges state changes to the React Native layer via DeviceEventEmitter.
 *
 * Populated by [EmergencySwitchInCallService] — lifetime matches the service.
 */
object CallManager {

    @Volatile private var activeCall: Call? = null
    @Volatile private var inCallService: EmergencySwitchInCallService? = null
    @Volatile private var reactContext: ReactApplicationContext? = null

    /**
     * When true, EmergencySwitchInCallService will not launch InCallUiActivity.
     * Set by the E911 screen while it is active so the call stays inside the app.
     */
    @Volatile var suppressInCallUi: Boolean = false
    @Volatile var e911CallRequested: Boolean = false
    @Volatile var e911CallRequestedAtMs: Long = 0L

    /**
     * Set by MainActivity when a missed call notification is tapped.
     * The JS side reads & clears this via InCallModule to navigate to
     * the Recent tab.
     */
    @Volatile var pendingMissedCallTab: String? = null

    // ── Context & service registration ─────────────────────────

    fun setReactContext(ctx: ReactApplicationContext) {
        reactContext = ctx
    }

    fun setInCallService(svc: EmergencySwitchInCallService?) {
        inCallService = svc
    }

    // ── Call lifecycle ──────────────────────────────────────────

    fun onCallAdded(call: Call) {
        activeCall = call
        e911CallRequested = true
        e911CallRequestedAtMs = System.currentTimeMillis()
    }

    fun onCallRemoved(call: Call) {
        if (activeCall == call) {
            activeCall = null
            e911CallRequested = false
            e911CallRequestedAtMs = 0L
        }
        // Always hide the return-to-call overlay when a call ends,
        // even if the React Native JS thread isn't running (app
        // backgrounded, etc.).  Safe to call when no overlay is showing.
        ReturnToCallOverlay.hide()
    }

    fun hasActiveCall(): Boolean = activeCall != null

    /** True only while Telecom still considers the call usable for audio. */
    fun hasOngoingCall(): Boolean {
        return when (activeCall?.state) {
            null, Call.STATE_DISCONNECTED, Call.STATE_DISCONNECTING -> false
            else -> true
        }
    }

    fun getActiveCall(): Call? = activeCall

    fun getCallState(): Int = activeCall?.state ?: Call.STATE_DISCONNECTED

    fun getActiveCallerName(): String = activeCall?.details?.callerDisplayName ?: ""

    fun getActiveNumber(): String = activeCall?.details?.handle?.schemeSpecificPart ?: ""

    fun isVideoCall(): Boolean {
        val state = activeCall?.details?.videoState ?: VideoProfile.STATE_AUDIO_ONLY
        return VideoProfile.isVideo(state)
    }

    // ── Call control ────────────────────────────────────────────

    /** Disconnect (hang up) the active call. Returns false if no active call. */
    fun endCall(): Boolean {
        e911CallRequested = false
        e911CallRequestedAtMs = 0L
        val call = activeCall ?: return false
        call.disconnect()
        return true
    }

    /** Answer an incoming call. Returns false if there is no active ringing call. */
    fun answerCall(): Boolean {
        val call = activeCall ?: return false
        if (call.state != Call.STATE_RINGING) return false
        val requestedVideoState = call.details?.videoState ?: VideoProfile.STATE_AUDIO_ONLY
        call.answer(requestedVideoState)
        return true
    }

    /** Mute or un-mute the microphone for the active call. */
    fun setMuted(muted: Boolean) {
        inCallService?.setMuted(muted)
    }

    /** Switch call audio route (e.g. ROUTE_SPEAKER=8, ROUTE_EARPIECE=1). Returns true if InCallService was available. */
    fun setAudioRoute(route: Int): Boolean {
        val svc = inCallService
        if (svc == null) return false
        svc.setAudioRoute(route)
        return true
    }

    /** Current Telecom audio route if available, defaulting to earpiece. */
    fun getCurrentAudioRoute(): Int {
        return inCallService?.callAudioState?.route ?: CallAudioState.ROUTE_EARPIECE
    }

    /** Current mute state from Telecom audio state. */
    fun getIsMuted(): Boolean {
        return inCallService?.callAudioState?.isMuted ?: false
    }

    /** Put the active call on hold or resume it. */
    fun setOnHold(hold: Boolean) {
        val call = activeCall ?: return
        if (hold) call.hold() else call.unhold()
    }

    // ── Event emission ──────────────────────────────────────────

    fun emitCallAdded(state: String, number: String) {
        val map = Arguments.createMap().apply {
            putString("state", state)
            putString("number", number)
        }
        emit("onCallAdded", map)
    }

    fun emitCallRemoved() = emit("onCallRemoved", null)

    fun emitStateChanged(state: String) {
        val map = Arguments.createMap().apply { putString("state", state) }
        emit("onCallStateChanged", map)
    }

    private fun emit(event: String, payload: WritableMap?) {
        reactContext
            ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(event, payload)
    }
}
