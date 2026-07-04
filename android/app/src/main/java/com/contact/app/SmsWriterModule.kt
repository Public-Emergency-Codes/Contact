package com.contact.app

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.provider.BlockedNumberContract
import android.provider.ContactsContract
import android.provider.Telephony
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native module for destructive SMS operations: trash (delete) and block.
 *
 * Because contact is registered as the default SMS app via
 * RespondViaSmsService, it has system authority to delete SMS from the
 * Telephony provider and write to the blocked-number provider.
 *
 * ⚠️ Trash operations are permanent — callers MUST show a confirmation
 *    alert on the JS side before invoking these methods.
 */
class SmsWriterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SmsWriter"

    companion object {
        // Emergency/PSAP numbers that can NEVER be blocked
        private val NEVER_BLOCK = setOf(
            "911", "112", "999", "988", "311", "211",
            "101", "100", "110", "108", "118", "122",
        )
        // Normalise a phone number to digits-only for comparison
        private fun normalize(num: String): String = num.replace(Regex("\\D"), "")
    }

    // ── Delete (Trash) ─────────────────────────────────────────────────

    /**
     * Permanently delete a single SMS message by its `_id`.
     * Prompts a confirmation on the JS side before calling this.
     */
    @ReactMethod
    fun deleteMessage(messageId: String, promise: Promise) {
        try {
            val uri = Uri.withAppendedPath(Telephony.Sms.CONTENT_URI, messageId)
            val deleted = reactApplicationContext.contentResolver.delete(uri, null, null)
            Log.i("SmsWriter", "deleteMessage($messageId): deleted=$deleted")
            if (deleted > 0) {
                promise.resolve(true)
            } else {
                promise.reject("SMS_DELETE_ERROR", "Message not found or already deleted")
            }
        } catch (e: SecurityException) {
            Log.e("SmsWriter", "deleteMessage: permission denied", e)
            promise.reject("SMS_PERMISSION_DENIED", "Write SMS permission not granted", e)
        } catch (e: Exception) {
            Log.e("SmsWriter", "deleteMessage failed", e)
            promise.reject("SMS_DELETE_ERROR", e.message, e)
        }
    }

    /**
     * Permanently delete all messages in a thread by `thread_id`.
     * JS side must show a confirmation alert first.
     */
    @ReactMethod
    fun deleteThread(threadId: String, promise: Promise) {
        try {
            val where = "thread_id = ?"
            val whereArgs = arrayOf(threadId)
            val deleted = reactApplicationContext.contentResolver.delete(
                Telephony.Sms.CONTENT_URI,
                where,
                whereArgs,
            )
            Log.i("SmsWriter", "deleteThread($threadId): deleted=$deleted messages")
            if (deleted > 0) {
                promise.resolve(deleted)
            } else {
                promise.resolve(0) // thread may already be empty
            }
        } catch (e: SecurityException) {
            Log.e("SmsWriter", "deleteThread: permission denied", e)
            promise.reject("SMS_PERMISSION_DENIED", "Write SMS permission not granted", e)
        } catch (e: Exception) {
            Log.e("SmsWriter", "deleteThread failed", e)
            promise.reject("SMS_DELETE_ERROR", e.message, e)
        }
    }

    // ── Block & Report Spam ────────────────────────────────────────────

    /**
     * Block a phone number via Android's `BlockedNumberContract`.
     *
     * Safety: numbers that normalize to 911, 112, 999, 988, 311, 211
     * (and other common emergency numbers) are HARD-REJECTED and will
     * never be blocked, regardless of what the JS layer passes.
     */
    @ReactMethod
    fun blockNumber(phoneNumber: String, promise: Promise) {
        try {
            val clean = normalize(phoneNumber)
            if (clean.isEmpty()) {
                promise.reject("BLOCK_ERROR", "Invalid phone number")
                return
            }

            // ── Emergency number whitelist ──
            for (emergency in NEVER_BLOCK) {
                if (clean.contains(normalize(emergency))) {
                    val msg = "Refusing to block emergency/PSAP number: $phoneNumber"
                    Log.w("SmsWriter", msg)
                    promise.reject("BLOCK_EMERGENCY", msg)
                    return
                }
            }

            val values = ContentValues().apply {
                put(BlockedNumberContract.BlockedNumbers.COLUMN_ORIGINAL_NUMBER, phoneNumber)
            }

            val uri = reactApplicationContext.contentResolver.insert(
                BlockedNumberContract.BlockedNumbers.CONTENT_URI,
                values,
            )

            if (uri != null) {
                Log.i("SmsWriter", "blockNumber($phoneNumber): blocked at $uri")
                promise.resolve(true)
            } else {
                // Already blocked or insert failed
                promise.reject("BLOCK_ERROR", "Failed to block number (may already be blocked)")
            }
        } catch (e: SecurityException) {
            Log.e("SmsWriter", "blockNumber: permission denied", e)
            promise.reject("BLOCK_PERMISSION_DENIED", "BlockedNumberContract permission not granted", e)
        } catch (e: Exception) {
            Log.e("SmsWriter", "blockNumber failed", e)
            promise.reject("BLOCK_ERROR", e.message, e)
        }
    }

    /**
     * Check whether a number is already blocked.
     */
    @ReactMethod
    fun isBlocked(phoneNumber: String, promise: Promise) {
        try {
            val blocked = BlockedNumberContract.isBlocked(
                reactApplicationContext,
                phoneNumber,
            )
            promise.resolve(blocked)
        } catch (e: Exception) {
            promise.reject("BLOCK_CHECK_ERROR", e.message, e)
        }
    }

    // ── Add Contact (via system intent) ────────────────────────────────

    /**
     * Open the system contacts app with the phone number pre-filled,
     * ready to save a new contact.
     */
    @ReactMethod
    fun addContact(phoneNumber: String, displayName: String, promise: Promise) {
        try {
            val intent = Intent(Intent.ACTION_INSERT).apply {
                type = ContactsContract.Contacts.CONTENT_TYPE
                putExtra(ContactsContract.Intents.Insert.PHONE, phoneNumber)
                if (displayName.isNotBlank()) {
                    putExtra(ContactsContract.Intents.Insert.NAME, displayName)
                }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e("SmsWriter", "addContact failed", e)
            promise.reject("ADD_CONTACT_ERROR", e.message, e)
        }
    }
}
