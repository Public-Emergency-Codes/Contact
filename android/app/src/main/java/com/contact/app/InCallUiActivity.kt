package com.contact.app

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.telecom.Call
import android.telecom.CallAudioState
import android.view.TextureView
import android.view.View
import android.view.WindowManager
import android.widget.ImageButton
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class InCallUiActivity : AppCompatActivity() {
    private lateinit var statusView: TextView
    private lateinit var nameView: TextView
    private lateinit var numberView: TextView
    private lateinit var answerButton: ImageButton
    private lateinit var endButton: ImageButton
    private lateinit var addCallButton: ImageButton
    private lateinit var muteButton: ImageButton
    private lateinit var bluetoothButton: ImageButton
    private lateinit var speakerButton: ImageButton
    private lateinit var keypadButton: ImageButton
    private lateinit var holdButton: ImageButton
    private lateinit var addCallControl: View
    private lateinit var muteControl: View
    private lateinit var bluetoothControl: View
    private lateinit var speakerControl: View
    private lateinit var keypadControl: View
    private lateinit var holdControl: View
    private lateinit var holdLabel: TextView
    private lateinit var keypadPanel: View
    private lateinit var incomingExtrasPanel: View
    private lateinit var lastCallCard: View
    private lateinit var recentSmsCard: View
    private lateinit var lastCallText: TextView
    private lateinit var recentSmsText: TextView
    private lateinit var openQuickReplies: TextView
    private var keypadExpanded = false
    private var controlsVisible = false
    private lateinit var remoteVideoView: TextureView
    private lateinit var previewVideoContainer: View
    private lateinit var previewVideoView: TextureView
    private lateinit var videoController: TelecomVideoController

    private var muted = false
    private var speaker = false
    private var bluetooth = false
    private var activeSinceMs: Long? = null
    private var currentIncomingNumber: String = ""

    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            refreshUi()
            handler.postDelayed(this, 250)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }

        setContentView(R.layout.activity_in_call_ui)
        statusView = findViewById(R.id.callStatus)
        nameView = findViewById(R.id.callName)
        numberView = findViewById(R.id.callNumber)
        answerButton = findViewById(R.id.answerButton)
        endButton = findViewById(R.id.endButton)
        addCallButton = findViewById(R.id.addCallButton)
        muteButton = findViewById(R.id.muteButton)
        bluetoothButton = findViewById(R.id.bluetoothButton)
        speakerButton = findViewById(R.id.speakerButton)
        keypadButton = findViewById(R.id.keypadButton)
        holdButton = findViewById(R.id.holdButton)
        addCallControl = findViewById(R.id.addCallControl)
        muteControl = findViewById(R.id.muteControl)
        bluetoothControl = findViewById(R.id.bluetoothControl)
        speakerControl = findViewById(R.id.speakerControl)
        keypadControl = findViewById(R.id.keypadControl)
        holdControl = findViewById(R.id.holdControl)
        holdLabel = findViewById(R.id.holdLabel)
        keypadPanel = findViewById(R.id.keypadPanel)
        incomingExtrasPanel = findViewById(R.id.incomingExtrasPanel)
        lastCallCard = findViewById(R.id.lastCallCard)
        recentSmsCard = findViewById(R.id.recentSmsCard)
        lastCallText = findViewById(R.id.lastCallText)
        recentSmsText = findViewById(R.id.recentSmsText)
        openQuickReplies = findViewById(R.id.openQuickReplies)
        remoteVideoView = findViewById(R.id.remoteVideoView)
        previewVideoContainer = findViewById(R.id.previewVideoContainer)
        previewVideoView = findViewById(R.id.previewVideoView)

        videoController = TelecomVideoController(this, remoteVideoView, previewVideoContainer, previewVideoView) {
            CallManager.getActiveCall()
        }

        answerButton.setOnClickListener { if (!CallManager.answerCall()) finish() }
        endButton.setOnClickListener { CallManager.endCall(); finish() }
        addCallButton.setOnClickListener {
            try { startActivity(Intent(Intent.ACTION_DIAL).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
        }
        muteButton.setOnClickListener {
            muted = !muted
            CallManager.setMuted(muted)
            muteButton.isSelected = muted
        }
        bluetoothButton.setOnClickListener {
            bluetooth = !bluetooth
            speaker = false
            val route = if (bluetooth) CallAudioState.ROUTE_BLUETOOTH else CallAudioState.ROUTE_EARPIECE
            setAudioRouteWithFallback(route, forceSpeakerOn = false)
            bluetoothButton.isSelected = bluetooth
            speakerButton.isSelected = false
        }
        speakerButton.setOnClickListener {
            speaker = !speaker
            bluetooth = false
            val route = if (speaker) CallAudioState.ROUTE_SPEAKER else CallAudioState.ROUTE_EARPIECE
            setAudioRouteWithFallback(route, forceSpeakerOn = speaker)
            speakerButton.isSelected = speaker
            bluetoothButton.isSelected = false
        }
        keypadButton.setOnClickListener {
            keypadExpanded = !keypadExpanded
            keypadPanel.visibility = if (keypadExpanded) View.VISIBLE else View.GONE
            keypadButton.isSelected = keypadExpanded
            updateExpandedControls()
        }
        holdButton.setOnClickListener {
            val holding = CallManager.getCallState() == Call.STATE_HOLDING
            CallManager.setOnHold(!holding)
        }
        recentSmsCard.setOnClickListener {
            if (currentIncomingNumber.isNotBlank()) {
                IncomingCallMetadataHelper.openSmsChat(this, currentIncomingNumber)
            }
        }
        openQuickReplies.setOnClickListener {
            if (currentIncomingNumber.isNotBlank()) InCallUiSupport.showQuickReplySheet(supportFragmentManager, currentIncomingNumber)
        }
        InCallUiActions.bindDtmfKeypad(this, handler) { CallManager.getActiveCall() }
        refreshUi()
    }

    override fun onResume() {
        super.onResume()
        ReturnToCallOverlay.onCallUiResumed()
        InCallNotificationHelper.isUiVisible = true
        handler.post(ticker)
    }

    override fun onPause() {
        InCallNotificationHelper.isUiVisible = false
        handler.removeCallbacks(ticker)
        super.onPause()
        ReturnToCallOverlay.onCallUiPaused(applicationContext)
    }
    override fun onDestroy() { videoController.release(); super.onDestroy() }

    private fun refreshUi() {
        val state = CallManager.getCallState()
        val isVideo = CallManager.isVideoCall()
        val number = CallManager.getActiveNumber().ifBlank { intent.getStringExtra("number") ?: "Unknown Number" }
        val displayName = InCallUiSupport.resolveCallerName(this, number) ?: number
        videoController.refresh()
        val route = CallManager.getCurrentAudioRoute()
        val routeState = InCallUiSupport.syncAudioRouteUi(route, speakerButton, bluetoothButton)
        speaker = routeState.first
        bluetooth = routeState.second

        nameView.text = displayName
        numberView.text = if (displayName == number) "" else number
        updateHoldButton()

        when (state) {
            Call.STATE_RINGING -> {
                statusView.text = "Incoming Call"
                answerButton.visibility = View.VISIBLE
                endButton.visibility = View.VISIBLE
                activeSinceMs = null
                currentIncomingNumber = number
                InCallUiSupport.bindIncomingDetails(this, number, lastCallText, recentSmsText, recentSmsCard)
                InCallUiSupport.setIncomingExtrasVisible(incomingExtrasPanel, true)
                setInCallControlsVisible(false)
            }
            Call.STATE_DIALING -> { statusView.text = if (isVideo) "Video Calling..." else "Calling..."; answerButton.visibility = View.GONE; activeSinceMs = null; setInCallControlsVisible(true) }
            Call.STATE_ACTIVE -> {
                if (activeSinceMs == null) activeSinceMs = SystemClock.elapsedRealtime()
                statusView.text = formatDuration()
                answerButton.visibility = View.GONE
                endButton.visibility = View.VISIBLE
                InCallUiSupport.setIncomingExtrasVisible(incomingExtrasPanel, false)
                InCallUiSupport.dismissQuickReplySheet(supportFragmentManager)
                setInCallControlsVisible(true)
            }
            Call.STATE_HOLDING -> { statusView.text = "On Hold"; answerButton.visibility = View.GONE; endButton.visibility = View.VISIBLE; InCallUiSupport.setIncomingExtrasVisible(incomingExtrasPanel, false); InCallUiSupport.dismissQuickReplySheet(supportFragmentManager); setInCallControlsVisible(true) }
            Call.STATE_DISCONNECTED, Call.STATE_DISCONNECTING -> { activeSinceMs = null; InCallUiSupport.setIncomingExtrasVisible(incomingExtrasPanel, false); InCallUiSupport.dismissQuickReplySheet(supportFragmentManager); finish(); return }
            else -> { statusView.text = "Connecting..."; answerButton.visibility = View.GONE; endButton.visibility = View.VISIBLE; activeSinceMs = null; InCallUiSupport.setIncomingExtrasVisible(incomingExtrasPanel, false); InCallUiSupport.dismissQuickReplySheet(supportFragmentManager); setInCallControlsVisible(true) }
        }
    }

    private fun setInCallControlsVisible(visible: Boolean) {
        controlsVisible = visible
        val v = if (visible) View.VISIBLE else View.GONE
        addCallControl.visibility = v
        muteControl.visibility = v
        bluetoothControl.visibility = v
        speakerControl.visibility = v
        keypadControl.visibility = v
        holdControl.visibility = v
        if (!visible) keypadPanel.visibility = View.GONE
        if (!visible) keypadButton.isSelected = false
        if (!visible) keypadExpanded = false
        updateExpandedControls()
    }

    private fun updateExpandedControls() {
        if (!controlsVisible) return
        val visible = if (keypadExpanded) View.GONE else View.VISIBLE
        addCallControl.visibility = visible
        bluetoothControl.visibility = visible
        holdControl.visibility = visible
        speakerControl.visibility = View.VISIBLE
        muteControl.visibility = View.VISIBLE
        keypadControl.visibility = View.VISIBLE
    }

    private fun updateHoldButton() {
        val holding = CallManager.getCallState() == Call.STATE_HOLDING
        holdButton.isSelected = holding
        holdLabel.text = if (holding) "Resume" else "Hold"
        holdButton.contentDescription = if (holding) "Resume" else "Hold"
    }

    private fun formatDuration(): String {
        val start = activeSinceMs ?: return "In Call"
        val secs = ((SystemClock.elapsedRealtime() - start) / 1000L).toInt()
        return String.format("%d:%02d", secs / 60, secs % 60)
    }

    private fun setAudioRouteWithFallback(route: Int, forceSpeakerOn: Boolean) {
        InCallUiSupport.setAudioRouteWithFallback(this, route, forceSpeakerOn)
    }
}
