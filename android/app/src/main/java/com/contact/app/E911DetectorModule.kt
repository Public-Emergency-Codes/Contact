package com.contact.app

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.CallLog
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Native bridge for dialer permissions, call-log access, and app foregrounding. */
class E911DetectorModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "E911DetectorModule"

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            val manager = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            promise.resolve(manager.isIgnoringBatteryOptimizations(reactContext.packageName))
        } catch (e: Exception) {
            promise.reject("BATTERY_OPTIMIZATION_CHECK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            reactContext.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BATTERY_OPTIMIZATION_REQUEST_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun checkOverlayPermission(promise: Promise) {
        promise.resolve(Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(reactContext))
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            reactContext.startActivity(Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactContext.packageName}"),
            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OVERLAY_PERM_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun bringToFront(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
            promise.reject("NO_OVERLAY_PERM", "SYSTEM_ALERT_WINDOW not granted — enable Draw over apps")
            return
        }
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            try {
                reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)
                    ?.apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                    }
                    ?.let(reactContext::startActivity)
            } catch (e: Exception) {
                Log.e("DialerSupport", "Unable to bring app to front", e)
            }
        }, 800L)
        promise.resolve(true)
    }

    @ReactMethod
    fun isDndPermissionGranted(promise: Promise) {
        val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        promise.resolve(manager.isNotificationPolicyAccessGranted)
    }

    @ReactMethod
    fun requestDndPermission(promise: Promise) {
        try {
            reactContext.startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DND_PERM_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun enableDnd(promise: Promise) {
        val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!manager.isNotificationPolicyAccessGranted) {
            promise.reject("DND_PERM_DENIED", "Do Not Disturb access not granted")
            return
        }
        manager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE)
        promise.resolve(true)
    }

    @ReactMethod
    fun disableDnd(promise: Promise) {
        val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!manager.isNotificationPolicyAccessGranted) {
            promise.resolve(false)
            return
        }
        manager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL)
        promise.resolve(true)
    }

    @ReactMethod
    fun getRecentCalls(limit: Int, promise: Promise) {
        try {
            val result = Arguments.createArray()
            val safeLimit = if (limit <= 0) 20 else minOf(limit, 100)
            var count = 0
            reactContext.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.CACHED_NAME, CallLog.Calls.DATE, CallLog.Calls.TYPE),
                null,
                null,
                "${CallLog.Calls.DATE} DESC",
            )?.use { cursor ->
                while (cursor.moveToNext() && count < safeLimit) {
                    val number = cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER)) ?: ""
                    if (number.isBlank()) continue
                    result.pushMap(Arguments.createMap().apply {
                        putString("number", number)
                        putString("name", cursor.getString(cursor.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)) ?: "")
                        putDouble("date", cursor.getLong(cursor.getColumnIndexOrThrow(CallLog.Calls.DATE)).toDouble())
                        putInt("type", cursor.getInt(cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE)))
                    })
                    count++
                }
            }
            promise.resolve(result)
        } catch (e: SecurityException) {
            promise.reject("CALL_LOG_PERMISSION_DENIED", "Missing READ_CALL_LOG permission", e)
        } catch (e: Exception) {
            promise.reject("CALL_LOG_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getRecentCallsSafe(promise: Promise) = getRecentCalls(30, promise)

    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) = Unit

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) = Unit
}
