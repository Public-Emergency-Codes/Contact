package com.contact.app

import android.app.PendingIntent
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsManager
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Native module for sending and receiving Group MMS.
 *
 * contact is the default SMS app, so it has authority to write to the
 * Telephony.Mms provider and send via SmsManager.
 */
class DirectMmsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "DirectMms"

    private fun emit(eventName: String, params: com.facebook.react.bridge.WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Send a text message as a Group MMS to multiple recipients.
     *
     * On API 29+ (Android 10+) this uses PduBuilder for true MMS.
     * On older devices it falls back to sending individual SMS to each
     * recipient (mass text), which still creates a group thread in the
     * Telephony provider.
     *
     * After sending, writes the outgoing message to Telephony.Mms provider
     * so it appears in the group thread UI.
     */
    @ReactMethod
    fun sendGroupMms(phoneNumbers: ReadableArray, messageText: String, promise: Promise) {
        try {
            val numbers = (0 until phoneNumbers.size())
                .map { phoneNumbers.getString(it) }
                .filterNotNull()
            if (numbers.isEmpty()) {
                promise.reject("MMS_ERROR", "At least one recipient is required")
                return
            }

            val smsManager = SmsManager.getDefault()
            val msgId = "mms_${System.currentTimeMillis()}"

            sendAsMultipartSms(smsManager, numbers, messageText, msgId)

            // Write to Telephony provider so the thread appears in the SMS app
            writeToTelephonyProvider(numbers, messageText)

            val params = Arguments.createMap().apply {
                putString("messageId", msgId)
                putBoolean("success", true)
            }
            emit("onGroupMmsSent", params)
            promise.resolve(msgId)
        } catch (e: Exception) {
            Log.e("DirectMms", "sendGroupMms failed", e)
            promise.reject("MMS_ERROR", e.message, e)
        }
    }

    /**
     * Send the message as individual SMS texts to each recipient.
     * This sends separate SMS to each person (not true MMS), but writes
     * to the Telephony provider so it appears as a group thread.
     */
    private fun sendAsMultipartSms(
        smsManager: SmsManager,
        numbers: List<String>,
        messageText: String,
        msgId: String,
    ) {
        val parts = smsManager.divideMessage(messageText)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

        for (number in numbers) {
            val sentAction = "GROUP_SMS_SENT_${msgId}_${number.replace(Regex("\\D"), "")}"
            val sentIntent = Intent(sentAction).apply { setPackage(reactContext.packageName) }
            val sentPI = PendingIntent.getBroadcast(reactContext, 0, sentIntent, flags)

            if (parts.size > 1) {
                val sentIntents = ArrayList(parts.map { sentPI })
                smsManager.sendMultipartTextMessage(number, null, parts, sentIntents, null)
            } else {
                smsManager.sendTextMessage(number, null, messageText, sentPI, null)
            }
        }
    }

    /**
     * Write the outgoing message to the Telephony.Sms provider so the
     * thread appears in conversation queries and the UI can refresh.
     */
    private fun writeToTelephonyProvider(numbers: List<String>, messageText: String) {
        try {
            // Join numbers for the thread address
            val address = numbers.joinToString(",")
            val now = System.currentTimeMillis()

            val values = ContentValues().apply {
                put("address", address)
                put("body", messageText)
                put("date", now)
                put("read", 1)
                put("type", 2) // 2 = sent
                put("status", 0)
            }

            reactContext.contentResolver.insert(
                Telephony.Sms.Sent.CONTENT_URI,
                values,
            )
        } catch (e: Exception) {
            Log.w("DirectMms", "writeToTelephonyProvider failed (non-fatal): ${e.message}")
        }
    }

    /**
     * Query whether a group thread already exists for this set of numbers.
     * Returns the thread_id if found, or -1 if not.
     */
    @ReactMethod
    fun findGroupThread(phoneNumbers: ReadableArray, promise: Promise) {
        try {
            val numbers = (0 until phoneNumbers.size())
                .map { phoneNumbers.getString(it) }
                .filterNotNull()
            val address = numbers.joinToString(",")

            val cursor = reactContext.contentResolver.query(
                Uri.parse("content://sms"),
                arrayOf("thread_id"),
                "address LIKE ?",
                arrayOf("%$address%"),
                "date DESC LIMIT 1",
            )

            var threadId = -1L
            cursor?.use {
                if (it.moveToFirst()) {
                    threadId = it.getLong(0)
                }
            }
            promise.resolve(threadId)
        } catch (e: Exception) {
            promise.reject("THREAD_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String?) { /* no-op */ }
    @ReactMethod
    fun removeListeners(count: Int?) { /* no-op */ }
}
