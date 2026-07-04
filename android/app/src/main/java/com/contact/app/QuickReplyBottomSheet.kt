package com.contact.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.material.bottomsheet.BottomSheetDialogFragment

class QuickReplyBottomSheet : BottomSheetDialogFragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val view = inflater.inflate(R.layout.quick_reply_bottom_sheet, container, false)
        val number = requireArguments().getString(ARG_NUMBER).orEmpty()
        val replyList = view.findViewById<LinearLayout>(R.id.replyList)
        val input = view.findViewById<EditText>(R.id.customReplyInput)

        quickReplies().forEach { reply ->
            replyList.addView(replyItem(reply) {
                IncomingCallQuickReplyReceiver.sendQuickReply(requireContext(), number, reply)
                dismissAllowingStateLoss()
            })
        }

        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                val message = input.text?.toString().orEmpty().trim()
                if (message.isBlank()) return@setOnEditorActionListener true
                IncomingCallQuickReplyReceiver.sendQuickReply(requireContext(), number, message)
                dismissAllowingStateLoss()
                return@setOnEditorActionListener true
            }
            false
        }
        return view
    }

    private fun replyItem(text: String, onClick: () -> Unit): TextView {
        return TextView(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = 0 }
            setPadding(6, 18, 6, 18)
            this.text = text
            setTextColor(0xFFF3F6FF.toInt())
            textSize = 18f
            setOnClickListener { onClick() }
            background = null
        }
    }

    private fun quickReplies() = listOf(
        "Please text me.",
        "Can you call back later?",
        "I'll call you back.",
    )

    companion object {
        private const val TAG = "QuickReplyBottomSheet"
        private const val ARG_NUMBER = "arg_number"

        fun show(manager: androidx.fragment.app.FragmentManager, number: String) {
            if (manager.findFragmentByTag(TAG) != null) return
            QuickReplyBottomSheet().apply {
                arguments = Bundle().apply { putString(ARG_NUMBER, number) }
            }.show(manager, TAG)
        }

        fun dismiss(manager: androidx.fragment.app.FragmentManager) {
            (manager.findFragmentByTag(TAG) as? QuickReplyBottomSheet)?.dismissAllowingStateLoss()
        }
    }
}
