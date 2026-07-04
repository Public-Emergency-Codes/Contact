package com.contact.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.ContactsContract
import android.os.Build
import android.telecom.Call
import android.telecom.CallAudioState
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object InCallNotificationHelper {
    const val CHANNEL_ID = "incall_ongoing_channel"
    private const val CHANNEL_SILENT_ID = "incall_silent_channel"
    private const val CHANNEL_NAME = "Ongoing Calls"
    private const val CHANNEL_DESC = "Active and incoming call controls"
    const val NOTIF_ID = 42011

    const val MISSED_CALL_CHANNEL_ID = "missed_calls"
    private const val MISSED_CALL_CHANNEL_NAME = "Missed Calls"
    const val MISSED_CALL_NOTIF_ID_BASE = 43000
    const val ACTION_OPEN_MISSED_CALL = "com.contact.app.ACTION_OPEN_MISSED_CALL"
    const val EXTRA_MISSED_CALL_NUMBER = "missed_call_number"

    private var activeSinceMs: Long = 0L
    @Volatile var isUiVisible: Boolean = false

    private data class CallerIdentity(
        val displayName: String,
        val number: String,
    )

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
                description = CHANNEL_DESC
                setShowBadge(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            })
        }
        if (nm.getNotificationChannel(CHANNEL_SILENT_ID) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL_SILENT_ID, "$CHANNEL_NAME (silent)", NotificationManager.IMPORTANCE_LOW).apply {
                description = CHANNEL_DESC
                setShowBadge(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                setSound(null, null)
                enableVibration(false)
            })
        }
        if (nm.getNotificationChannel(MISSED_CALL_CHANNEL_ID) == null) {
            nm.createNotificationChannel(NotificationChannel(MISSED_CALL_CHANNEL_ID, MISSED_CALL_CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Notifications for missed calls"
                setShowBadge(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                enableVibration(true)
            })
        }
    }

    private fun activeChannelId() = if (isUiVisible) CHANNEL_SILENT_ID else CHANNEL_ID

    private fun actionPendingIntent(context: Context, action: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, InCallNotificationActionReceiver::class.java).apply {
            this.action = action
            `package` = context.packageName
        }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun contentPendingIntent(context: Context, call: Call?): PendingIntent {
        val number = call?.details?.handle?.schemeSpecificPart ?: ""
        val intent = Intent(context, InCallUiActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("number", number)
        }
        return PendingIntent.getActivity(
            context,
            999,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun onStateChangedForTimer(state: Int) {
        if (state == Call.STATE_ACTIVE && activeSinceMs == 0L) activeSinceMs = System.currentTimeMillis()
        if (state == Call.STATE_DISCONNECTED || state == Call.STATE_DISCONNECTING) activeSinceMs = 0L
    }

    private fun lookupContactName(context: Context, number: String): String {
        if (number.isBlank()) return ""
        val hasReadContacts = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
        if (!hasReadContacts) return ""

        val lookupUri = ContactsContract.PhoneLookup.CONTENT_FILTER_URI.buildUpon()
            .appendPath(android.net.Uri.encode(number))
            .build()

        return try {
            context.contentResolver.query(
                lookupUri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null,
                null,
                null,
            )?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0).orEmpty() else ""
            }.orEmpty()
        } catch (_: Exception) {
            ""
        }
    }

    private fun resolveCallerIdentity(context: Context, call: Call?): CallerIdentity {
        val rawNumber = CallManager.getActiveNumber().ifBlank { call?.details?.handle?.schemeSpecificPart ?: "" }.trim()
        val telecomName = CallManager.getActiveCallerName().ifBlank { call?.details?.callerDisplayName ?: "" }.trim()
        val lookupName = lookupContactName(context, rawNumber).trim()

        val rawName = telecomName.ifBlank { lookupName }
        val hasDistinctName = rawName.isNotBlank() && !rawName.equals(rawNumber, ignoreCase = true)
        return CallerIdentity(
            displayName = if (hasDistinctName) rawName else rawNumber.ifBlank { "Unknown caller" },
            number = rawNumber,
        )
    }

    private fun stateLine(state: Int): String {
        return when (state) {
            Call.STATE_RINGING -> "Incoming call"
            Call.STATE_DIALING -> "Calling"
            Call.STATE_HOLDING -> "On hold"
            else -> ""
        }
    }

    @SuppressLint("MissingPermission")
    private fun buildCompatNotification(context: Context, call: Call?, state: Int, caller: CallerIdentity): Notification {
        val title = caller.displayName
        val status = stateLine(state)
        val showNumber = caller.number.isNotBlank() && !caller.number.equals(caller.displayName, ignoreCase = true)
        val text = when {
            status.isBlank() && showNumber -> caller.number
            status.isBlank() -> null
            showNumber -> "$status \u2022 ${caller.number}"
            else -> status
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_SILENT_ID)
            .setSmallIcon(android.R.drawable.sym_call_outgoing)
            .setContentTitle(title)
            .setContentText(text)
            .setSubText(null)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentPendingIntent(context, call))
            .setAutoCancel(false)

        if (state == Call.STATE_ACTIVE && activeSinceMs > 0L) {
            builder.setUsesChronometer(true)
            builder.setWhen(activeSinceMs)
            builder.setShowWhen(true)
        }

        if (state == Call.STATE_RINGING) {
            builder.addAction(android.R.drawable.ic_menu_call, "Answer", actionPendingIntent(context, EmergencySwitchInCallService.ACTION_ANSWER, 1001))
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", actionPendingIntent(context, EmergencySwitchInCallService.ACTION_END, 1002))
        } else {
            val route = CallManager.getCurrentAudioRoute()
            val speakerOn = route and CallAudioState.ROUTE_SPEAKER != 0
            val muted = CallManager.getIsMuted()
            builder.addAction(android.R.drawable.ic_lock_silent_mode_off, if (muted) "Unmute" else "Mute", actionPendingIntent(context, EmergencySwitchInCallService.ACTION_TOGGLE_MUTE, 1003))
            builder.addAction(android.R.drawable.ic_btn_speak_now, if (speakerOn) "Speaker off" else "Speaker on", actionPendingIntent(context, EmergencySwitchInCallService.ACTION_TOGGLE_SPEAKER, 1004))
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "End", actionPendingIntent(context, EmergencySwitchInCallService.ACTION_END, 1005))
        }

        return builder.build()
    }

    @SuppressLint("MissingPermission")
    private fun buildCallStyleNotification(context: Context, call: Call?, state: Int, caller: CallerIdentity): Notification {
        val personBuilder = Person.Builder().setName(caller.displayName)
        if (caller.number.isNotBlank()) {
            personBuilder.setUri("tel:${caller.number}")
        }
        val person = personBuilder.build()
        val fullScreenPi = contentPendingIntent(context, call)
        val endPi = actionPendingIntent(context, EmergencySwitchInCallService.ACTION_END, 1005)
        val status = stateLine(state)
        val showNumber = caller.number.isNotBlank() && !caller.number.equals(caller.displayName, ignoreCase = true)
        val text = when {
            status.isBlank() -> if (showNumber) caller.number else null
            showNumber -> "$status \u2022 ${caller.number}"
            else -> status
        }

        val builder = Notification.Builder(context, CHANNEL_SILENT_ID)
            .setSmallIcon(android.R.drawable.sym_call_outgoing)
            .setContentTitle(caller.displayName)
            .setContentText(text)
            .setSubText(null)
            .setCategory(Notification.CATEGORY_CALL)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(fullScreenPi)

        if (state == Call.STATE_ACTIVE && activeSinceMs > 0L) {
            builder.setUsesChronometer(true)
            builder.setWhen(activeSinceMs)
            builder.setShowWhen(true)
        }

        if (state == Call.STATE_RINGING) {
            val declinePi = actionPendingIntent(context, EmergencySwitchInCallService.ACTION_END, 1002)
            val answerPi = actionPendingIntent(context, EmergencySwitchInCallService.ACTION_ANSWER, 1001)
            builder.setStyle(Notification.CallStyle.forIncomingCall(person, declinePi, answerPi))
        } else {
            builder.setStyle(Notification.CallStyle.forOngoingCall(person, endPi))
            val route = CallManager.getCurrentAudioRoute()
            val speakerOn = route and CallAudioState.ROUTE_SPEAKER != 0
            val muted = CallManager.getIsMuted()
            builder.addAction(Notification.Action.Builder(null, if (muted) "Unmute" else "Mute", actionPendingIntent(context, EmergencySwitchInCallService.ACTION_TOGGLE_MUTE, 1003)).build())
            builder.addAction(Notification.Action.Builder(null, if (speakerOn) "Speaker off" else "Speaker on", actionPendingIntent(context, EmergencySwitchInCallService.ACTION_TOGGLE_SPEAKER, 1004)).build())
        }
        return builder.build()
    }

    fun buildForCallService(context: Context, call: Call?): Notification {
        ensureChannel(context)
        val state = CallManager.getCallState()
        val caller = resolveCallerIdentity(context, call)
        onStateChangedForTimer(state)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            buildCallStyleNotification(context, call, state, caller)
        } else {
            buildCompatNotification(context, call, state, caller)
        }
    }

    @SuppressLint("MissingPermission")
    fun showOrUpdate(context: Context, call: Call?) {
        try {
            NotificationManagerCompat.from(context).notify(NOTIF_ID, buildForCallService(context, call))
        } catch (_: IllegalArgumentException) {
            val state = CallManager.getCallState()
            val caller = resolveCallerIdentity(context, call)
            onStateChangedForTimer(state)
            NotificationManagerCompat.from(context).notify(NOTIF_ID, buildCompatNotification(context, call, state, caller))
        }
    }

    fun showMissedCallNotification(context: Context, number: String, displayName: String) {
        ensureChannel(context)

        val contactName = displayName.ifBlank {
            lookupContactName(context, number)
        }.ifBlank { number.ifBlank { "Unknown caller" } }

        val title = "Missed call"
        val text = if (contactName == number || contactName == "Unknown caller") {
            contactName
        } else {
            "$contactName \u2022 $number"
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            action = ACTION_OPEN_MISSED_CALL
            putExtra(EXTRA_MISSED_CALL_NUMBER, number)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            `package` = context.packageName
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            System.currentTimeMillis().toInt() and Int.MAX_VALUE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, MISSED_CALL_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.sym_call_missed)
            .setContentTitle(title)
            .setContentText(text)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val notifId = MISSED_CALL_NOTIF_ID_BASE + (number.hashCode() and 0x7FFF)
        try {
            NotificationManagerCompat.from(context).notify(notifId, notification)
        } catch (e: Exception) {
            android.util.Log.e("InCallNotificationHelper", "Failed to show missed call notification", e)
        }
    }

    fun cancel(context: Context) {
        activeSinceMs = 0L
        NotificationManagerCompat.from(context).cancel(NOTIF_ID)
    }
}
