package com.contact.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.ContactsContract
import android.provider.Telephony
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Required by Android to be set as the default SMS app.
 *
 * Receives the SMS_DELIVER broadcast (only delivered to the default SMS app)
 * and handles the incoming message end-to-end:
 *   1. Writes the message to the system SMS content provider
 *   2. Shows a heads-up notification
 *   3. Emits an event to the React Native JS layer
 *   4. Forwards a private broadcast so SmsObserverModule (PSAP monitoring) can react
 */
class SmsDeliverReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SmsDeliverReceiver"
        private const val CHANNEL_ID = "incoming_messages"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_DELIVER_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        Log.d(TAG, "SMS_DELIVER received: ${messages.size} message(s)")

        for (sms in messages) {
            val address = sms.originatingAddress ?: continue
            val body = sms.messageBody ?: ""
            val timestamp = sms.timestampMillis

            // 1. Write to the system SMS provider — required for a default SMS app
            writeToProvider(context, address, body, timestamp)

            // 2. Show notification
            showNotification(context, address, body)

            // 3. Notify the React Native JS layer
            emitToJs(context, address, body, timestamp)
        }

        // Forward to SmsObserverModule for PSAP (911) monitoring
        val forward = Intent("com.contact.app.PRIVATE_SMS_DELIVER").apply {
            setPackage(context.packageName)
            putExtras(intent)
        }
        context.sendBroadcast(forward)
    }

    private fun writeToProvider(context: Context, address: String, body: String, timestamp: Long) {
        try {
            val values = ContentValues().apply {
                put(Telephony.Sms.ADDRESS, address)
                put(Telephony.Sms.BODY, body)
                put(Telephony.Sms.DATE, timestamp)
                put(Telephony.Sms.READ, 0)
                put(Telephony.Sms.TYPE, Telephony.Sms.MESSAGE_TYPE_INBOX)
            }
            val uri = context.contentResolver.insert(Telephony.Sms.CONTENT_URI, values)
            Log.d(TAG, "Wrote SMS to provider: uri=$uri address=$address")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write SMS to provider", e)
        }
    }

    private fun showNotification(context: Context, address: String, body: String) {
        try {
            ensureChannel(context)

            val displayName = lookupContactName(context, address)
            val title = displayName.ifBlank { address }

            val openIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("openThreadAddress", address)
            }
            val contentIntent = PendingIntent.getActivity(
                context,
                address.hashCode(),
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val text = body.ifBlank { "New message" }
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.sym_action_chat)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .build()

            NotificationManagerCompat.from(context).notify(address.hashCode(), notification)
            Log.d(TAG, "Notification posted for $title ($address)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show notification", e)
        }
    }

    /**
     * Look up the contact display name for a phone number.
     * Falls back to empty string if READ_CONTACTS is not granted or no contact matches.
     */
    private fun lookupContactName(context: Context, number: String): String {
        if (number.isBlank()) return ""
        val hasPermission = ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_CONTACTS
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasPermission) return ""

        val uri = ContactsContract.PhoneLookup.CONTENT_FILTER_URI.buildUpon()
            .appendPath(android.net.Uri.encode(number))
            .build()

        return try {
            context.contentResolver.query(
                uri,
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null, null, null,
            )?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0).orEmpty() else ""
            }.orEmpty()
        } catch (_: Exception) {
            ""
        }
    }

    private fun emitToJs(context: Context, address: String, body: String, timestamp: Long) {
        try {
            val reactContext = (context.applicationContext as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext

            if (reactContext != null && reactContext.hasActiveReactInstance()) {
                val params = Arguments.createMap().apply {
                    putString("address", address)
                    putString("body", body)
                    putDouble("timestamp", timestamp.toDouble())
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onSmsReceived", params)
                Log.d(TAG, "Emitted onSmsReceived to JS: $address")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit to JS", e)
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Incoming messages",
                NotificationManager.IMPORTANCE_HIGH
            )
            manager.createNotificationChannel(channel)
        }
    }
}
