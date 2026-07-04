package com.contact.app

import android.content.Context
import android.os.Bundle
import android.util.AttributeSet
import com.facebook.react.ReactInstanceManager
import com.facebook.react.ReactRootView
import com.facebook.react.bridge.UiThreadUtil

/**
 * A [ReactRootView] that overrides [startReactApplication] to avoid the
 * [com.facebook.react.internal.featureflags.ReactNativeFeatureFlags] JNI path.
 *
 * ReactNativeFeatureFlags.enableEagerRootViewAttachment() triggers
 * SoLoader.loadLibrary("react_featureflagsjni") which is NOT bundled in the APK
 * (libreact_featureflagsjni.so is missing from react-android's native libs).
 *
 * This subclass uses reflection to set the parent's private fields and
 * skips the feature flags check. The root view attachment happens later
 * via [onMeasure] which already handles it when
 * [hasActiveReactInstance] && !isViewAttachedToReactInstance().
 */
class SafeReactRootView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
  defStyle: Int = 0
) : ReactRootView(context, attrs, defStyle) {

  /**
   * Same contract as [ReactRootView.startReactApplication] but without calling
   * [ReactNativeFeatureFlags].
   *
   * Sets up the root view fields via reflection, creates the React context in
   * background, and lets [onMeasure] handle the rest.
   */
  override fun startReactApplication(
    reactInstanceManager: ReactInstanceManager,
    moduleName: String,
    initialProperties: Bundle?
  ) {
    UiThreadUtil.assertOnUiThread()

    // Set private fields via reflection to avoid calling ReactNativeFeatureFlags
    setPrivateField("mReactInstanceManager", reactInstanceManager)
    setPrivateField("mJSModuleName", moduleName)
    setPrivateField("mAppProperties", initialProperties)

    reactInstanceManager.createReactContextInBackground()
    // Skip ReactNativeFeatureFlags.enableEagerRootViewAttachment() check.
    // onMeasure() will call attachToReactInstanceManager() when
    // hasActiveReactInstance() && !isViewAttachedToReactInstance().
  }

  private fun setPrivateField(fieldName: String, value: Any?) {
    try {
      val field = ReactRootView::class.java.getDeclaredField(fieldName)
      field.isAccessible = true
      field.set(this, value)
    } catch (e: Exception) {
      throw RuntimeException("Failed to set ReactRootView.$fieldName via reflection", e)
    }
  }
}
