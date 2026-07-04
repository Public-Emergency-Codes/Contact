package com.contact.app

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.CallAudioState
import android.util.Base64
import android.util.Log
import android.speech.tts.TextToSpeech
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale
import java.util.concurrent.Executors

/**
 * CallAudioModule
 *
 * Injects audio into an active phone call so the **remote party (dispatcher)**
 * can hear it, and captures microphone audio for on-device speech recognition.
 *
 * Key insight: Android mixes audio written to STREAM_VOICE_CALL / the VOICE_CALL
 * AudioTrack into the call's uplink — the 911 dispatcher hears whatever we play.
 *
 * Exposed to React Native:
 *  - speakIntoCall(text)          -> TTS -> dispatcher hears spoken text
 *  - injectAudio(base64)          -> raw 16-bit PCM -> dispatcher hears it
 *  - startCapture(config)         -> mic -> emits onAudioChunk events
 *  - stopCapture()
 *  - setCallVolume(level 0-1)     -> adjust call stream volume
 *
 * Events emitted:
 *  - onAudioChunk { data: base64, timestamp, sampleRate, channels }
 *  - onTtsReady   { ready: boolean }
 */
class CallAudioModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "CallAudioModule"

    private val audioManager by lazy {
        reactContext.getSystemService(AudioManager::class.java)
    }
    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())

    // ── Text-to-speech ────────────────────────────────────────────

    @Volatile private var tts: TextToSpeech? = null
    @Volatile private var ttsReady = false

    /** Initialize TTS engine with STREAM_VOICE_CALL so dispatcher hears it. */
    @ReactMethod
    fun initTts(langTag: String, promise: Promise) {
        tts?.shutdown()
        tts = TextToSpeech(reactContext) { status ->
            ttsReady = (status == TextToSpeech.SUCCESS)
            if (ttsReady) {
                tts?.language = Locale.forLanguageTag(langTag.ifBlank { "en-US" })
                tts?.setSpeechRate(0.95f)
                tts?.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .setLegacyStreamType(AudioManager.STREAM_VOICE_CALL)
                        .build()
                )
                emit("onTtsReady", Arguments.createMap().apply { putBoolean("ready", true) })
                promise.resolve(true)
            } else {
                promise.reject("TTS_INIT_FAIL", "TextToSpeech initialization failed")
            }
        }
    }

    /**
     * Convert [text] to speech and play it into the active call so the
     * dispatcher can hear the caller's typed message spoken aloud.
     */
    @ReactMethod
    fun speakIntoCall(text: String, promise: Promise) {
        fun doSpeak() {
            val routedViaInCall = CallManager.setAudioRoute(CallAudioState.ROUTE_SPEAKER)
            if (!routedViaInCall) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val speaker = audioManager?.availableCommunicationDevices
                        ?.firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                    if (speaker != null) audioManager?.setCommunicationDevice(speaker)
                } else {
                    @Suppress("DEPRECATION")
                    audioManager?.isSpeakerphoneOn = true
                }
            }
            val result = tts!!.speak(text, TextToSpeech.QUEUE_ADD, null, "es_call_${System.currentTimeMillis()}")
            val durationMs = (text.split(" ").size * 600L).coerceAtLeast(2000L)
            handler.postDelayed({
                if (!CallManager.setAudioRoute(CallAudioState.ROUTE_EARPIECE)) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        audioManager?.clearCommunicationDevice()
                    } else {
                        @Suppress("DEPRECATION")
                        audioManager?.isSpeakerphoneOn = false
                    }
                }
            }, durationMs)
            promise.resolve(result == TextToSpeech.SUCCESS)
        }

        if (ttsReady && tts != null) {
            doSpeak()
        } else {
            handler.postDelayed({
                if (ttsReady && tts != null) doSpeak()
                else promise.reject("TTS_NOT_READY", "TTS engine did not initialise in time")
            }, 3000)
        }
    }

    // ── Raw PCM injection ────────────────────────────────────────

    /**
     * Decode a base64-encoded 16-bit PCM buffer (16 kHz, mono) and write it
     * directly to the call's voice uplink via AudioTrack with STREAM_VOICE_CALL.
     */
    @ReactMethod
    fun injectAudio(base64Pcm: String, promise: Promise) {
        executor.submit {
            try {
                val pcmBytes = Base64.decode(base64Pcm, Base64.DEFAULT)
                val sampleRate = 16000
                val minBuf = AudioTrack.getMinBufferSize(
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT
                )
                val bufSize = maxOf(minBuf, pcmBytes.size)

                val track = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    AudioTrack.Builder()
                        .setAudioAttributes(
                            AudioAttributes.Builder()
                                .setLegacyStreamType(AudioManager.STREAM_VOICE_CALL)
                                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build()
                        )
                        .setAudioFormat(
                            AudioFormat.Builder()
                                .setSampleRate(sampleRate)
                                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                                .build()
                        )
                        .setBufferSizeInBytes(bufSize)
                        .setTransferMode(AudioTrack.MODE_STATIC)
                        .build()
                } else {
                    @Suppress("DEPRECATION")
                    AudioTrack(
                        AudioManager.STREAM_VOICE_CALL,
                        sampleRate,
                        AudioFormat.CHANNEL_OUT_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                        bufSize,
                        AudioTrack.MODE_STATIC
                    )
                }

                audioManager?.mode = AudioManager.MODE_IN_CALL
                track.write(pcmBytes, 0, pcmBytes.size)
                track.play()

                val durationMs = (pcmBytes.size / 2L * 1000L / sampleRate)
                Thread.sleep(durationMs + 200)
                track.stop()
                track.release()
                reactContext.runOnUiQueueThread { promise.resolve(true) }
            } catch (e: Exception) {
                Log.e(TAG, "injectAudio failed", e)
                reactContext.runOnUiQueueThread { promise.reject("INJECT_AUDIO_ERROR", e.message, e) }
            }
        }
    }

    // ── Microphone capture (for dispatcher transcription) ─────────

    @Volatile private var audioRecord: AudioRecord? = null
    @Volatile private var capturing = false

    @ReactMethod
    fun startCapture(config: ReadableMap, promise: Promise) {
        if (!CallManager.hasOngoingCall()) {
            promise.reject("NO_ACTIVE_CALL", "Microphone capture requires an active call")
            return
        }
        if (capturing) { promise.resolve(false); return }
        val sampleRate = if (config.hasKey("sampleRate")) config.getInt("sampleRate") else 16000
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val readBuf = minBuf * 4

        val rec = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            readBuf
        )
        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            rec.release()
            promise.reject("CAPTURE_INIT_FAIL", "AudioRecord failed to initialize"); return
        }

        audioRecord = rec
        capturing = true
        rec.startRecording()
        promise.resolve(true)

        executor.submit {
            val buf = ByteArray(minBuf)
            while (capturing && CallManager.hasOngoingCall()) {
                val bytesRead = rec.read(buf, 0, minBuf)
                if (bytesRead > 0) {
                    val pcm = buf.copyOf(bytesRead)
                    val encoded = Base64.encodeToString(pcm, Base64.NO_WRAP)
                    val map = Arguments.createMap().apply {
                        putString("data", encoded)
                        putDouble("timestamp", System.currentTimeMillis().toDouble())
                        putInt("sampleRate", sampleRate)
                        putInt("channels", 1)
                    }
                    emit("onAudioChunk", map)
                }
            }
            if (audioRecord === rec) {
                capturing = false
                try { rec.stop() } catch (_: Exception) {}
                try { rec.release() } catch (_: Exception) {}
                audioRecord = null
            }
        }
    }

    @ReactMethod
    fun stopCapture(promise: Promise) {
        capturing = false
        try { audioRecord?.stop() } catch (_: Exception) {}
        try { audioRecord?.release() } catch (_: Exception) {}
        audioRecord = null
        promise.resolve(true)
    }

    override fun invalidate() {
        capturing = false
        try { audioRecord?.stop() } catch (_: Exception) {}
        try { audioRecord?.release() } catch (_: Exception) {}
        audioRecord = null
        try { tts?.shutdown() } catch (_: Exception) {}
        tts = null
        executor.shutdownNow()
        super.invalidate()
    }

    // ── Volume ────────────────────────────────────────────────────

    @ReactMethod
    fun setCallVolume(level: Double, promise: Promise) {
        val am = audioManager
        if (am == null) { promise.resolve(false); return }
        val maxVol = am.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)
        val scaled = (level * maxVol).toInt().coerceIn(0, maxVol)
        am.setStreamVolume(AudioManager.STREAM_VOICE_CALL, scaled, 0)
        promise.resolve(true)
    }

    // ── Event stubs ─────────────────────────────────────────────

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    private fun emit(event: String, payload: com.facebook.react.bridge.WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, payload)
    }

    companion object {
        private const val TAG = "CallAudioModule"
    }
}
