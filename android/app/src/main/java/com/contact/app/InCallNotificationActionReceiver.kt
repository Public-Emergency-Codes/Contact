package com.contact.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telecom.Call
import android.telecom.CallAudioState

class InCallNotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            EmergencySwitchInCallService.ACTION_ANSWER -> {
                CallManager.answerCall()
            }

            EmergencySwitchInCallService.ACTION_END -> {
                CallManager.endCall()
            }

            EmergencySwitchInCallService.ACTION_TOGGLE_MUTE -> {
                val newMuted = !CallManager.getIsMuted()
                CallManager.setMuted(newMuted)
            }

            EmergencySwitchInCallService.ACTION_TOGGLE_SPEAKER -> {
                val route = CallManager.getCurrentAudioRoute()
                val speakerOn = route and CallAudioState.ROUTE_SPEAKER != 0
                val target = if (speakerOn) CallAudioState.ROUTE_EARPIECE else CallAudioState.ROUTE_SPEAKER
                CallManager.setAudioRoute(target)
            }
        }

        if (CallManager.getCallState() == Call.STATE_DISCONNECTED) {
            InCallNotificationHelper.cancel(context)
        } else {
            InCallNotificationHelper.showOrUpdate(context, CallManager.getActiveCall())
        }
    }
}
