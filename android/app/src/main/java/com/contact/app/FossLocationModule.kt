package com.contact.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/** LocationManager/Geocoder bridge with no Google Play Services dependency. */
class FossLocationModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LocationListener {
  private val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
  private val executor = Executors.newSingleThreadExecutor()
  private val watchCount = AtomicInteger(0)
  private var watchMinTime = 5000L
  private var watchMinDistance = 10f

  override fun getName() = "FossLocation"

  private fun hasPermission(): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  private fun provider(): String? = when {
    manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
    manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
    else -> null
  }

  private fun locationMap(location: Location) = Arguments.createMap().apply {
    putMap("coords", Arguments.createMap().apply {
      putDouble("latitude", location.latitude)
      putDouble("longitude", location.longitude)
      putDouble("accuracy", location.accuracy.toDouble())
      if (location.hasAltitude()) putDouble("altitude", location.altitude) else putNull("altitude")
      if (location.hasVerticalAccuracy()) putDouble("altitudeAccuracy", location.verticalAccuracyMeters.toDouble()) else putNull("altitudeAccuracy")
      if (location.hasBearing()) putDouble("heading", location.bearing.toDouble()) else putNull("heading")
      if (location.hasSpeed()) putDouble("speed", location.speed.toDouble()) else putNull("speed")
    })
    putDouble("timestamp", location.time.toDouble())
    putBoolean("mocked", location.isFromMockProvider)
  }

  @ReactMethod
  fun getLastKnownPosition(options: ReadableMap?, promise: Promise) {
    if (!hasPermission()) return promise.resolve(null)
    try {
      val best = manager.getProviders(true).mapNotNull { manager.getLastKnownLocation(it) }
        .maxWithOrNull(compareBy<Location> { it.time }.thenBy { -it.accuracy })
      promise.resolve(best?.let(::locationMap))
    } catch (error: Exception) { promise.reject("LOCATION_LAST_FAILED", error) }
  }

  @ReactMethod
  fun getCurrentPosition(options: ReadableMap?, promise: Promise) {
    if (!hasPermission()) return promise.reject("LOCATION_PERMISSION", "Location permission not granted")
    val selected = provider() ?: return promise.reject("LOCATION_DISABLED", "Location services are disabled")
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        manager.getCurrentLocation(selected, null, ContextCompat.getMainExecutor(context)) { location ->
          if (location == null) promise.reject("LOCATION_UNAVAILABLE", "No location was returned")
          else promise.resolve(locationMap(location))
        }
      } else {
        @Suppress("DEPRECATION")
        manager.requestSingleUpdate(selected, object : LocationListener {
          override fun onLocationChanged(location: Location) = promise.resolve(locationMap(location))
          override fun onProviderEnabled(provider: String) = Unit
          override fun onProviderDisabled(provider: String) = Unit
          @Deprecated("Deprecated in Android") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
        }, null)
      }
    } catch (error: Exception) { promise.reject("LOCATION_CURRENT_FAILED", error) }
  }

  @ReactMethod
  fun startWatching(options: ReadableMap?, promise: Promise) {
    if (!hasPermission()) return promise.reject("LOCATION_PERMISSION", "Location permission not granted")
    watchMinTime = options?.takeIf { it.hasKey("timeInterval") }?.getDouble("timeInterval")?.toLong() ?: 5000L
    watchMinDistance = options?.takeIf { it.hasKey("distanceInterval") }?.getDouble("distanceInterval")?.toFloat() ?: 10f
    try {
      if (watchCount.getAndIncrement() == 0) {
        manager.getProviders(true).filter { it == LocationManager.GPS_PROVIDER || it == LocationManager.NETWORK_PROVIDER }
          .forEach { manager.requestLocationUpdates(it, watchMinTime, watchMinDistance, this) }
      }
      promise.resolve(null)
    } catch (error: Exception) { watchCount.set(0); promise.reject("LOCATION_WATCH_FAILED", error) }
  }

  @ReactMethod
  fun stopWatching() {
    if (watchCount.decrementAndGet() <= 0) {
      watchCount.set(0)
      manager.removeUpdates(this)
    }
  }

  override fun onLocationChanged(location: Location) {
    if (context.hasActiveReactInstance()) {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("fossLocationChanged", locationMap(location))
    }
  }
  override fun onProviderEnabled(provider: String) = Unit
  override fun onProviderDisabled(provider: String) = Unit
  @Deprecated("Deprecated in Android") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

  @ReactMethod
  fun reverseGeocode(latitude: Double, longitude: Double, promise: Promise) {
    executor.execute {
      try {
        @Suppress("DEPRECATION") val addresses = Geocoder(context, Locale.getDefault()).getFromLocation(latitude, longitude, 5).orEmpty()
        val result = Arguments.createArray()
        addresses.forEach { address -> result.pushMap(Arguments.createMap().apply {
          putString("name", address.featureName)
          putString("street", address.thoroughfare)
          putString("streetNumber", address.subThoroughfare)
          putString("district", address.subLocality)
          putString("city", address.locality)
          putString("subregion", address.subAdminArea)
          putString("region", address.adminArea)
          putString("postalCode", address.postalCode)
          putString("country", address.countryName)
          putString("isoCountryCode", address.countryCode)
        }) }
        promise.resolve(result)
      } catch (error: Exception) { promise.reject("REVERSE_GEOCODE_FAILED", error) }
    }
  }

  @ReactMethod
  fun geocode(address: String, promise: Promise) {
    executor.execute {
      try {
        @Suppress("DEPRECATION") val addresses = Geocoder(context, Locale.getDefault()).getFromLocationName(address, 5).orEmpty()
        val result = Arguments.createArray()
        addresses.forEach { item -> result.pushMap(Arguments.createMap().apply {
          putDouble("latitude", item.latitude); putDouble("longitude", item.longitude)
          putNull("altitude")
          putNull("accuracy")
        }) }
        promise.resolve(result)
      } catch (error: Exception) { promise.reject("GEOCODE_FAILED", error) }
    }
  }

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit
}
