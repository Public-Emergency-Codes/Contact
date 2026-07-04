package com.contact.app

import android.net.Uri
import android.os.AsyncTask
import android.os.Bundle
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File

class SmsReaderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SmsReader"

    /** Returns the most-recent message per thread (SMS + MMS), sorted newest first. */
    @ReactMethod
    fun getThreads(limit: Int, promise: Promise) {
        Thread {
            try {
                Log.i("SmsReader", "getThreads($limit) starting")
                val resolver = reactApplicationContext.contentResolver
                val result = Arguments.createArray()
                val seen = mutableSetOf<String>()

                // ── SMS threads ──────────────────────────────────────────
                val smsCursor = resolver.query(
                    android.net.Uri.parse("content://sms"),
                    arrayOf("_id", "thread_id", "address", "body", "date", "read", "type"),
                    null, null,
                    "date DESC"
                )
                Log.i("SmsReader", "SMS query returned cursor=${smsCursor != null}")
                smsCursor?.use { c ->
                    var rows = 0
                    while (c.moveToNext()) {
                        rows++
                        val threadId = c.getString(c.getColumnIndexOrThrow("thread_id")) ?: continue
                        if (threadId in seen) continue
                        seen += threadId
                        val map = Arguments.createMap()
                        map.putString("threadId", threadId)
                        map.putString("address", c.getString(c.getColumnIndexOrThrow("address")) ?: "")
                        map.putString("snippet", c.getString(c.getColumnIndexOrThrow("body")) ?: "")
                        map.putDouble("date", c.getLong(c.getColumnIndexOrThrow("date")).toDouble())
                        map.putBoolean("read", c.getInt(c.getColumnIndexOrThrow("read")) == 1)
                        map.putInt("type", c.getInt(c.getColumnIndexOrThrow("type")))
                        result.pushMap(map)
                    }
                    Log.i("SmsReader", "SMS: processed $rows rows, found ${seen.size} threads")
                }

                // ── MMS threads (only for threads not already seen) ─────
                val mmsCursor = resolver.query(
                    android.net.Uri.parse("content://mms"),
                    arrayOf("_id", "thread_id", "date", "msg_box", "read"),
                    null, null,
                    "date DESC"
                )
                Log.i("SmsReader", "MMS query returned cursor=${mmsCursor != null}")
                mmsCursor?.use { c ->
                    var mmsRows = 0
                    while (c.moveToNext() && result.size() < limit) {
                        mmsRows++
                        val threadId = c.getString(c.getColumnIndexOrThrow("thread_id")) ?: continue
                        if (threadId in seen) continue
                        seen += threadId

                        val mmsId = c.getString(c.getColumnIndexOrThrow("_id"))
                        val msgBox = c.getInt(c.getColumnIndexOrThrow("msg_box"))

                        // Resolve address for MMS thread
                        var address = ""
                        val addrCursor = resolver.query(
                            android.net.Uri.parse("content://mms/$mmsId/addr"),
                            arrayOf("address"), null, null, null
                        )
                        addrCursor?.use { ac ->
                            if (ac.moveToFirst())
                                address = ac.getString(ac.getColumnIndexOrThrow("address")) ?: ""
                        }

                        // Try to get a text snippet from MMS parts
                        var snippet = ""
                        val partCursor = resolver.query(
                            android.net.Uri.parse("content://mms/$mmsId/part"),
                            arrayOf("ct", "text"),
                            "ct = 'text/plain'",
                            null, null
                        )
                        partCursor?.use { pc ->
                            if (pc.moveToFirst()) {
                                snippet = pc.getString(pc.getColumnIndexOrThrow("text")) ?: ""
                            }
                        }
                        if (snippet.isBlank()) {
                            var hasVideo = false
                            val mediaCursor = resolver.query(
                                android.net.Uri.parse("content://mms/$mmsId/part"),
                                arrayOf("ct"),
                                null,
                                null,
                                null
                            )
                            mediaCursor?.use { pc ->
                                while (pc.moveToNext()) {
                                    val ct = pc.getString(pc.getColumnIndexOrThrow("ct")).orEmpty()
                                    if (ct.startsWith("video/")) {
                                        hasVideo = true
                                        break
                                    }
                                }
                            }
                            snippet = if (hasVideo) "Video" else "Image"
                        }

                        val map = Arguments.createMap()
                        map.putString("threadId", threadId)
                        map.putString("address", address)
                        map.putString("snippet", snippet)
                        map.putDouble("date", (c.getLong(c.getColumnIndexOrThrow("date")) * 1000L).toDouble())
                        map.putBoolean("read", c.getInt(c.getColumnIndexOrThrow("read")) == 1)
                        map.putInt("type", if (msgBox == 2) 2 else 1)
                        result.pushMap(map)
                    }
                    Log.i("SmsReader", "MMS: processed $mmsRows rows")
                }

                // Sort merged results by date descending
                val list = mutableListOf<ReadableMap>()
                for (i in 0 until result.size()) {
                    result.getMap(i)?.let { list.add(it) }
                }
                list.sortByDescending { it.getDouble("date") }
                val sorted = Arguments.createArray()
                for (map in list.take(limit)) {
                    val wm = Arguments.createMap()
                    wm.merge(map)
                    sorted.pushMap(wm)
                }
                Log.i("SmsReader", "resolving with ${sorted.size()} threads")
                promise.resolve(sorted)
            } catch (e: SecurityException) {
                Log.e("SmsReader", "SMS permission denied", e)
                promise.reject("SMS_PERMISSION_DENIED", "READ_SMS permission not granted", e)
            } catch (e: Exception) {
                Log.e("SmsReader", "getThreads failed", e)
                promise.reject("SMS_READ_ERROR", e.message, e)
            }
        }.apply { name = "SmsReader-Thread" }.start()
    }

    /** Returns individual messages for a thread (SMS + MMS), newest first. */
    @ReactMethod
    fun getMessages(threadId: String, limit: Int, promise: Promise) {
        AsyncTask.execute {
            try {
                val resolver = reactApplicationContext.contentResolver
                val result = Arguments.createArray()

                // ── SMS messages ─────────────────────────────────────────
                val smsCursor = resolver.query(
                    android.net.Uri.parse("content://sms"),
                    arrayOf("_id", "address", "body", "date", "read", "type"),
                    "thread_id = ?",
                    arrayOf(threadId),
                    "date DESC LIMIT $limit"
                )
                smsCursor?.use { c ->
                    while (c.moveToNext()) {
                        val map = Arguments.createMap()
                        map.putString("id", "sms_${c.getString(c.getColumnIndexOrThrow("_id"))}")
                        map.putString("address", c.getString(c.getColumnIndexOrThrow("address")) ?: "")
                        map.putString("body", c.getString(c.getColumnIndexOrThrow("body")) ?: "")
                        map.putDouble("date", c.getLong(c.getColumnIndexOrThrow("date")).toDouble())
                        map.putBoolean("read", c.getInt(c.getColumnIndexOrThrow("read")) == 1)
                        map.putInt("type", c.getInt(c.getColumnIndexOrThrow("type")))
                        result.pushMap(map)
                    }
                }

                // ── MMS messages ─────────────────────────────────────────
                val threadAddress = resolveThreadAddress(threadId)
                val seenMmsIds = mutableSetOf<String>()
                val mmsCursor = resolver.query(
                    android.net.Uri.parse("content://mms"),
                    arrayOf("_id", "thread_id", "date", "msg_box", "read"),
                    null,
                    null,
                    "date DESC LIMIT ${limit * 3}"
                )
                mmsCursor?.use { c ->
                    while (c.moveToNext()) {
                        val mmsId = c.getString(c.getColumnIndexOrThrow("_id"))
                        val mmsThreadId = c.getString(c.getColumnIndexOrThrow("thread_id")) ?: ""
                        val msgBox = c.getInt(c.getColumnIndexOrThrow("msg_box"))
                        val type = if (msgBox == 2) 2 else 1 // 2=sent, 1=received

                        // Read the address from the MMS addr table.
                        // For incoming MMS (msg_box == 1), the sender is
                        // stored with type=137 (FROM). For outgoing (msg_box == 2),
                        // the recipient is stored with type=151 (TO).
                        var address = ""
                        val addrType = if (msgBox == 2) "151" else "137"
                        val addrCursor = resolver.query(
                            android.net.Uri.parse("content://mms/$mmsId/addr"),
                            arrayOf("address"),
                            "type = $addrType",
                            null, null
                        )
                        addrCursor?.use { ac ->
                            if (ac.moveToFirst()) {
                                address = ac.getString(ac.getColumnIndexOrThrow("address")) ?: ""
                            }
                        }
                        // If no address found via typed query, try unrestricted
                        if (address.isBlank()) {
                            val fallbackAddr = resolver.query(
                                android.net.Uri.parse("content://mms/$mmsId/addr"),
                                arrayOf("address"),
                                null, null, null
                            )
                            fallbackAddr?.use { fa ->
                                if (fa.moveToFirst()) {
                                    address = fa.getString(fa.getColumnIndexOrThrow("address")) ?: ""
                                }
                            }
                        }

                        val belongsToThread = mmsThreadId == threadId ||
                            (threadAddress.isNotBlank() && addressesMatch(address, threadAddress))
                        if (!belongsToThread || !seenMmsIds.add(mmsId)) continue

                        // Read MMS parts to get text body and media URIs.
                        var body = ""
                        var mediaUri: String? = null
                        var mediaMime: String? = null
                        val partCursor = resolver.query(
                            android.net.Uri.parse("content://mms/$mmsId/part"),
                            arrayOf("_id", "ct", "_data", "text"),
                            null, null, null
                        )
                        partCursor?.use { pc ->
                            while (pc.moveToNext()) {
                                val ct = pc.getString(pc.getColumnIndexOrThrow("ct")) ?: ""
                                val dataPath = pc.getString(pc.getColumnIndexOrThrow("_data"))
                                val text = pc.getString(pc.getColumnIndexOrThrow("text"))
                                when {
                                    ct.startsWith("image/") || ct.startsWith("video/") -> {
                                        val partId = pc.getString(pc.getColumnIndexOrThrow("_id"))
                                        mediaUri = cacheMmsMediaPart(partId, ct, dataPath)
                                            ?: "content://mms/part/$partId"
                                        mediaMime = ct
                                    }
                                    ct == "text/plain" && text != null -> {
                                        body = text
                                    }
                                }
                            }
                        }

                        val map = Arguments.createMap()
                        map.putString("id", "mms_$mmsId")
                        map.putString("address", address)
                        map.putString("body", body)
                        map.putDouble("date", (c.getLong(c.getColumnIndexOrThrow("date")) * 1000L).toDouble())
                        map.putBoolean("read", c.getInt(c.getColumnIndexOrThrow("read")) == 1)
                        map.putInt("type", type)
                        if (mediaUri != null) {
                            map.putString("imageUri", mediaUri)
                            map.putString("mediaMime", mediaMime)
                        }
                        result.pushMap(map)
                    }
                }

                // Sort merged results by date descending
                val list = mutableListOf<ReadableMap>()
                for (i in 0 until result.size()) {
                    result.getMap(i)?.let { list.add(it) }
                }
                list.sortByDescending { it.getDouble("date") }
                val sorted = Arguments.createArray()
                for (map in list.take(limit)) {
                    val wm = Arguments.createMap()
                    wm.merge(map)
                    sorted.pushMap(wm)
                }
                promise.resolve(sorted)
            } catch (e: Exception) {
                promise.reject("SMS_READ_ERROR", e.message, e)
            }
        }
    }

    /**
     * Mark all unread SMS messages in a thread as read in the system
     * Telephony provider so that the thread card instantly updates its
     * unread indicator after the user opens a conversation.
     */
    @ReactMethod
    fun markThreadRead(threadId: String, promise: Promise) {
        AsyncTask.execute {
            try {
                val values = android.content.ContentValues().apply {
                    put("read", 1)
                }
                val updated = reactApplicationContext.contentResolver.update(
                    android.net.Uri.parse("content://sms"),
                    values,
                    "thread_id = ? AND read = 0",
                    arrayOf(threadId),
                )
                promise.resolve(updated)
            } catch (e: Exception) {
                promise.reject("SMS_WRITE_ERROR", e.message, e)
            }
        }
    }

    /** Look up the numeric thread_id for a given phone number. Returns null if no thread exists. */
    @ReactMethod
    fun getThreadIdByAddress(address: String, promise: Promise) {
        AsyncTask.execute {
            try {
                val resolver = reactApplicationContext.contentResolver
                val cursor = resolver.query(
                    android.net.Uri.parse("content://sms"),
                    arrayOf("thread_id"),
                    "address LIKE ?",
                    arrayOf("%$address%"),
                    "date DESC LIMIT 1"
                )
                var threadId: String? = null
                cursor?.use { c ->
                    if (c.moveToFirst()) {
                        threadId = c.getString(0)
                    }
                }
                promise.resolve(threadId)
            } catch (e: Exception) {
                promise.reject("SMS_READ_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getCachedIncomingMms(address: String, limit: Int, promise: Promise) {
        AsyncTask.execute {
            try {
                val result = Arguments.createArray()
                IncomingMmsCache.matching(reactApplicationContext, address, limit).forEach { item ->
                    val mediaPaths = item.optJSONArray("mediaPaths") ?: item.optJSONArray("imagePaths")
                    val imageUri = if (mediaPaths != null && mediaPaths.length() > 0) {
                        File(mediaPaths.optString(0)).toURI().toString()
                    } else {
                        null
                    }
                    val mediaMime = item.optJSONArray("mediaMimes")?.optString(0)

                    val map = Arguments.createMap()
                    map.putString("id", item.optString("id"))
                    map.putString("address", item.optString("sender"))
                    map.putString("body", item.optString("body"))
                    map.putDouble("date", item.optLong("date").toDouble())
                    map.putBoolean("read", true)
                    map.putInt("type", 1)
                    if (imageUri != null) map.putString("imageUri", imageUri)
                    if (!mediaMime.isNullOrBlank()) map.putString("mediaMime", mediaMime)
                    result.pushMap(map)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("MMS_CACHE_READ_ERROR", e.message, e)
            }
        }
    }

    /**
     * Searches SMS and MMS message bodies across all threads for the given query.
     * Returns distinct thread IDs whose messages contain the query string.
     */
    @ReactMethod
    fun searchMessages(query: String, limit: Int, promise: Promise) {
        AsyncTask.execute {
            try {
                val resolver = reactApplicationContext.contentResolver
                val threadIds = mutableSetOf<String>()
                val result = Arguments.createArray()

                // Search SMS bodies
                val smsCursor = resolver.query(
                    android.net.Uri.parse("content://sms"),
                    arrayOf("thread_id"),
                    "body LIKE ?",
                    arrayOf("%$query%"),
                    "date DESC LIMIT $limit"
                )
                smsCursor?.use { c ->
                    while (c.moveToNext()) {
                        val tid = c.getString(c.getColumnIndexOrThrow("thread_id")) ?: continue
                        if (threadIds.add(tid)) {
                            result.pushString(tid)
                        }
                    }
                }

                // Search MMS text parts
                val mmsCursor = resolver.query(
                    android.net.Uri.parse("content://mms"),
                    arrayOf("_id", "thread_id"),
                    null,
                    null,
                    "date DESC"
                )
                mmsCursor?.use { c ->
                    while (c.moveToNext() && result.size() < limit) {
                        val threadId = c.getString(c.getColumnIndexOrThrow("thread_id")) ?: continue
                        if (threadId in threadIds) continue
                        val mmsId = c.getString(c.getColumnIndexOrThrow("_id"))
                        val partCursor = resolver.query(
                            android.net.Uri.parse("content://mms/$mmsId/part"),
                            arrayOf("text"),
                            "ct = 'text/plain' AND text LIKE ?",
                            arrayOf("%$query%"),
                            null
                        )
                        partCursor?.use { pc ->
                            if (pc.moveToFirst()) {
                                threadIds.add(threadId)
                                result.pushString(threadId)
                            }
                        }
                    }
                }

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("SMS_SEARCH_ERROR", e.message, e)
            }
        }
    }

    private fun resolveThreadAddress(threadId: String): String {
        val resolver = reactApplicationContext.contentResolver
        resolver.query(
            Uri.parse("content://sms"),
            arrayOf("address"),
            "thread_id = ?",
            arrayOf(threadId),
            "date DESC LIMIT 1"
        )?.use { c ->
            if (c.moveToFirst()) return c.getString(c.getColumnIndexOrThrow("address")) ?: ""
        }

        resolver.query(
            Uri.parse("content://mms"),
            arrayOf("_id"),
            "thread_id = ?",
            arrayOf(threadId),
            "date DESC LIMIT 1"
        )?.use { c ->
            if (c.moveToFirst()) {
                return resolveMmsAddress(c.getString(c.getColumnIndexOrThrow("_id")), 1)
            }
        }
        return ""
    }

    private fun resolveMmsAddress(mmsId: String, msgBox: Int): String {
        val resolver = reactApplicationContext.contentResolver
        val addrType = if (msgBox == 2) "151" else "137"
        resolver.query(
            Uri.parse("content://mms/$mmsId/addr"),
            arrayOf("address"),
            "type = $addrType",
            null,
            null
        )?.use { c ->
            if (c.moveToFirst()) return c.getString(c.getColumnIndexOrThrow("address")) ?: ""
        }
        resolver.query(
            Uri.parse("content://mms/$mmsId/addr"),
            arrayOf("address"),
            null,
            null,
            null
        )?.use { c ->
            while (c.moveToNext()) {
                val address = c.getString(c.getColumnIndexOrThrow("address")) ?: continue
                if (address.isNotBlank() && address != "insert-address-token") return address
            }
        }
        return ""
    }

    private fun addressesMatch(left: String, right: String): Boolean {
        val a = left.replace(Regex("[^0-9]"), "").takeLast(10)
        val b = right.replace(Regex("[^0-9]"), "").takeLast(10)
        return a.isNotBlank() && b.isNotBlank() && a == b
    }

    private fun cacheMmsMediaPart(partId: String, mimeType: String, dataPath: String?): String? {
        return try {
            if (!dataPath.isNullOrBlank()) {
                val dataFile = File(dataPath)
                if (dataFile.exists() && dataFile.length() > 0L && dataFile.canRead()) {
                    return dataFile.toURI().toString()
                }
            }

            val dir = File(reactApplicationContext.cacheDir, "incoming_mms_media").apply {
                mkdirs()
            }
            val file = File(dir, "part_${partId}.${extensionForMime(mimeType)}")
            if (file.exists() && file.length() > 0L) {
                return file.toURI().toString()
            }

            val partUri = Uri.parse("content://mms/part/$partId")
            val copiedFromProvider = reactApplicationContext.contentResolver.openInputStream(partUri)?.use { input ->
                file.outputStream().use { output ->
                    input.copyTo(output)
                }
                true
            } ?: false

            if (!copiedFromProvider && !dataPath.isNullOrBlank()) {
                val dataFile = File(dataPath)
                if (dataFile.exists() && dataFile.length() > 0L && dataFile.canRead()) {
                    dataFile.inputStream().use { input ->
                        file.outputStream().use { output ->
                            input.copyTo(output)
                        }
                    }
                }
            }

            if (file.length() > 0L) file.toURI().toString() else null
        } catch (e: Exception) {
            Log.w("SmsReader", "Unable to cache MMS media part $partId", e)
            null
        }
    }

    private fun extensionForMime(mimeType: String): String {
        return when {
            mimeType.contains("jpeg", ignoreCase = true) -> "jpg"
            mimeType.contains("jpg", ignoreCase = true) -> "jpg"
            mimeType.contains("png", ignoreCase = true) -> "png"
            mimeType.contains("gif", ignoreCase = true) -> "gif"
            mimeType.contains("webp", ignoreCase = true) -> "webp"
            mimeType.contains("mp4", ignoreCase = true) -> "mp4"
            mimeType.contains("3gpp", ignoreCase = true) -> "3gp"
            mimeType.contains("quicktime", ignoreCase = true) -> "mov"
            mimeType.contains("webm", ignoreCase = true) -> "webm"
            else -> "dat"
        }
    }
}
