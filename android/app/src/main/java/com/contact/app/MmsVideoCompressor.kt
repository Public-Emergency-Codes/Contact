package com.contact.app

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.content.FileProvider
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.AudioEncoderSettings
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Effects
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import java.io.File
import kotlin.math.max
import kotlin.math.min

/** Transcodes videos to the carrier's extremely small MMS byte budget. */
@OptIn(UnstableApi::class)
class MmsVideoCompressor(private val context: Context) {
    fun compress(
        input: Uri,
        maxBytes: Int,
        onSuccess: (Uri) -> Unit,
        onError: (Exception) -> Unit,
    ) {
        try {
            val durationMs = MediaMetadataRetriever().use { retriever ->
                retriever.setDataSource(context, input)
                retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                    ?.toLongOrNull() ?: 0L
            }
            require(durationMs > 0) { "Unable to determine video duration" }

            // Leave room for MMS headers/text and encoder/container variance.
            val payloadBudget = (maxBytes - 24 * 1024).coerceAtLeast(80 * 1024)
            val totalBitrate = ((payloadBudget.toLong() * 8_000L) / durationMs)
                .coerceIn(48_000L, 240_000L).toInt()
            val audioBitrate = min(24_000, max(12_000, totalBitrate / 5))
            val videoBitrate = max(32_000, totalBitrate - audioBitrate)
            val output = File(context.cacheDir, "mms_video_${System.currentTimeMillis()}.mp4")

            Log.i(
                "DirectSms",
                "Compressing MMS video durationMs=$durationMs maxBytes=$maxBytes " +
                    "videoBitrate=$videoBitrate audioBitrate=$audioBitrate",
            )

            val encoderFactory = DefaultEncoderFactory.Builder(context)
                .setEnableFallback(true)
                .setRequestedVideoEncoderSettings(
                    VideoEncoderSettings.Builder().setBitrate(videoBitrate).build(),
                )
                .setRequestedAudioEncoderSettings(
                    AudioEncoderSettings.Builder().setBitrate(audioBitrate).build(),
                )
                .build()
            val edited = EditedMediaItem.Builder(MediaItem.fromUri(input))
                .setEffects(Effects(emptyList(), listOf<Effect>(Presentation.createForHeight(240))))
                .build()
            val transformer = Transformer.Builder(context)
                .setEncoderFactory(encoderFactory)
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                .addListener(object : Transformer.Listener {
                    override fun onCompleted(composition: Composition, result: ExportResult) {
                        Log.i("DirectSms", "MMS video compressed to ${output.length()} bytes")
                        if (output.length() <= 0L) {
                            onError(IllegalStateException("Video compression produced an empty file"))
                            return
                        }
                        if (output.length() > maxBytes - 8 * 1024L) {
                            onError(
                                IllegalStateException(
                                    "Compressed video is still too large for this carrier " +
                                        "(${output.length()} bytes; limit $maxBytes)",
                                ),
                            )
                            return
                        }
                        onSuccess(
                            FileProvider.getUriForFile(
                                context,
                                "${context.packageName}.fileprovider",
                                output,
                            ),
                        )
                    }

                    override fun onError(
                        composition: Composition,
                        result: ExportResult,
                        exception: ExportException,
                    ) {
                        Log.e("DirectSms", "MMS video compression failed", exception)
                        output.delete()
                        onError(exception)
                    }
                })
                .build()
            transformer.start(edited, output.absolutePath)
        } catch (e: Exception) {
            onError(e)
        }
    }
}
