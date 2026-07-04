package com.contact.app

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/** Launches Android's share sheet with an actual EXTRA_STREAM attachment. */
class ShareFileModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "ShareFile"

    @ReactMethod
    fun share(uriString: String, requestedMimeType: String?, displayName: String?, promise: Promise) {
        try {
            val rawUri = Uri.parse(uriString)
            val shareUri = when (rawUri.scheme?.lowercase()) {
                "content" -> rawUri
                "file", null -> {
                    val path = if (rawUri.scheme == "file") rawUri.path else uriString
                    val file = File(path ?: throw IllegalArgumentException("File URI has no path"))
                    require(file.exists()) { "Shared file does not exist: ${file.absolutePath}" }
                    FileProvider.getUriForFile(
                        reactApplicationContext,
                        "${reactApplicationContext.packageName}.fileprovider",
                        file,
                    )
                }
                else -> throw IllegalArgumentException("Unsupported share URI: $uriString")
            }

            val extension = MimeTypeMap.getFileExtensionFromUrl(displayName ?: uriString)
            val inferredMime = MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(extension.lowercase())
            val mimeType = requestedMimeType
                ?.takeIf { it.isNotBlank() && it != "*/*" }
                ?: reactApplicationContext.contentResolver.getType(shareUri)
                ?: inferredMime
                ?: "application/octet-stream"
            val label = displayName?.takeIf { it.isNotBlank() } ?: "Shared file"

            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, shareUri)
                clipData = ClipData.newUri(reactApplicationContext.contentResolver, label, shareUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(sendIntent, "Share $label").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            reactApplicationContext.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHARE_FILE_FAILED", e.message, e)
        }
    }
}
