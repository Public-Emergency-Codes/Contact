package com.contact.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Native module that observes incoming SMS messages and emits events to React Native.
 * Used to capture PSAP (911) replies when Text-to-911 is active.
 * Uses two parallel approaches:
 *   1. SMS_RECEIVED broadcast (standard SMS)
 *   2. ContentObserver on content://sms (catches SMS even if broadcast is delayed)
 */
class SmsObserverModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SmsObserver"

    private var smsReceiver: BroadcastReceiver? = null
    private var mockSmsReceiver: BroadcastReceiver? = null
    private var smsContentObserver: ContentObserver? = null
    private var lastProcessedSmsId: Long = -1L
    private var lastProcessedOutgoingSmsId: Long = -1L
    private val monitoredNumbers = mutableSetOf<String>()
    private var isObserving = false

    private fun emit(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Start observing incoming SMS from specific phone numbers.
     * @param numbers - ReadableArray of phone numbers to monitor (e.g. ["911"])
     */
    @ReactMethod
    fun startObserving(numbers: ReadableArray, promise: Promise) {
        try {
            // Store numbers to monitor (update even if already observing)
            monitoredNumbers.clear()
            for (i in 0 until numbers.size()) {
                val num = numbers.getString(i) ?: continue
                monitoredNumbers.add(normalizeNumber(num))
            }

            if (isObserving) {
                // Already registered — just updated the monitored set above
                promise.resolve(true)
                return
            }

            smsReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    Log.d("SmsObserver", "[DBG] onReceive fired, action=${intent?.action}")
                    if (
                        intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION &&
                        intent?.action != "com.contact.app.PRIVATE_SMS_DELIVER"
                    ) return

                    val bundle = intent.extras ?: run {
                        Log.d("SmsObserver", "[DBG] No extras in intent")
                        return
                    }
                    val pdus = bundle.get("pdus") as? Array<*> ?: run {
                        Log.d("SmsObserver", "[DBG] No PDUs in bundle")
                        return
                    }
                    val format = bundle.getString("format") ?: "3gpp"
                    Log.d("SmsObserver", "[DBG] Processing ${pdus.size} PDU(s), format=$format")

                    for (pdu in pdus) {
                        val sms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            SmsMessage.createFromPdu(pdu as ByteArray, format)
                        } else {
                            @Suppress("DEPRECATION")
                            SmsMessage.createFromPdu(pdu as ByteArray)
                        }

                        val rawSender = sms.originatingAddress ?: ""
                        val sender = normalizeNumber(rawSender)
                        val body = sms.messageBody ?: ""
                        val timestamp = sms.timestampMillis
                        Log.d("SmsObserver", "[DBG] SMS from rawSender=$rawSender normalized=$sender monitored=$monitoredNumbers")

                        val isMonitored = monitoredNumbers.isNotEmpty() &&
                            monitoredNumbers.any { it == sender || sender.endsWith(it) || it.endsWith(sender) }

                        Log.d("SmsObserver", "[DBG] isMonitored=$isMonitored body.isNotBlank=${body.isNotBlank()}")
                        if (isMonitored && body.isNotBlank()) {
                            Log.d("SmsObserver", "[DBG] Emitting onPsapSmsReceived for sender=$rawSender")
                            val params = Arguments.createMap().apply {
                                putString("sender", rawSender)
                                putString("body", body)
                                putDouble("timestamp", timestamp.toDouble())
                            }
                            emit("onPsapSmsReceived", params)
                        }
                    }
                }
            }

            val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION).apply {
                addAction("com.contact.app.PRIVATE_SMS_DELIVER")
                priority = IntentFilter.SYSTEM_HIGH_PRIORITY
            }

            // NOTE: Must NOT use RECEIVER_NOT_EXPORTED here.
            // SMS_RECEIVED is a system broadcast sent by the Android telephony stack (a different UID).
            // RECEIVER_NOT_EXPORTED blocks all cross-process broadcasts, so the receiver would never fire.
            // RECEIVER_EXPORTED is required to receive system broadcasts on Android 13+.
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(smsReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                reactContext.registerReceiver(smsReceiver, filter)
            }

            mockSmsReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    if (intent?.action != "com.contact.app.MOCK_OUTGOING_SMS") return
                    val address = intent.getStringExtra("address") ?: "911"
                    val body = intent.getStringExtra("body") ?: "Mock Sandbox SMS"
                    val timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis())

                    Log.d("SmsObserver", "[DBG MOCK] Mock outgoing SMS intent received: address=$address body=$body")

                    val normAddr = normalizeNumber(address)
                    val isEmergency = normAddr == "911" || normAddr == "988" || normAddr == "211" || normAddr == "311" ||
                        monitoredNumbers.any { it == normAddr || normAddr.endsWith(it) || it.endsWith(normAddr) }

                    if (isEmergency) {
                        val params = Arguments.createMap().apply {
                            putString("address", address)
                            putString("body", body)
                            putDouble("timestamp", timestamp.toDouble())
                        }
                        emit("onOutgoingSmsDetected", params)
                    }
                }
            }

            val mockFilter = IntentFilter("com.contact.app.MOCK_OUTGOING_SMS")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(mockSmsReceiver, mockFilter, Context.RECEIVER_EXPORTED)
            } else {
                reactContext.registerReceiver(mockSmsReceiver, mockFilter)
            }

            isObserving = true
            Log.d("SmsObserver", "[DBG] Receiver registered. Monitoring: $monitoredNumbers")

            // Also register a ContentObserver on content://sms as a fallback.
            // This catches messages that arrive via RCS (stored in telephony DB but no SMS_RECEIVED broadcast)
            // and also handles cases where the broadcast is delayed or intercepted.
            startContentObserver()

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SMS_OBSERVER_ERROR", e.message, e)
        }
    }

    /** Snapshot the highest _id in the SMS and MMS inboxes so we only report NEW messages. */
    private fun initLastSmsId() {
        try {
            val smsCursor = reactContext.contentResolver.query(
                Uri.parse("content://sms"), arrayOf("_id"), null, null, "_id DESC"
            )
            smsCursor?.use { if (it.moveToFirst()) lastProcessedSmsId = it.getLong(0) }

            val outCursor = reactContext.contentResolver.query(
                Uri.parse("content://sms"), arrayOf("_id"), "type IN (2, 4)", null, "_id DESC"
            )
            outCursor?.use { if (it.moveToFirst()) lastProcessedOutgoingSmsId = it.getLong(0) }

            val mmsCursor = reactContext.contentResolver.query(
                Uri.parse("content://mms"), arrayOf("_id"), null, null, "_id DESC"
            )
            mmsCursor?.use { if (it.moveToFirst()) lastProcessedMmsId = it.getLong(0) }
        } catch (e: Exception) {
            Log.d("SmsObserver", "[DBG] Could not init lastSmsId/MmsId: ${e.message}")
        }
    }

    private fun startContentObserver() {
        if (smsContentObserver != null) return
        initLastSmsId()
        Log.d("SmsObserver", "[DBG] ContentObserver starting. lastSmsId=$lastProcessedSmsId")
        smsContentObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                Log.d("SmsObserver", "[DBG] ContentObserver onChange fired")
                checkInboxForNewMessages()
                checkOutgoingMessages()
            }
        }
        // Watch content://mms-sms which covers SMS, MMS, AND RCS (stored as MMS records)
        reactContext.contentResolver.registerContentObserver(
            Uri.parse("content://mms-sms"),
            true,
            smsContentObserver!!
        )
        // Also watch content://sms directly for traditional SMS
        reactContext.contentResolver.registerContentObserver(
            Uri.parse("content://sms"),
            true,
            smsContentObserver!!
        )
    }

    private fun checkInboxForNewMessages() {
        checkSmsInbox()
        checkMmsInbox()
    }

    private fun checkOutgoingMessages() {
        Log.d("SmsObserver", "[DBG] checkOutgoingMessages entered, lastOutId=$lastProcessedOutgoingSmsId")
        try {
            val cursor = reactContext.contentResolver.query(
                Uri.parse("content://sms"),
                arrayOf("_id", "address", "body", "date", "type"),
                "type IN (2, 4)",
                null,
                "_id DESC LIMIT 1"
            )
            Log.d("SmsObserver", "[DBG Outgoing] cursor=${cursor?.count ?: "null"} rows")
            cursor ?: return

            cursor.use {
                if (it.moveToFirst()) {
                    val id = it.getLong(it.getColumnIndexOrThrow("_id"))
                    val address = it.getString(it.getColumnIndexOrThrow("address")) ?: ""
                    val body = it.getString(it.getColumnIndexOrThrow("body")) ?: ""
                    val date = it.getLong(it.getColumnIndexOrThrow("date"))

                    if (id > lastProcessedOutgoingSmsId) {
                        lastProcessedOutgoingSmsId = id
                        val normAddr = normalizeNumber(address)
                        Log.d("SmsObserver", "[DBG Outgoing] New outgoing message: _id=$id address=$address, normAddr=$normAddr")

                        val isEmergency = normAddr == "911" || normAddr == "988" || normAddr == "211" || normAddr == "311" ||
                            monitoredNumbers.any { it == normAddr || normAddr.endsWith(it) || it.endsWith(normAddr) }

                        if (isEmergency) {
                            Log.d("SmsObserver", "[DBG Outgoing] Intercepted outgoing emergency SMS to $address")
                            val params = Arguments.createMap().apply {
                                putString("address", address)
                                putString("body", body)
                                putDouble("timestamp", date.toDouble())
                            }
                            emit("onOutgoingSmsDetected", params)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("SmsObserver", "[DBG] checkOutgoingMessages failed: ${e.message}")
        }
    }

    private fun checkSmsInbox() {
        Log.d("SmsObserver", "[DBG] checkSmsInbox entered, lastSmsId=$lastProcessedSmsId")
        try {
            val selection = if (lastProcessedSmsId > 0) "_id > ? AND type = 1" else "type = 1"
            val selArgs = if (lastProcessedSmsId > 0) arrayOf(lastProcessedSmsId.toString()) else null
            val cursor = reactContext.contentResolver.query(
                Uri.parse("content://sms"),
                arrayOf("_id", "address", "body", "date"),
                selection, selArgs, "_id ASC"
            )
            Log.d("SmsObserver", "[DBG] SMS cursor=${cursor?.count ?: "null"} rows")
            cursor ?: return

            cursor.use {
                while (it.moveToNext()) {
                    val id = it.getLong(it.getColumnIndexOrThrow("_id"))
                    val address = it.getString(it.getColumnIndexOrThrow("address")) ?: ""
                    val body = it.getString(it.getColumnIndexOrThrow("body")) ?: ""
                    val date = it.getLong(it.getColumnIndexOrThrow("date"))

                    lastProcessedSmsId = maxOf(lastProcessedSmsId, id)

                    val sender = normalizeNumber(address)
                    val isMonitored = monitoredNumbers.isNotEmpty() &&
                        monitoredNumbers.any { n -> n == sender || sender.endsWith(n) || n.endsWith(sender) }

                    Log.d("SmsObserver", "[DBG SMS] id=$id address=$address sender=$sender isMonitored=$isMonitored")

                    if (isMonitored && body.isNotBlank()) {
                        Log.d("SmsObserver", "[DBG SMS] Emitting onPsapSmsReceived from $address")
                        val params = Arguments.createMap().apply {
                            putString("sender", address)
                            putString("body", body)
                            putDouble("timestamp", date.toDouble())
                        }
                        emit("onPsapSmsReceived", params)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("SmsObserver", "[DBG] SMS inbox query failed: ${e.message}")
        }
    }

    private var lastProcessedMmsId: Long = -1L

    private fun checkMmsInbox() {
        Log.d("SmsObserver", "[DBG] checkMmsInbox entered, lastMmsId=$lastProcessedMmsId")
        try {
            // RCS messages are stored as MMS type=132 (RECEIVED) in content://mms/inbox
            val selection = if (lastProcessedMmsId > 0) "_id > ?" else null
            val selArgs = if (lastProcessedMmsId > 0) arrayOf(lastProcessedMmsId.toString()) else null
            val cursor = reactContext.contentResolver.query(
                Uri.parse("content://mms/inbox"),
                arrayOf("_id", "date"),
                selection, selArgs, "_id ASC"
            )
            Log.d("SmsObserver", "[DBG] MMS cursor=${cursor?.count ?: "null"} rows")
            cursor ?: return

            cursor.use {
                while (it.moveToNext()) {
                    val id = it.getLong(it.getColumnIndexOrThrow("_id"))
                    val date = it.getLong(it.getColumnIndexOrThrow("date")) * 1000L
                    // NOTE: do NOT advance lastProcessedMmsId yet — only after successful addr+body read
                    // This allows a retry on the next onChange if addr isn't written yet

                    // Get sender from addr table — no WHERE clause; filter type in-code
                    val addrCursor = reactContext.contentResolver.query(
                        Uri.parse("content://mms/$id/addr"),
                        arrayOf("address", "type"),
                        null, null, null
                    )
                    Log.d("SmsObserver", "[DBG MMS] addr cursor=${addrCursor?.count ?: "null"} for id=$id")
                    val address = addrCursor?.use { a ->
                        var found: String? = null
                        while (a.moveToNext()) {
                            val t = a.getInt(a.getColumnIndexOrThrow("type"))
                            val addr = a.getString(a.getColumnIndexOrThrow("address")) ?: continue
                            Log.d("SmsObserver", "[DBG MMS] addr row: type=$t addr=$addr")
                            if (t == 137) { found = addr; break } // 137 = FROM
                        }
                        found
                    }
                    if (address == null) {
                        Log.d("SmsObserver", "[DBG MMS] addr not ready yet for id=$id — will retry on next onChange")
                        continue // don't advance lastProcessedMmsId; retry next time
                    }

                    // Get body from part table — no compound WHERE; filter in-code
                    val partCursor = reactContext.contentResolver.query(
                        Uri.parse("content://mms/part"),
                        arrayOf("mid", "ct", "text"),
                        "mid = ?", arrayOf(id.toString()), null
                    )
                    Log.d("SmsObserver", "[DBG MMS] part cursor=${partCursor?.count ?: "null"} for id=$id")
                    val body = partCursor?.use { p ->
                        var found: String? = null
                        while (p.moveToNext()) {
                            val ct = p.getString(p.getColumnIndexOrThrow("ct")) ?: continue
                            if (ct == "text/plain") {
                                found = p.getString(p.getColumnIndexOrThrow("text"))
                                break
                            }
                        }
                        found
                    }
                    if (body == null) {
                        Log.d("SmsObserver", "[DBG MMS] body not ready yet for id=$id — will retry on next onChange")
                        continue // don't advance lastProcessedMmsId; retry next time
                    }

                    // Successfully read addr + body — now advance the cursor
                    lastProcessedMmsId = maxOf(lastProcessedMmsId, id)

                    val sender = normalizeNumber(address)
                    val isMonitored = monitoredNumbers.isEmpty() ||
                        monitoredNumbers.any { n -> n == sender || sender.endsWith(n) || n.endsWith(sender) }

                    Log.d("SmsObserver", "[DBG MMS] id=$id address=$address sender=$sender body=${body.take(30)} isMonitored=$isMonitored")

                    if (isMonitored && body.isNotBlank()) {
                        Log.d("SmsObserver", "[DBG MMS] Emitting onPsapSmsReceived from $address")
                        val params = Arguments.createMap().apply {
                            putString("sender", address)
                            putString("body", body)
                            putDouble("timestamp", date.toDouble())
                        }
                        emit("onPsapSmsReceived", params)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("SmsObserver", "[DBG] MMS inbox query failed: ${e.message}")
        }
    }

    /** Stop observing incoming SMS. */
    @ReactMethod
    fun stopObserving(promise: Promise) {
        try {
            if (smsReceiver != null) {
                reactContext.unregisterReceiver(smsReceiver)
                smsReceiver = null
            }
            if (mockSmsReceiver != null) {
                reactContext.unregisterReceiver(mockSmsReceiver)
                mockSmsReceiver = null
            }
            if (smsContentObserver != null) {
                reactContext.contentResolver.unregisterContentObserver(smsContentObserver!!)
                smsContentObserver = null
            }
            monitoredNumbers.clear()
            isObserving = false
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(true) // Don't fail on cleanup
        }
    }

    /** Normalize phone number for comparison (strip non-digits). */
    private fun normalizeNumber(number: String): String {
        return number.replace(Regex("[^0-9]"), "")
    }

    /** Required for NativeEventEmitter on iOS (no-op on Android). */
    @ReactMethod
    fun addListener(eventName: String?) { /* no-op */ }

    @ReactMethod
    fun removeListeners(count: Int?) { /* no-op */ }
}
