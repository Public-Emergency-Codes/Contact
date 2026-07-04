package com.contact.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.ReactInstanceManager
import com.facebook.react.ReactNativeHost
import java.io.File
import java.io.FileOutputStream
import com.facebook.react.ReactRootView
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DefaultHardwareBackBtnHandler
import expo.modules.ReactActivityDelegateWrapper

/**
 * A [ReactActivityDelegate] that bypasses the bridgeless architecture check.
 *
 * [ReactActivityDelegate.onCreate] and [ReactDelegate.loadApp] both check
 * [com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlags]
 * which is a compile-time constant driven by newArchEnabled=true (required by
 * reanimated, worklets-core, vision-camera). Since getReactHost() returns null
 * in DefaultReactNativeHost, the bridgeless path crashes. This delegate avoids
 * ReactDelegate entirely and manages the ReactRootView directly.
 */
class LegacyReactActivityDelegate(
  activity: ReactActivity,
  mainComponentName: String?
) : ReactActivityDelegate(activity, mainComponentName) {

  private var rootView: ReactRootView? = null
  private var host: ReactNativeHost? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    val appKey = getMainComponentName() ?: return
    val reactNativeHost = getReactNativeHost()
    host = reactNativeHost

    val rv = SafeReactRootView(plainActivity)
    rv.setIsFabric(true)
    rootView = rv

    if (reactNativeHost != null) {
      // NOTE: Do NOT guard with hasInstance() - it returns false on first
      // launch since ReactInstanceManager is created lazily. Always call
      // reactInstanceManager to trigger lazy creation.
      val manager = reactNativeHost.reactInstanceManager
      // createReactContextInBackground is called inside startReactApplication
      rv.startReactApplication(manager, appKey, null)
    }

    plainActivity.setContentView(rv)
  }

  override fun onResume() {
    host?.reactInstanceManager?.onHostResume(plainActivity, plainActivity as DefaultHardwareBackBtnHandler)
  }

  override fun onPause() {
    host?.reactInstanceManager?.onHostPause(plainActivity)
  }

  override fun onUserLeaveHint() {
    // Skip - mReactDelegate is intentionally null
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    // Skip - mReactDelegate is intentionally null
  }

  override fun onDestroy() {
    rootView?.unmountReactApplication()
    host?.reactInstanceManager?.onHostDestroy(plainActivity)
    rootView = null
  }

  override fun onBackPressed(): Boolean {
    host?.reactInstanceManager?.onBackPressed()
    return true
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    // NOT calling super.onNewIntent() — parent requires non-null mReactDelegate
    host?.reactInstanceManager?.onNewIntent(intent)
    return true
  }
  // Parent ReactActivityDelegate.onKeyDown/onKeyUp call Objects.requireNonNull(getReactInstanceManager())
  // which NPEs because we don't use the parent's mReactDelegate. Skip them entirely.
  override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent): Boolean = false
  override fun onKeyUp(keyCode: Int, event: android.view.KeyEvent): Boolean = false
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    host?.reactInstanceManager?.onActivityResult(plainActivity, requestCode, resultCode, data)
  }
}

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme)
    handleIntent(intent)
    super.onCreate(null)
  }

  override fun onNewIntent(intent: Intent) {
    handleIntent(intent)
    rewriteToDeepLink(intent)
    super.onNewIntent(intent)
  }

  /**
   * Handle incoming intents: missed call notifications and sms deep links.
   */
  private fun handleIntent(intent: Intent) {
    if (InCallNotificationHelper.ACTION_OPEN_MISSED_CALL == intent.action) {
      CallManager.pendingMissedCallTab = "recent"
    }
    rewriteToDeepLink(intent)
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {},
    )
  }

  /**
   * If the intent carries an sms:/smsto: URI, rewrite it into an contact://
   * deep link so React Native's built-in Linking module picks it up via
   * [Linking.getInitialURL] (cold start) and [Linking.addEventListener]
   * (warm launch).
   *
   * Also handles ACTION_SEND / ACTION_SEND_MULTIPLE share intents from other
   * apps so that contact appears in the OS share sheet and receives shared
   * text, images, videos, and other files.
   */
  private fun rewriteToDeepLink(intent: Intent) {
    // 1) Handle share intents from other apps
    if (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) {
      val sb = StringBuilder("contact://share?")
      val mimeType = intent.type ?: "*/*"
      sb.append("mimeType=").append(Uri.encode(mimeType))

      // ── Dump intent details for debugging ────────────────────────────
      android.util.Log.i("MainActivity", "=== SHARE INTENT ===")
      android.util.Log.i("MainActivity", "  action=${intent.action} type=${intent.type}")
      android.util.Log.i("MainActivity", "  data=${intent.data} (scheme=${intent.data?.scheme})")
      val cd = intent.clipData
      android.util.Log.i("MainActivity", "  clipData=$cd itemCount=${cd?.itemCount ?: 0}")
      if (cd != null && cd.itemCount > 0) {
        for (i in 0 until cd.itemCount) {
          val item = cd.getItemAt(i)
          android.util.Log.i("MainActivity", "  clipData[$i] uri=${item?.uri} text=${item?.text}")
        }
      }
      intent.extras?.keySet()?.forEach { key ->
        val value = intent.extras?.get(key)
        android.util.Log.i("MainActivity", "  extra[$key] = ${value?.javaClass?.simpleName}: $value")
      }

      // ── Extract shared file URIs from every possible location ──────────
      val rawUris = linkedSetOf<Uri>()

      // A) ClipData (modern apps — Gallery, Files, Photos)
      val clip = intent.clipData
      if (clip != null && clip.itemCount > 0) {
        for (i in 0 until clip.itemCount) {
          val item = clip.getItemAt(i)
          if (item?.uri != null) {
            android.util.Log.i("MainActivity", "  -> Got URI from ClipData: ${item.uri}")
            rawUris.add(item.uri)
          }
        }
      }

      // B) EXTRA_STREAM
      if (intent.hasExtra(Intent.EXTRA_STREAM)) {
        @Suppress("DEPRECATION")
        when (val stream = intent.extras?.get(Intent.EXTRA_STREAM)) {
          is Uri -> {
            android.util.Log.i("MainActivity", "  -> Got URI from EXTRA_STREAM: $stream")
            rawUris.add(stream)
          }
          is Iterable<*> -> stream.filterIsInstance<Uri>().forEach {
            android.util.Log.i("MainActivity", "  -> Got URI from EXTRA_STREAM list: $it")
            rawUris.add(it)
          }
          is Array<*> -> stream.filterIsInstance<Uri>().forEach {
            android.util.Log.i("MainActivity", "  -> Got URI from EXTRA_STREAM array: $it")
            rawUris.add(it)
          }
        }
      }

      // C) intent.data
      if (intent.data != null) {
        val ds = intent.data?.scheme
        if (ds == "content" || ds == "file") {
          android.util.Log.i("MainActivity", "  -> Got URI from intent.data: ${intent.data}")
          rawUris.add(intent.data!!)
        }
      }

      // D) Scan ALL extras for any Uri-type values (last resort)
      intent.extras?.keySet()?.forEach { key ->
        @Suppress("DEPRECATION")
        val v = intent.extras?.get(key)
        when (v) {
          is Uri -> {
            android.util.Log.i("MainActivity", "  -> Got URI from extra[$key]: $v")
            rawUris.add(v)
          }
          is Iterable<*> -> {
            v.forEach { item ->
              if (item is Uri) {
                android.util.Log.i("MainActivity", "  -> Got URI from extra[$key] list: $item")
                rawUris.add(item)
              }
            }
          }
        }
      }

      android.util.Log.i("MainActivity", "  rawUris count after extraction: ${rawUris.size}")

      // Pass raw URIs directly — DirectSmsModule.toSharableUri handles
      // content:// URIs by copying them before MMS send
      val uris = rawUris.map { it.toString() }

      android.util.Log.i("MainActivity", "  uris count: ${uris.size}")

      if (uris.isNotEmpty()) {
        sb.append("&uris=").append(Uri.encode(uris.joinToString(",")))
      }

      // ── Write FULL intent dump to cache file so JS can find URIs ─────
      try {
        val dump = org.json.JSONObject()
        dump.put("action", intent.action ?: "")
        dump.put("type", intent.type ?: "")
        dump.put("data", intent.data?.toString() ?: "")
        dump.put("mimeType", mimeType)

        val normalizedUris = org.json.JSONArray()
        uris.forEach { normalizedUris.put(it) }
        dump.put("uris", normalizedUris)

        // ClipData URIs
        val cd = intent.clipData
        if (cd != null && cd.itemCount > 0) {
          val arr = org.json.JSONArray()
          for (i in 0 until cd.itemCount) {
            cd.getItemAt(i)?.uri?.toString()?.let { arr.put(it) }
          }
          if (arr.length() > 0) dump.put("clipUris", arr)
        }

        // ALL extras as strings
        val extras = org.json.JSONObject()
        intent.extras?.keySet()?.forEach { key ->
          val v = intent.extras?.get(key)
          when (v) {
            is Uri -> extras.put(key, v.toString())
            is java.util.ArrayList<*> -> {
              val arr = org.json.JSONArray()
              (v as java.util.ArrayList<Any?>).forEach { item -> if (item != null) arr.put(item.toString()) }
              if (arr.length() > 0) extras.put(key, arr)
            }
            else -> {
              if (v != null) extras.put(key, v.toString())
            }
          }
        }
        dump.put("extras", extras)

        val shareFile = File(cacheDir, "pending_share.json")
        shareFile.writeText(dump.toString())
        android.util.Log.i("MainActivity", "  pending share path: ${shareFile.absolutePath}")
        android.util.Log.i("MainActivity", "  wrote intent dump: ${dump.toString().take(300)}")
      } catch (e: Exception) {
        android.util.Log.w("MainActivity", "  failed to write dump: ${e.message}")
      }

      // ── Shared text — only include if NO files were shared ─────────────
      if (uris.isEmpty()) {
        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
        if (!sharedText.isNullOrBlank()) {
          sb.append("&text=").append(Uri.encode(sharedText))
        }
      }

      // Shared subject
      val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
      if (!subject.isNullOrBlank()) {
        sb.append("&subject=").append(Uri.encode(subject))
      }

      intent.data = Uri.parse(sb.toString())
      intent.action = Intent.ACTION_VIEW
      android.util.Log.i("MainActivity", "  final deep-link: $sb")
      return
    }

    // 2) Handle sms:/smsto: intents
    val data = intent.data ?: return
    val scheme = data.scheme ?: return
    if (scheme !in listOf("sms", "smsto", "mms", "mmsto")) return
    val address = data.schemeSpecificPart
      ?.substringBefore('?')
      ?.trim()
      ?.takeIf { it.isNotEmpty() } ?: return
    intent.data = Uri.parse("contact://sms-compose/${Uri.encode(address)}")
    intent.action = Intent.ACTION_VIEW
  }

  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              super.invokeDefaultOnBackPressed()
          }
          return
      }
      super.invokeDefaultOnBackPressed()
  }

  /**
   * Copy a shared content:// or file:// URI to a local cache file so React
   * Native's Image component and MMS sender can both use it reliably.
   * Returns the file:// URI of the local copy, or null on failure.
   */
  private fun copyToLocalCache(uri: Uri): Uri? {
    return try {
      val ext = contentResolver.getType(uri)
        ?.substringAfterLast('/')
        ?.takeIf { it.isNotEmpty() && it.length <= 10 }
        ?: "tmp"
      val outFile = File(cacheDir, "share_${System.currentTimeMillis()}.$ext")
      contentResolver.openInputStream(uri)?.use { input ->
        FileOutputStream(outFile).use { output ->
          input.copyTo(output)
        }
      }
      Uri.fromFile(outFile)
    } catch (e: Exception) {
      android.util.Log.w("MainActivity", "copyToLocalCache failed: ${e.message}")
      null
    }
  }
}
