package com.contact.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object IncomingMmsCache {
    private const val PREFS_NAME = "incoming_mms_cache"
    private const val KEY_MESSAGES = "messages"
    private const val MAX_MESSAGES = 200

    fun add(
        context: Context,
        id: String,
        sender: String,
        body: String,
        dateMs: Long,
        mediaPaths: List<String>,
        mediaMimes: List<String> = emptyList()
    ) {
        if (mediaPaths.isEmpty() && body.isBlank()) return

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = JSONArray(prefs.getString(KEY_MESSAGES, "[]") ?: "[]")
        val next = JSONArray()
        val record = JSONObject().apply {
            put("id", id)
            put("sender", sender)
            put("body", body)
            put("date", dateMs)
            put("mediaPaths", JSONArray().apply {
                mediaPaths.forEach { put(it) }
            })
            put("mediaMimes", JSONArray().apply {
                mediaMimes.forEach { put(it) }
            })
            put("imagePaths", JSONArray().apply {
                mediaPaths.forEach { put(it) }
            })
        }
        next.put(record)

        var kept = 0
        for (i in 0 until existing.length()) {
            val item = existing.optJSONObject(i) ?: continue
            if (item.optString("id") == id) continue
            next.put(item)
            kept++
            if (kept >= MAX_MESSAGES - 1) break
        }

        prefs.edit().putString(KEY_MESSAGES, next.toString()).apply()
    }

    fun matching(context: Context, address: String, limit: Int): List<JSONObject> {
        val target = normalize(address)
        if (target.isBlank()) return emptyList()

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = JSONArray(prefs.getString(KEY_MESSAGES, "[]") ?: "[]")
        val out = mutableListOf<JSONObject>()
        for (i in 0 until existing.length()) {
            val item = existing.optJSONObject(i) ?: continue
            if (normalize(item.optString("sender")) == target) {
                out.add(item)
                if (out.size >= limit) break
            }
        }
        return out
    }

    private fun normalize(value: String): String =
        value.replace(Regex("[^0-9]"), "").takeLast(10)
}
