package com.contact.app

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager

class IncomingCallQuickReplyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        when (intent?.action) {
            ACTION_SEND_QUICK_REPLY -> {
                val number = intent.getStringExtra(EXTRA_NUMBER).orEmpty()
                val message = intent.getStringExtra(EXTRA_MESSAGE).orEmpty()
                if (number.isBlank() || message.isBlank()) return

                val sentIntent = Intent(context, IncomingCallQuickReplyReceiver::class.java).apply {
                    action = ACTION_QUICK_REPLY_SENT
                    putExtra(EXTRA_NUMBER, number)
                }
                val sentPendingIntent = PendingIntent.getBroadcast(
                    context,
                    number.hashCode() xor message.hashCode(),
                    sentIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )

                SmsManager.getDefault().sendTextMessage(number, null, message, sentPendingIntent, null)
            }

            ACTION_QUICK_REPLY_SENT -> {
                if (resultCode == Activity.RESULT_OK) {
                    CallManager.endCall()
                }
            }
        }

        if (CallManager.getCallState() == android.telecom.Call.STATE_DISCONNECTED) {
            InCallNotificationHelper.cancel(context)
        } else {
            InCallNotificationHelper.showOrUpdate(context, CallManager.getActiveCall())
        }
    }

    companion object {
        const val ACTION_SEND_QUICK_REPLY = "com.contact.app.ACTION_SEND_QUICK_REPLY"
        const val ACTION_QUICK_REPLY_SENT = "com.contact.app.ACTION_QUICK_REPLY_SENT"
        const val EXTRA_NUMBER = "extra_number"
        const val EXTRA_MESSAGE = "extra_message"

        fun sendQuickReply(context: Context, number: String, message: String) {
            val intent = Intent(context, IncomingCallQuickReplyReceiver::class.java).apply {
                action = ACTION_SEND_QUICK_REPLY
                putExtra(EXTRA_NUMBER, number)
                putExtra(EXTRA_MESSAGE, message)
            }
            context.sendBroadcast(intent)
        }
    }
}
