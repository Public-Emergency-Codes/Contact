package com.contact.app

import android.app.Activity
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.telephony.SmsManager
import android.util.Log
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.klinker.android.send_message.Message
import com.klinker.android.send_message.Settings
import com.klinker.android.send_message.Transaction
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.max
import kotlin.math.roundToInt

class DirectSmsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "DirectSms"
    private val requestCodeCounter = AtomicInteger(1000)
    private var pendingSmsRolePromise: Promise? = null
    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != REQUEST_CODE_SMS_ROLE) return
            val pending = pendingSmsRolePromise ?: return
            pendingSmsRolePromise = null
            pending.resolve(checkDefaultSmsApp())
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    /** Returns whether contact currently owns Android's default SMS role. */
    @ReactMethod
    fun isDefaultSmsApp(promise: Promise) {
        try {
            promise.resolve(checkDefaultSmsApp())
        } catch (e: Exception) {
            promise.reject("SMS_ROLE_CHECK_ERROR", e.message, e)
        }
    }

    /** Opens Android's role picker for the default texting app. */
    @ReactMethod
    fun requestDefaultSmsApp(promise: Promise) {
        val activity = reactContext.currentActivity ?: run {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }

        activity.runOnUiThread {
            try {
                if (checkDefaultSmsApp()) {
                    promise.resolve(true)
                    return@runOnUiThread
                }

                val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val roleManager = activity.getSystemService(android.app.role.RoleManager::class.java)
                    if (roleManager?.isRoleAvailable(android.app.role.RoleManager.ROLE_SMS) != true) {
                        promise.resolve(false)
                        return@runOnUiThread
                    }
                    roleManager.createRequestRoleIntent(android.app.role.RoleManager.ROLE_SMS)
                } else {
                    Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT).apply {
                        putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, activity.packageName)
                    }
                }

                pendingSmsRolePromise?.reject("SMS_ROLE_REPLACED", "A newer SMS role request replaced this one")
                pendingSmsRolePromise = promise
                activity.startActivityForResult(intent, REQUEST_CODE_SMS_ROLE)
            } catch (e: Exception) {
                pendingSmsRolePromise = null
                promise.reject("SMS_ROLE_REQUEST_ERROR", e.message, e)
            }
        }
    }

    private fun emit(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Send SMS silently in the background with delivery tracking.
     * Emits "onSmsSent" and "onSmsDelivered" events.
     */
    @ReactMethod
    fun sendSms(phoneNumber: String, message: String, threadId: String, promise: Promise) {
        try {
            val smsManager = SmsManager.getDefault()
            val parts = smsManager.divideMessage(message)
            val msgId = System.currentTimeMillis().toString()

            val sentAction = "SMS_SENT_$msgId"
            val deliveredAction = "SMS_DELIVERED_$msgId"

            // Register sent callback
            val sentReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    val params = Arguments.createMap().apply {
                        putString("messageId", msgId)
                        putString("phoneNumber", phoneNumber)
                        putInt("resultCode", resultCode)
                        putBoolean("success", resultCode == Activity.RESULT_OK)
                    }
                    emit("onSmsSent", params)
                    try { reactContext.unregisterReceiver(this) } catch (_: Exception) {}
                }
            }

            // Register delivery callback
            val deliveredReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    val params = Arguments.createMap().apply {
                        putString("messageId", msgId)
                        putString("phoneNumber", phoneNumber)
                        putBoolean("delivered", resultCode == Activity.RESULT_OK)
                    }
                    emit("onSmsDelivered", params)
                    try { reactContext.unregisterReceiver(this) } catch (_: Exception) {}
                }
            }

            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            else PendingIntent.FLAG_UPDATE_CURRENT

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(sentReceiver, IntentFilter(sentAction), Context.RECEIVER_NOT_EXPORTED)
                reactContext.registerReceiver(deliveredReceiver, IntentFilter(deliveredAction), Context.RECEIVER_NOT_EXPORTED)
            } else {
                reactContext.registerReceiver(sentReceiver, IntentFilter(sentAction))
                reactContext.registerReceiver(deliveredReceiver, IntentFilter(deliveredAction))
            }

            // Use explicit intents (set package) to satisfy Android 14+ requirements
            val sentIntent = Intent(sentAction).apply { setPackage(reactContext.packageName) }
            val deliveredIntent = Intent(deliveredAction).apply { setPackage(reactContext.packageName) }
            val sentPI = PendingIntent.getBroadcast(reactContext, requestCodeCounter.getAndIncrement(), sentIntent, flags)
            val deliveredPI = PendingIntent.getBroadcast(reactContext, requestCodeCounter.getAndIncrement(), deliveredIntent, flags)

            if (parts.size > 1) {
                val sentIntents = ArrayList(parts.map { sentPI })
                val deliveredIntents = ArrayList(parts.map { deliveredPI })
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, deliveredIntents)
            } else {
                smsManager.sendTextMessage(phoneNumber, null, message, sentPI, deliveredPI)
            }

            // Write sent message to the SMS content provider so it appears
            // when querying content://sms (SmsManager does NOT auto-save).
            saveSentMessage(phoneNumber, message, threadId, msgId)

            promise.resolve(msgId)
        } catch (e: Exception) {
            promise.reject("SMS_ERROR", e.message, e)
        }
    }

    /**
     * Write a sent SMS to the content://sms provider so it shows up in
     * queries (SmsManager.sendTextMessage does NOT auto-save sent messages).
     */
    private fun saveSentMessage(phoneNumber: String, body: String, threadId: String, msgId: String) {
        try {
            val resolver = reactContext.contentResolver

            // Use the JS-provided threadId; if empty, try to look it up
            var tid = threadId.toLongOrNull() ?: 0L
            if (tid == 0L) {
                val cursor = resolver.query(
                    android.net.Uri.parse("content://sms"),
                    arrayOf("thread_id"),
                    "address LIKE ?",
                    arrayOf("%$phoneNumber%"),
                    "date DESC LIMIT 1"
                )
                cursor?.use { c ->
                    if (c.moveToFirst()) {
                        tid = c.getLong(0)
                    }
                }
            }

            val values = android.content.ContentValues().apply {
                put("address", phoneNumber)
                put("body", body)
                put("date", System.currentTimeMillis())
                put("type", 2)          // 2 = sent
                put("read", 1)
                put("seen", 1)
                if (tid > 0) {
                    put("thread_id", tid)
                }
            }

            val uri = resolver.insert(
                android.net.Uri.parse("content://sms"),
                values
            )
            Log.i("DirectSms", "saveSentMessage($msgId): uri=$uri, tid=$tid, addr=$phoneNumber")
        } catch (e: Exception) {
            Log.w("DirectSms", "saveSentMessage failed (non-fatal): ${e.message}")
        }
    }

    /**
     * Send an MMS with an image attachment. Default SMS apps use the carrier MMS path;
     * other apps fall back to opening a composer with the image prefilled.
     */
    @ReactMethod
    fun sendMms(phoneNumber: String, message: String, imageUri: String, promise: Promise) {
        try {
            if (phoneNumber.isBlank()) {
                promise.reject("MMS_ERROR", "phoneNumber is required")
                return
            }
            if (imageUri.isBlank()) {
                promise.reject("MMS_ERROR", "imageUri is required")
                return
            }

            val shareUri = toSharableUri(imageUri)
            val msgId = "mms_${System.currentTimeMillis()}"
            val mimeType = reactContext.contentResolver.getType(shareUri) ?: "application/octet-stream"

            Log.i("DirectSms", "sendMms requested to=$phoneNumber msgLen=${message.length} uri=$shareUri mime=$mimeType")
            prepareMmsAttachment(shareUri, mimeType, promise) { preparedUri ->
                val ok = sendCarrierMmsPdu(phoneNumber, message, arrayListOf(preparedUri)) { sent, error ->
                    if (sent) promise.resolve(msgId)
                    else promise.reject("MMS_SEND_FAILED", error ?: "Carrier rejected the MMS")
                }
                if (!ok) promise.reject("MMS_SEND_FAILED", "Unable to dispatch carrier MMS")
            }
        } catch (e: Exception) {
            promise.reject("MMS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun sendMmsNoFallback(phoneNumber: String, message: String, imageUri: String, promise: Promise) {
        try {
            if (phoneNumber.isBlank()) {
                promise.reject("MMS_ERROR", "phoneNumber is required")
                return
            }
            if (imageUri.isBlank()) {
                promise.reject("MMS_ERROR", "imageUri is required")
                return
            }

            val shareUri = toSharableUri(imageUri)
            val msgId = "mms_${System.currentTimeMillis()}"
            Log.i("DirectSms", "sendMmsNoFallback requested to=$phoneNumber msgLen=${message.length} uri=$shareUri")
            val mimeType = reactContext.contentResolver.getType(shareUri) ?: "application/octet-stream"
            prepareMmsAttachment(shareUri, mimeType, promise) { preparedUri ->
                val ok = sendCarrierMmsPdu(phoneNumber, message, arrayListOf(preparedUri)) { sent, error ->
                    if (sent) promise.resolve(msgId)
                    else promise.reject("MMS_SEND_FAILED", error ?: "Carrier rejected the MMS")
                }
                if (!ok) promise.reject("MMS_SEND_FAILED", "Unable to dispatch carrier MMS")
            }
        } catch (e: Exception) {
            promise.reject("MMS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun sendMmsImages(phoneNumber: String, message: String, imageUris: ReadableArray, promise: Promise) {
        try {
            if (phoneNumber.isBlank()) {
                promise.reject("MMS_ERROR", "phoneNumber is required")
                return
            }
            if (imageUris.size() == 0) {
                promise.reject("MMS_ERROR", "at least one imageUri is required")
                return
            }

            val shareUris = ArrayList<Uri>()
            for (i in 0 until imageUris.size()) {
                val rawUri = imageUris.getString(i)
                if (!rawUri.isNullOrBlank()) {
                    shareUris.add(toSharableUri(rawUri))
                }
            }
            if (shareUris.isEmpty()) {
                promise.reject("MMS_ERROR", "at least one imageUri is required")
                return
            }

            val msgId = "mms_${System.currentTimeMillis()}"
            Log.i("DirectSms", "sendMmsImages requested to=$phoneNumber msgLen=${message.length} images=${shareUris.size}")
            val ok = sendCarrierMmsPdu(phoneNumber, message, shareUris) { sent, error ->
                if (sent) promise.resolve(msgId)
                else promise.reject("MMS_SEND_FAILED", error ?: "Carrier rejected the MMS")
            }
            if (!ok) promise.reject("MMS_SEND_FAILED", "Unable to dispatch carrier MMS")
        } catch (e: Exception) {
            promise.reject("MMS_ERROR", e.message, e)
        }
    }

    private fun startMmsActivity(phoneNumber: String, message: String, shareUris: ArrayList<Uri>) {
        val intent = if (shareUris.size == 1) {
            Intent(Intent.ACTION_SEND).apply {
                type = "image/*"
                putExtra(Intent.EXTRA_STREAM, shareUris[0])
                clipData = ClipData.newUri(reactContext.contentResolver, "mms_image", shareUris[0])
            }
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                type = "image/*"
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, shareUris)
                clipData = buildClipData(shareUris)
            }
        }

        intent.apply {
            putExtra("address", phoneNumber)
            putExtra("sms_body", message)
            putExtra(Intent.EXTRA_TEXT, message)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

        // Try to target the user's chosen SMS app directly
        val defaultSms = Telephony.Sms.getDefaultSmsPackage(reactContext)
        if (!defaultSms.isNullOrBlank()) {
            intent.setPackage(defaultSms)
        }

        // Use chooser as fallback so user always sees where to send
        val chooser = Intent.createChooser(intent, "Send MMS").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            reactContext.startActivity(chooser)
        } catch (e: Exception) {
            Log.w("DirectSms", "Failed to start MMS chooser", e)
        }
    }

    private fun buildSendToIntent(phoneNumber: String, message: String, shareUris: ArrayList<Uri>): Intent {
        return Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${Uri.encode(phoneNumber)}")).apply {
            putExtra("address", phoneNumber)
            putExtra("sms_body", message)
            putExtra(Intent.EXTRA_TEXT, message)
            if (shareUris.size == 1) {
                putExtra(Intent.EXTRA_STREAM, shareUris[0])
                clipData = ClipData.newUri(reactContext.contentResolver, "mms_image", shareUris[0])
            } else {
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, shareUris)
                clipData = buildClipData(shareUris)
            }
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private fun buildShareIntent(phoneNumber: String, message: String, shareUris: ArrayList<Uri>): Intent {
        return Intent(if (shareUris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
            type = "image/*"
            putExtra("address", phoneNumber)
            putExtra("sms_body", message)
            putExtra(Intent.EXTRA_TEXT, message)
            if (shareUris.size == 1) {
                putExtra(Intent.EXTRA_STREAM, shareUris[0])
                clipData = ClipData.newUri(reactContext.contentResolver, "mms_image", shareUris[0])
            } else {
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, shareUris)
                clipData = buildClipData(shareUris)
            }
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private fun buildClipData(shareUris: ArrayList<Uri>): ClipData {
        val clip = ClipData.newUri(reactContext.contentResolver, "mms_image_0", shareUris[0])
        for (i in 1 until shareUris.size) {
            clip.addItem(ClipData.Item(shareUris[i]))
        }
        return clip
    }

    /**
     * Send MMS by building a raw PDU, writing it to a FileProvider-backed
     * cache file, granting the telephony provider temporary read access,
     * and calling SmsManager.sendMultimediaMessage().
     *
     * This bypasses the locked content://mms provider on Motorola/Android One
     * devices where ContentResolver.insert() is permission-blocked even for
     * apps holding the SMS role.
     */
    private data class MmsPart(val data: ByteArray, val mimeType: String, val fileName: String)

    private fun prepareMmsAttachment(uri: Uri, mimeType: String, promise: Promise, ready: (Uri) -> Unit) {
        if (!mimeType.startsWith("video/")) {
            ready(uri)
            return
        }
        val maxBytes = carrierMmsMaxBytes()
        val size = queryUriSize(uri)
        if (size in 1 until maxBytes.toLong()) {
            ready(uri)
            return
        }
        Handler(Looper.getMainLooper()).post {
            MmsVideoCompressor(reactContext).compress(
                uri,
                maxBytes,
                onSuccess = ready,
                onError = { promise.reject("MMS_VIDEO_COMPRESSION_FAILED", it.message, it) },
            )
        }
    }

    private fun carrierMmsMaxBytes(): Int = try {
        val configured = SmsManager.getDefault().carrierConfigValues
            ?.getInt(SmsManager.MMS_CONFIG_MAX_MESSAGE_SIZE, 300 * 1024)
            ?: 300 * 1024
        configured.coerceAtLeast(100 * 1024)
    } catch (_: Exception) {
        300 * 1024
    }

    private fun queryUriSize(uri: Uri): Long = try {
        reactContext.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
    } catch (_: Exception) {
        -1L
    }

    private fun sendCarrierMmsPdu(
        phoneNumber: String,
        messageText: String,
        shareUris: ArrayList<Uri>,
        onResult: (Boolean, String?) -> Unit,
    ): Boolean {
        if (!checkDefaultSmsApp()) {
            Log.i("DirectSms", "Carrier MMS skipped: not default SMS app")
            return false
        }

        return try {
            Log.i("DirectSms", "PDU MMS to=$phoneNumber msgLen=${messageText.length} images=${shareUris.size}")

            // Read image bytes from the shareable URIs
            val mediaParts = shareUris.mapIndexedNotNull { index, uri ->
                val data = readUriBytes(uri)
                val mime = reactContext.contentResolver.getType(uri) ?: "application/octet-stream"
                val ext = android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
                    ?: uri.lastPathSegment?.substringAfterLast('.', "bin")
                    ?: "bin"
                MmsPart(data, mime, "media_$index.$ext")
            }
            if (mediaParts.isEmpty()) {
                Log.e("DirectSms", "PDU MMS: no media data read")
                return false
            }

            val maxBytes = carrierMmsMaxBytes()
            val mediaSize = mediaParts.sumOf { it.data.size.toLong() }
            if (mediaSize >= maxBytes - 8 * 1024L) {
                Log.e("DirectSms", "PDU MMS payload too large: $mediaSize bytes, carrier max=$maxBytes")
                onResult(false, "Attachment is too large for carrier MMS after compression")
                return true
            }

            // Build MMS PDU using AOSP classes bundled with klinker
            val sendReq = com.google.android.mms.pdu_alt.SendReq()
            sendReq.setTo(arrayOf(
                com.google.android.mms.pdu_alt.EncodedStringValue(phoneNumber)
            ))

            val pduBody = com.google.android.mms.pdu_alt.PduBody()

            // Text part
            if (messageText.isNotEmpty()) {
                val textPart = com.google.android.mms.pdu_alt.PduPart()
                textPart.setContentType("text/plain".toByteArray())
                textPart.setContentLocation("text_0.txt".toByteArray())
                textPart.setData(messageText.toByteArray())
                pduBody.addPart(textPart)
            }

            // Media parts retain their actual MIME type and extension.
            for (media in mediaParts) {
                val part = com.google.android.mms.pdu_alt.PduPart()
                part.setContentType(media.mimeType.toByteArray())
                part.setContentLocation(media.fileName.toByteArray())
                part.setName(media.fileName.toByteArray())
                part.setData(media.data)
                pduBody.addPart(part)
            }

            sendReq.setBody(pduBody)

            // Serialize PDU to bytes
            val pduBytes = com.google.android.mms.pdu_alt.PduComposer(reactContext, sendReq).make()
            Log.i("DirectSms", "PDU compiled: ${pduBytes.size} bytes")

            // Write PDU to cache file
            val cacheFile = java.io.File(reactContext.cacheDir, "mms_pdu_${System.currentTimeMillis()}.dat")
            java.io.FileOutputStream(cacheFile).use { it.write(pduBytes) }
            Log.i("DirectSms", "PDU written to ${cacheFile.absolutePath} (${cacheFile.length()} bytes)")

            // Get FileProvider URI
            val contentUri = FileProvider.getUriForFile(
                reactContext,
                "${reactContext.packageName}.fileprovider",
                cacheFile
            )

            // Grant the telephony subsystem temporary read access
            reactContext.grantUriPermission(
                "com.android.providers.telephony",
                contentUri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )

            // Use subscription-specific SmsManager on Android 12+
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                reactContext.getSystemService(SmsManager::class.java)
            } else {
                SmsManager.getDefault()
            }

            val sentAction = "com.contact.app.MMS_SENT_${System.currentTimeMillis()}"
            val resultHandler = Handler(Looper.getMainLooper())
            var finished = false
            val sentReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    if (finished) return
                    finished = true
                    resultHandler.removeCallbacksAndMessages(this)
                    try { reactContext.unregisterReceiver(this) } catch (_: Exception) {}
                    cacheFile.delete()
                    val ok = resultCode == Activity.RESULT_OK
                    val detail = if (ok) null else mmsResultDescription(resultCode)
                    Log.i("DirectSms", "MMS carrier result=$resultCode ok=$ok detail=$detail")
                    onResult(ok, detail)
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(sentReceiver, IntentFilter(sentAction), Context.RECEIVER_NOT_EXPORTED)
            } else {
                reactContext.registerReceiver(sentReceiver, IntentFilter(sentAction))
            }
            val sentPI = PendingIntent.getBroadcast(
                reactContext,
                requestCodeCounter.getAndIncrement(),
                Intent(sentAction).apply { setPackage(reactContext.packageName) },
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )

            smsManager.sendMultimediaMessage(reactContext, contentUri, null, null, sentPI)
            Log.i("DirectSms", "PDU MMS dispatched via SmsManager.sendMultimediaMessage")
            resultHandler.postDelayed({
                if (!finished) {
                    finished = true
                    try { reactContext.unregisterReceiver(sentReceiver) } catch (_: Exception) {}
                    cacheFile.delete()
                    onResult(false, "Timed out waiting for the carrier MMS result")
                }
            }, 120_000L)
            true
        } catch (e: Exception) {
            Log.e("DirectSms", "PDU MMS failed", e)
            false
        }
    }

    private fun mmsResultDescription(code: Int): String = when (code) {
        SmsManager.MMS_ERROR_UNABLE_CONNECT_MMS -> "Unable to connect to the carrier MMS service"
        SmsManager.MMS_ERROR_HTTP_FAILURE -> "Carrier MMS server returned an HTTP failure"
        SmsManager.MMS_ERROR_INVALID_APN -> "Invalid carrier MMS APN configuration"
        SmsManager.MMS_ERROR_CONFIGURATION_ERROR -> "Carrier MMS configuration error"
        SmsManager.MMS_ERROR_NO_DATA_NETWORK -> "No mobile-data network is available for MMS"
        SmsManager.MMS_ERROR_RETRY -> "Carrier requested an MMS retry"
        else -> "Carrier rejected MMS (code $code)"
    }

    private fun readUriBytes(uri: Uri): ByteArray {
        reactContext.contentResolver.openInputStream(uri)?.use { return it.readBytes() }
            ?: throw IllegalArgumentException("Cannot read uri: $uri")
    }

    private fun checkDefaultSmsApp(): Boolean {
        val myPkg = reactContext.packageName

        // Android 10+: check RoleManager (the authority for default SMS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val roleManager = reactContext.getSystemService(android.app.role.RoleManager::class.java)
                if (roleManager != null && roleManager.isRoleHeld(android.app.role.RoleManager.ROLE_SMS)) {
                    Log.i("DirectSms", "isDefaultSmsApp: RoleManager says YES")
                    return true
                }
            } catch (e: Exception) {
                Log.w("DirectSms", "RoleManager check failed", e)
            }
        }

        // Fall back to legacy APIs
        val defaultPkg = Telephony.Sms.getDefaultSmsPackage(reactContext)
        if (defaultPkg != null) {
            val result = defaultPkg == myPkg
            Log.i("DirectSms", "isDefaultSmsApp: Telephony pkg=$defaultPkg result=$result")
            return result
        }

        val securePkg = android.provider.Settings.Secure.getString(
            reactContext.contentResolver, "sms_default_application"
        )
        if (securePkg != null) {
            val result = securePkg == myPkg
            Log.i("DirectSms", "isDefaultSmsApp: Settings.Secure pkg=$securePkg result=$result")
            return result
        }

        Log.i("DirectSms", "isDefaultSmsApp: all checks failed, assuming NOT default")
        return false
    }

    private fun toSharableUri(rawUri: String): Uri {
        Log.i("DirectSms", "toSharableUri input=$rawUri")
        val parsed = Uri.parse(rawUri)
        val authority = "${reactContext.packageName}.fileprovider"

        if (parsed.scheme.equals("content", ignoreCase = true)) {
            val inStream = reactContext.contentResolver.openInputStream(parsed)
                ?: throw IllegalArgumentException("Unable to open image uri: $rawUri")
            val ext = reactContext.contentResolver.getType(parsed)?.substringAfterLast('/') ?: "jpg"
            val outFile = File(reactContext.cacheDir, "mms_${System.currentTimeMillis()}.$ext")
            inStream.use { input ->
                FileOutputStream(outFile).use { output ->
                    input.copyTo(output)
                }
            }
            val result = FileProvider.getUriForFile(reactContext, authority, outFile)
            Log.i("DirectSms", "toSharableUri content->file outFile=$outFile exists=${outFile.exists()} size=${outFile.length()} uri=$result")
            return result
        }

        // file:// URI: copy bytes into a fresh File(reactContext.cacheDir, …)
        // so the path is guaranteed to canonicalize to the exact root the
        // FileProvider expects.  Using the original file directly can fail when
        // /data/user/0 is a symlink to /data/data on the device.
        val path = if (rawUri.startsWith("file://")) rawUri.removePrefix("file://") else rawUri
        val srcFile = File(path)
        if (!srcFile.exists()) {
            throw IllegalArgumentException("Image file does not exist: $rawUri")
        }
        val ext = path.substringAfterLast('.', "jpg")
        val outFile = File(reactContext.cacheDir, "mms_${System.currentTimeMillis()}.$ext")
        srcFile.inputStream().use { input ->
            FileOutputStream(outFile).use { output ->
                input.copyTo(output)
            }
        }
        val result = FileProvider.getUriForFile(reactContext, authority, outFile)
        Log.i("DirectSms", "toSharableUri file->cache outFile=$outFile exists=${outFile.exists()} size=${outFile.length()} uri=$result")
        return result
    }

    override fun invalidate() {
        reactContext.removeActivityEventListener(activityEventListener)
        pendingSmsRolePromise?.reject("MODULE_INVALIDATED", "DirectSms was invalidated")
        pendingSmsRolePromise = null
        super.invalidate()
    }

    companion object {
        private const val REQUEST_CODE_SMS_ROLE = 9002
    }

    @ReactMethod fun addListener(eventName: String?) { /* no-op */ }
    @ReactMethod fun removeListeners(count: Int?) { /* no-op */ }
}
