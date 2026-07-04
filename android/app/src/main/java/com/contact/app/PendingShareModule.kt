package com.contact.app

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Gives JavaScript access to the exact file written by MainActivity.  Using
 * Context.cacheDir here avoids relying on expo-file-system and Android to
 * independently describe the same directory in the same URI format.
 */
class PendingShareModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "PendingShare"

    private fun pendingFile() = File(reactApplicationContext.cacheDir, "pending_share.json")

    @ReactMethod
    fun consume(promise: Promise) {
        try {
            val file = pendingFile()
            Log.i("MainActivity", "PendingShare.consume path=${file.absolutePath} exists=${file.exists()}")
            if (!file.exists()) {
                promise.resolve(null)
                return
            }
            val json = file.readText()
            if (!file.delete()) {
                Log.w("MainActivity", "PendingShare.consume could not delete ${file.absolutePath}")
            }
            promise.resolve(json)
        } catch (e: Exception) {
            promise.reject("PENDING_SHARE_READ_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getFilePath(promise: Promise) {
        promise.resolve(pendingFile().absolutePath)
    }
}
