package com.contact.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.app.PendingIntent
import android.net.Uri
import android.os.Build
import android.telephony.SmsManager
import android.provider.Telephony
import android.util.Log
import androidx.core.content.FileProvider
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import kotlin.concurrent.thread

/**
 * Receives WAP Push (MMS notification), delegates download to
 * MmsDownloadHelper, and notifies the React Native JS layer.
 */
class WapPushReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WapPushReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.WAP_PUSH_DELIVER_ACTION) return

        val pduBytes = intent.getByteArrayExtra("data") ?: return
        val pendingResult = goAsync()

        thread(name = "mms_download") {
            try {
                val downloaded = MmsDownloadHelper.download(context, pduBytes)
                if (downloaded) {
                    abortBroadcast()
                    emitToJs(context)
                } else {
                    Log.w(TAG, "Manual MMS download failed; requesting system download")
                    requestSystemDownload(context, pduBytes)
                }
            } catch (e: Exception) {
                Log.e(TAG, "MMS download failed", e)
                requestSystemDownload(context, pduBytes)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun requestSystemDownload(context: Context, pduBytes: ByteArray) {
        try {
            val contentLocation = MmsDownloadHelper.contentLocation(pduBytes) ?: return
            val outFile = File(context.cacheDir, "incoming_mms_download_${System.currentTimeMillis()}.pdu")
            val outputUri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                outFile
            )
            val callback = Intent(context, MmsDownloadReceiver::class.java).apply {
                action = MmsDownloadReceiver.ACTION_MMS_DOWNLOADED
                putExtra(MmsDownloadReceiver.EXTRA_PDU_PATH, outFile.absolutePath)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                outFile.absolutePath.hashCode(),
                callback,
                flags
            )
            context.grantUriPermission(context.packageName, outputUri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            SmsManager.getDefault().downloadMultimediaMessage(
                context,
                contentLocation,
                outputUri,
                null,
                pendingIntent
            )
            Log.i(TAG, "System MMS download requested: $contentLocation")
        } catch (e: Exception) {
            Log.e(TAG, "System MMS download request failed", e)
        }
    }

    private fun emitToJs(context: Context) {
        try {
            val reactContext = (context.applicationContext as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext
            if (reactContext != null) {
                val args = Arguments.createMap().apply {
                    putDouble("timestamp", System.currentTimeMillis().toDouble())
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onMmsReceived", args)
                Log.i(TAG, "Emitted onMmsReceived to JS")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit to JS", e)
        }
    }
}
