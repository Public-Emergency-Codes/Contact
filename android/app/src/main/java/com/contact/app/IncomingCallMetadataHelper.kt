package com.contact.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CallLog
import android.provider.Telephony
import android.telephony.PhoneNumberUtils
import androidx.core.content.ContextCompat
import java.text.DateFormat
import java.util.Date

data class IncomingCallSnapshot(
    val lastCallText: String?,
    val recentSmsText: String?,
    val recentSmsNumber: String?,
    val recentSmsBody: String?,
)

object IncomingCallMetadataHelper {
    fun load(context: Context, number: String): IncomingCallSnapshot {
        val lastCall = loadLastCall(context, number)
        val recentSms = loadRecentSms(context, number)
        return IncomingCallSnapshot(
            lastCallText = lastCall,
            recentSmsText = recentSms?.let { formatSmsSummary(it.type, it.body, it.date) },
            recentSmsNumber = recentSms?.address,
            recentSmsBody = recentSms?.body,
        )
    }

    fun openSmsChat(context: Context, number: String) {
        if (number.isBlank()) return
        val intent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("smsto:${Uri.encode(number)}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    private fun loadLastCall(context: Context, number: String): String? {
        if (number.isBlank()) return null
        val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) == PackageManager.PERMISSION_GRANTED
        if (!hasPermission) return null

        val projection = arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE)
        val sortOrder = "${CallLog.Calls.DATE} DESC"
        return try {
            context.contentResolver.query(CallLog.Calls.CONTENT_URI, projection, null, null, sortOrder)?.use { cursor ->
                while (cursor.moveToNext()) {
                    val callNumber = cursor.getString(0).orEmpty()
                    if (!matchesNumber(callNumber, number)) continue
                    val type = cursor.getInt(1)
                    val date = cursor.getLong(2)
                    return formatCallSummary(type, date)
                }
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    private data class SmsRow(val address: String, val body: String, val type: Int, val date: Long)

    private fun loadRecentSms(context: Context, number: String): SmsRow? {
        if (number.isBlank()) return null
        val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
        if (!hasPermission) return null

        val projection = arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.TYPE, Telephony.Sms.DATE)
        val sortOrder = "${Telephony.Sms.DATE} DESC"
        return try {
            context.contentResolver.query(Telephony.Sms.CONTENT_URI, projection, null, null, sortOrder)?.use { cursor ->
                while (cursor.moveToNext()) {
                    val address = cursor.getString(0).orEmpty()
                    if (!matchesNumber(address, number)) continue
                    return SmsRow(
                        address = address,
                        body = cursor.getString(1).orEmpty(),
                        type = cursor.getInt(2),
                        date = cursor.getLong(3),
                    )
                }
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun matchesNumber(left: String, right: String): Boolean {
        if (left.isBlank() || right.isBlank()) return false
        return PhoneNumberUtils.compare(left, right) ||
            PhoneNumberUtils.normalizeNumber(left) == PhoneNumberUtils.normalizeNumber(right)
    }

    private fun formatCallSummary(type: Int, dateMs: Long): String {
        val label = when (type) {
            CallLog.Calls.INCOMING_TYPE -> "Incoming call"
            CallLog.Calls.OUTGOING_TYPE -> "Outgoing call"
            CallLog.Calls.MISSED_TYPE -> "Missed call"
            CallLog.Calls.REJECTED_TYPE -> "Rejected call"
            CallLog.Calls.VOICEMAIL_TYPE -> "Voicemail"
            else -> "Call"
        }
        val time = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(dateMs))
        return "$label \u2022 $time"
    }

    private fun formatSmsSummary(type: Int, body: String, dateMs: Long): String {
        val label = when (type) {
            Telephony.Sms.MESSAGE_TYPE_INBOX -> "Received SMS"
            Telephony.Sms.MESSAGE_TYPE_SENT -> "Sent SMS"
            else -> "Received SMS"
        }
        val time = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(dateMs))
        val preview = body.trim().replace(Regex("\\s+"), " ").take(64)
        return if (preview.isBlank()) "$label \u2022 $time" else "$label \u2022 $time \u2022 $preview"
    }
}
