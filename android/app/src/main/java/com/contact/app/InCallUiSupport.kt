package com.contact.app

import android.content.Context
import android.media.AudioManager
import android.net.Uri
import android.provider.ContactsContract
import android.telecom.CallAudioState
import android.view.View
import android.widget.ImageButton
import android.widget.TextView

object InCallUiSupport {
    fun resolveCallerName(context: Context, number: String): String? {
        if (number.isBlank()) return null
        return try {
            val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
            context.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) it.getString(0) else null
            }
        } catch (_: Exception) {
            null
        }
    }

    fun setIncomingExtrasVisible(panel: View, visible: Boolean) {
        panel.visibility = if (visible) View.VISIBLE else View.GONE
    }

    fun sendQuickReply(context: Context, number: String, message: String) {
        if (number.isBlank() || message.isBlank()) return
        IncomingCallQuickReplyReceiver.sendQuickReply(context, number, message)
    }

    fun setAudioRouteWithFallback(context: Context, route: Int, forceSpeakerOn: Boolean) {
        val am = context.getSystemService(AudioManager::class.java) ?: return
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        am.isSpeakerphoneOn = forceSpeakerOn
        CallManager.setAudioRoute(route)
    }

    fun syncAudioRouteUi(route: Int, speakerButton: ImageButton, bluetoothButton: ImageButton): Pair<Boolean, Boolean> {
        val speaker = route and CallAudioState.ROUTE_SPEAKER != 0
        val bluetooth = route and CallAudioState.ROUTE_BLUETOOTH != 0
        speakerButton.isSelected = speaker
        bluetoothButton.isSelected = bluetooth
        return speaker to bluetooth
    }

    fun bindIncomingDetails(
        context: Context,
        number: String,
        lastCallText: TextView,
        recentSmsText: TextView,
        recentSmsCard: View,
    ) {
        val snapshot = IncomingCallMetadataHelper.load(context, number)
        lastCallText.text = snapshot.lastCallText ?: "No recent call found"
        recentSmsText.text = snapshot.recentSmsText ?: "No recent SMS found"
        val hasSms = !snapshot.recentSmsNumber.isNullOrBlank() && !snapshot.recentSmsBody.isNullOrBlank()
        recentSmsCard.isEnabled = hasSms
        recentSmsCard.alpha = if (hasSms) 1f else 0.5f
        recentSmsCard.isClickable = hasSms
    }

    fun showQuickReplySheet(manager: androidx.fragment.app.FragmentManager, number: String) {
        QuickReplyBottomSheet.show(manager, number)
    }

    fun dismissQuickReplySheet(manager: androidx.fragment.app.FragmentManager) {
        QuickReplyBottomSheet.dismiss(manager)
    }
}
