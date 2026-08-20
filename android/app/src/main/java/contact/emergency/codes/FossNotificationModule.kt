package contact.emergency.codes

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.atomic.AtomicInteger

/** Local-only notification bridge. It contains no Firebase or push transport. */
class FossNotificationModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  companion object {
    const val ACTION_OPEN = "contact.emergency.codes.ACTION_OPEN_LOCAL_NOTIFICATION"
    const val EXTRA_ACTION = "local_notification_action"
    private val nextId = AtomicInteger(40000)
    @Volatile private var lastAction: String? = null
    @Volatile private var active: FossNotificationModule? = null

    fun handleIntent(intent: Intent?) {
      if (intent?.action != ACTION_OPEN) return
      val action = intent.getStringExtra(EXTRA_ACTION)
      lastAction = action
      active?.emitResponse(action)
    }
  }

  override fun getName() = "FossNotifications"
  override fun initialize() { super.initialize(); active = this }
  override fun invalidate() { if (active === this) active = null; super.invalidate() }

  private fun emitResponse(action: String?) {
    if (!context.hasActiveReactInstance()) return
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("fossNotificationResponse", Arguments.createMap().apply { putString("action", action) })
  }

  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    val granted = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    promise.resolve(if (granted) "granted" else "denied")
  }

  @ReactMethod
  fun setChannel(id: String, options: ReadableMap, promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val name = options.getString("name") ?: id
      val importance = options.takeIf { it.hasKey("importance") }?.getInt("importance") ?: NotificationManager.IMPORTANCE_HIGH
      val channel = NotificationChannel(id, name, importance)
      channel.enableVibration(false)
      channel.setSound(null, null)
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun deleteChannel(id: String, promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.getSystemService(NotificationManager::class.java).deleteNotificationChannel(id)
    promise.resolve(null)
  }

  @ReactMethod
  fun show(content: ReadableMap, promise: Promise) {
    val id = nextId.incrementAndGet()
    val channel = content.getString("channelId") ?: "contact-local"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager.getNotificationChannel(channel) == null) manager.createNotificationChannel(NotificationChannel(channel, "Contact", NotificationManager.IMPORTANCE_HIGH))
    }
    val action = content.getString("action")
    val intent = Intent(context, MainActivity::class.java).apply {
      this.action = ACTION_OPEN
      putExtra(EXTRA_ACTION, action)
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(context, channel)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(content.getString("title") ?: "Contact")
      .setContentText(content.getString("body") ?: "")
      .setContentIntent(pending)
      .setOngoing(content.hasKey("sticky") && content.getBoolean("sticky"))
      .setAutoCancel(!content.hasKey("autoDismiss") || content.getBoolean("autoDismiss"))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setSilent(true)
      .build()
    NotificationManagerCompat.from(context).notify(id, notification)
    promise.resolve(id.toString())
  }

  @ReactMethod fun dismiss(id: String, promise: Promise) { NotificationManagerCompat.from(context).cancel(id.toIntOrNull() ?: -1); promise.resolve(null) }
  @ReactMethod fun dismissAll(promise: Promise) { NotificationManagerCompat.from(context).cancelAll(); promise.resolve(null) }
  @ReactMethod fun getLastResponse(promise: Promise) { promise.resolve(Arguments.createMap().apply { putString("action", lastAction) }) }
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit
}
