package com.contact.app

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.android.mms.pdu_alt.NotificationInd
import com.google.android.mms.pdu_alt.PduParser
import com.google.android.mms.pdu_alt.RetrieveConf
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

object MmsDownloadHelper {

    private const val TAG = "MmsDownloadHelper"

    fun download(context: Context, pduBytes: ByteArray): Boolean {
        val pdu = PduParser(pduBytes).parse()
        if (pdu !is NotificationInd) { Log.d(TAG, "PDU not NotificationInd"); return false }
        val contentLocation = contentLocation(pduBytes) ?: return false
        Log.i(TAG, "MMS URL: $contentLocation")

        val (proxyHost, proxyPort) = getApn(context) ?: run {
            Log.e(TAG, "No MMSC/APN — cannot download MMS"); return false
        }
        val responseBytes = httpGet(contentLocation, proxyHost, proxyPort) ?: return false
        Log.i(TAG, "Downloaded ${responseBytes.size} bytes")

        val retrieveConf = PduParser(responseBytes).parse()
        if (retrieveConf !is RetrieveConf) { Log.w(TAG, "Response not RetrieveConf"); return false }

        var sender = "Unknown"
        retrieveConf.from?.let { from -> from.string?.let { sender = it } }
        return storeMms(context, retrieveConf, sender)
    }

    fun contentLocation(pduBytes: ByteArray): String? {
        val pdu = PduParser(pduBytes).parse()
        return (pdu as? NotificationInd)?.contentLocation?.let { String(it).trim() }
    }

    fun storeDownloadedPdu(context: Context, pduBytes: ByteArray): Boolean {
        val pdu = PduParser(pduBytes).parse()
        if (pdu !is RetrieveConf) {
            Log.w(TAG, "Downloaded PDU is not RetrieveConf")
            return false
        }

        var sender = "Unknown"
        pdu.from?.let { from -> from.string?.let { sender = it } }
        return storeMms(context, pdu, sender)
    }

    private fun getApn(context: Context): Pair<String, Int>? {
        val cursor = context.contentResolver.query(
            Uri.parse("content://telephony/carriers"),
            arrayOf("mmsproxy", "mmsport"),
            "current IS NOT NULL AND mmsc IS NOT NULL", null, null
        )
        cursor?.use { c ->
            if (c.moveToFirst()) {
                val proxy = c.getString(0) ?: ""
                val port = c.getInt(1)
                return Pair(proxy, if (port > 0) port else 80)
            }
        }
        return null
    }

    private fun httpGet(urlStr: String, proxyHost: String, proxyPort: Int): ByteArray? {
        return try {
            val url = URL(urlStr)
            val conn = if (proxyHost.isNotBlank()) {
                val p = java.net.Proxy(java.net.Proxy.Type.HTTP, java.net.InetSocketAddress(proxyHost, proxyPort))
                url.openConnection(p)
            } else { url.openConnection() } as HttpURLConnection
            conn.connectTimeout = 15000; conn.readTimeout = 15000
            conn.requestMethod = "GET"; conn.connect()
            if (conn.responseCode != 200) { Log.w(TAG, "HTTP ${conn.responseCode}"); return null }
            conn.inputStream.use { input ->
                val out = ByteArrayOutputStream(); input.copyTo(out); out.toByteArray()
            }
        } catch (e: Exception) { Log.e(TAG, "HTTP GET failed: $urlStr", e); null }
    }

    private fun storeMms(context: Context, retrieveConf: RetrieveConf, sender: String): Boolean {
        val date = System.currentTimeMillis() / 1000L
        val dateMs = date * 1000L
        val threadId = resolveThreadId(context, sender)

        val mmsUri = context.contentResolver.insert(Uri.parse("content://mms"),
            ContentValues().apply {
                put("date", date); put("msg_box", 1); put("read", 0)
                put("m_type", 132); put("sub", ""); put("sub_cs", 80)
                if (threadId > 0) put("thread_id", threadId)
            }) ?: return false
        val mmsId = mmsUri.lastPathSegment ?: return false
        Log.i(TAG, "MMS id=$mmsId threadId=$threadId")

        context.contentResolver.insert(Uri.parse("content://mms/$mmsId/addr"),
            ContentValues().apply { put("address", sender); put("type", 137); put("charset", 106) })

        val body = retrieveConf.body ?: return false
        var textBody = ""
        val mediaPaths = mutableListOf<String>()
        val mediaMimes = mutableListOf<String>()
        for (i in 0 until body.partsNum) {
            val part = body.getPart(i) ?: continue
            val ct = part.contentType?.let { String(it).lowercase() } ?: ""
            val data = part.data ?: continue
            val pv = ContentValues()
            when {
                ct.startsWith("image/") || ct.startsWith("video/") -> {
                    val path = savePartFile(context, mmsId, i, data, ct)
                    mediaPaths.add(path)
                    mediaMimes.add(ct)
                    val partPrefix = if (ct.startsWith("video/")) "video" else "image"
                    pv.put("ct", ct); pv.put("_data", path); pv.put("cid", "<${partPrefix}_$i>"); pv.put("cl", "${partPrefix}_$i.${extensionForContentType(ct)}")
                }
                ct.startsWith("text/") -> {
                    textBody = String(data)
                    pv.put("ct", "text/plain"); pv.put("text", textBody); pv.put("cid", "<text_$i>")
                }
                else -> { val path = savePartFile(context, mmsId, i, data, ct); pv.put("ct", ct); pv.put("_data", path) }
            }
            if (pv.size() > 0) context.contentResolver.insert(Uri.parse("content://mms/$mmsId/part"), pv)
        }
        IncomingMmsCache.add(context, "incoming_mms_$mmsId", sender, textBody, dateMs, mediaPaths, mediaMimes)
        Log.i(TAG, "MMS stored: id=$mmsId from=$sender parts=${body.partsNum}")
        return true
    }

    private fun resolveThreadId(context: Context, address: String): Long {
        val digits = address.replace(Regex("[^0-9]"), "")
        val lastTen = digits.takeLast(10)
        if (lastTen.isNotBlank()) {
            context.contentResolver.query(
                Uri.parse("content://sms"), arrayOf("thread_id"),
                "address LIKE ?", arrayOf("%$lastTen"), "date DESC LIMIT 1"
            )?.use { c -> if (c.moveToFirst()) { val tid = c.getLong(0); if (tid > 0) return tid } }
        }

        context.contentResolver.query(
            Uri.parse("content://sms"), arrayOf("thread_id"),
            "address = ?", arrayOf(address), "date DESC LIMIT 1"
        )?.use { c -> if (c.moveToFirst()) { val tid = c.getLong(0); if (tid > 0) return tid } }

        val uri = context.contentResolver.insert(Uri.parse("content://sms"),
            ContentValues().apply {
                put("address", address); put("body", ""); put("read", 1)
                put("date", System.currentTimeMillis()); put("type", 1); put("seen", 1)
            }) ?: return 0L
        context.contentResolver.query(uri, arrayOf("thread_id"), null, null, null)?.use { c ->
            if (c.moveToFirst()) { val tid = c.getLong(0); context.contentResolver.delete(uri, null, null); return tid }
        }
        return 0L
    }

    private fun savePartFile(context: Context, mmsId: String, idx: Int, data: ByteArray, ct: String): String {
        val ext = extensionForContentType(ct)
        val file = java.io.File(context.cacheDir, "mms_${mmsId}_${idx}.$ext")
        file.writeBytes(data)
        return file.absolutePath
    }

    private fun extensionForContentType(ct: String): String {
        return when {
            ct.contains("jpeg") || ct.contains("jpg") -> "jpg"
            ct.contains("png") -> "png"
            ct.contains("gif") -> "gif"
            ct.contains("webp") -> "webp"
            ct.contains("mp4") -> "mp4"
            ct.contains("3gpp") -> "3gp"
            ct.contains("quicktime") -> "mov"
            ct.contains("webm") -> "webm"
            else -> "dat"
        }
    }
}
