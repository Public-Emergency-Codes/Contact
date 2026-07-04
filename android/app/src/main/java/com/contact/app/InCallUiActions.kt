package com.contact.app

import android.app.AlertDialog
import android.os.Handler
import android.telecom.Call
import androidx.appcompat.app.AppCompatActivity

object InCallUiActions {

    fun showMoreDialog(
        activity: AppCompatActivity,
        holding: Boolean,
        onToggleHold: () -> Unit,
        onRouteEarpiece: () -> Unit
    ) {
        AlertDialog.Builder(activity)
            .setTitle("More")
            .setItems(arrayOf(if (holding) "Resume" else "Hold", "Earpiece")) { _, which ->
                when (which) {
                    0 -> onToggleHold()
                    1 -> onRouteEarpiece()
                }
            }
            .show()
    }

    fun bindDtmfKeypad(
        activity: AppCompatActivity,
        handler: Handler,
        activeCallProvider: () -> Call?
    ) {
        val map = arrayOf(
            Pair(R.id.dtmf1, '1'), Pair(R.id.dtmf2, '2'), Pair(R.id.dtmf3, '3'),
            Pair(R.id.dtmf4, '4'), Pair(R.id.dtmf5, '5'), Pair(R.id.dtmf6, '6'),
            Pair(R.id.dtmf7, '7'), Pair(R.id.dtmf8, '8'), Pair(R.id.dtmf9, '9'),
            Pair(R.id.dtmfStar, '*'), Pair(R.id.dtmf0, '0'), Pair(R.id.dtmfHash, '#')
        )

        map.forEach { (id, tone) ->
            activity.findViewById<android.widget.Button>(id)?.setOnClickListener {
                playDtmfTone(tone, handler, activeCallProvider())
            }
        }
    }

    private fun playDtmfTone(tone: Char, handler: Handler, call: Call?) {
        if (call == null) return
        call.playDtmfTone(tone)
        handler.postDelayed({ call.stopDtmfTone() }, 130L)
    }
}
