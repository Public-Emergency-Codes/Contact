package com.contact.app

import android.telecom.Call
import android.telecom.VideoProfile
import android.view.View
import android.view.TextureView

/**
 * Minimal telecom video controller used by InCallUiActivity.
 *
 * This keeps UI state synchronized with the active call while staying safe
 * when video call surfaces are not available yet.
 */
class TelecomVideoController(
    private val context: android.content.Context,
    private val remoteView: TextureView,
    private val previewContainer: View,
    private val previewView: TextureView,
    private val activeCallProvider: () -> Call?
) {
    private var hasRemoteVideoFrames: Boolean = false
    private var remoteVideoRejected: Boolean = false

    fun refresh() {
        val activeCall = activeCallProvider()
        val isVideo = isVideoCall(activeCall)

        if (!isVideo) {
            remoteView.visibility = View.GONE
            previewContainer.visibility = View.GONE
            hasRemoteVideoFrames = false
            remoteVideoRejected = false
            return
        }

        val details = activeCall?.details
        val videoState = details?.videoState ?: 0
        val isBidirectional =
            VideoProfile.isTransmissionEnabled(videoState) &&
                VideoProfile.isReceptionEnabled(videoState)

        remoteView.visibility = if (isBidirectional) View.VISIBLE else View.GONE
        previewContainer.visibility = if (isBidirectional) View.VISIBLE else View.GONE

        hasRemoteVideoFrames = isBidirectional
        remoteVideoRejected = !isBidirectional
    }

    fun hasRemoteFrames(): Boolean {
        return hasRemoteVideoFrames
    }

    fun isRemoteVideoRejected(): Boolean {
        return remoteVideoRejected
    }

    fun release() {
        hasRemoteVideoFrames = false
        remoteVideoRejected = false
        remoteView.visibility = View.GONE
        previewContainer.visibility = View.GONE
    }

    private fun isVideoCall(call: Call?): Boolean {
        val details = call?.details ?: return false
        return VideoProfile.isVideo(details.videoState)
    }
}
