package com.contact.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telecom.TelecomManager
import android.util.Log

/**
 * Intercepts Telecom's ACTION_SHOW_MISSED_CALLS_NOTIFICATION ordered broadcast.
 *
 * As the default dialer app, we must consume this broadcast and show our own
 * missed call notification.  Calling abortBroadcast() prevents the stock/
 * native dialer from receiving the event and posting its own notification,
 * which eliminates the duplicate missed-call notification problem.
 */
class MissedCallReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (TelecomManager.ACTION_SHOW_MISSED_CALLS_NOTIFICATION != intent.action) return

        val missedCallCount = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getIntExtra(TelecomManager.EXTRA_NOTIFICATION_COUNT, 1)
        } else {
            @Suppress("DEPRECATION")
            intent.getIntExtra(TelecomManager.EXTRA_NOTIFICATION_COUNT, 1)
        }

        val phoneNumber = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getStringExtra(TelecomManager.EXTRA_NOTIFICATION_PHONE_NUMBER)
        } else {
            @Suppress("DEPRECATION")
            intent.getStringExtra(TelecomManager.EXTRA_NOTIFICATION_PHONE_NUMBER)
        }

        Log.i("MissedCallReceiver", "Missed call broadcast: count=$missedCallCount number=$phoneNumber")

        InCallNotificationHelper.showMissedCallNotification(
            context,
            number = phoneNumber.orEmpty(),
            displayName = "",
        )

        abortBroadcast()
    }
}
