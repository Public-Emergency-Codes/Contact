package com.contact.app

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.telephony.SmsManager

/**
 * Required by Android to be set as the default SMS app.
 * Handles RESPOND_VIA_MESSAGE (quick reply from notifications).
 */
class RespondViaSmsService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val uri  = intent?.data
        val body = intent?.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val to   = uri?.schemeSpecificPart?.trimStart('/') ?: ""
        if (to.isNotEmpty() && body.isNotEmpty()) {
            @Suppress("DEPRECATION")
            SmsManager.getDefault().sendTextMessage(to, null, body, null, null)
        }
        stopSelf(startId)
        return START_NOT_STICKY
    }
}
