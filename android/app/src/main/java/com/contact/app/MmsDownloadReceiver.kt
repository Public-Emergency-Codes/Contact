package com.contact.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class MmsDownloadReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_MMS_DOWNLOADED) return

        val path = intent.getStringExtra(EXTRA_PDU_PATH) ?: return
        try {
            val file = File(path)
            if (!file.exists() || file.length() <= 0L) {
                Log.w(TAG, "Downloaded MMS PDU missing or empty: $path")
                return
            }

            val stored = MmsDownloadHelper.storeDownloadedPdu(context, file.readBytes())
            Log.i(TAG, "System MMS download stored=$stored path=$path")
            if (stored) emitToJs(context)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to store system-downloaded MMS", e)
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
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to emit onMmsReceived", e)
        }
    }

    companion object {
        const val ACTION_MMS_DOWNLOADED = "com.contact.app.ACTION_MMS_DOWNLOADED"
        const val EXTRA_PDU_PATH = "extra_pdu_path"
        private const val TAG = "MmsDownloadReceiver"
    }
}
