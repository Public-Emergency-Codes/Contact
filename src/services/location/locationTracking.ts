import { type EnhancedLocation } from './locationModels';
import nativeFusedLocationService from './nativeFusedLocationService';

export async function startLocationMonitoring(
  service: any,
  callback: (location: EnhancedLocation) => void,
): Promise<() => void> {
  const started = await nativeFusedLocationService.startTracking(
    async (position) => {
      try {
        const wifiNetworks = await service.getWiFiNetworks();
        const accuracy = position.accuracy || 100;

        const enhancedLoc: EnhancedLocation = {
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy,
          altitude: undefined,
          altitudeAccuracy: undefined,
          heading: undefined,
          speed: undefined,
          timestamp: position.timestamp,
          method: wifiNetworks.length > 0 ? 'HYBRID' : 'GPS',
          confidence: service.calculateConfidence(accuracy, wifiNetworks.length),
          wifiNetworks: wifiNetworks.length > 0 ? wifiNetworks : undefined,
        };

        service.lastKnownLocation = enhancedLoc;
        callback(enhancedLoc);
      } catch (error) {
        console.error('Location monitoring error:', error);
      }
    },
    1000,
  );

  if (!started) {
    throw new Error('Native fused tracking unavailable or permission not granted');
  }

  return () => {
    nativeFusedLocationService.stopTracking().catch(() => {});
  };
}

export async function startBackgroundTracking(service: any): Promise<void> {
  if (service.backgroundWatchId || service.isPreWarmed) {
    console.log('Background tracking already active');
    return;
  }

  try {
    console.log('🔥 Starting native fused GPS pre-warming...');
    const started = await nativeFusedLocationService.startTracking(async (position) => {
      const accuracy = position.accuracy || 100;
        const filtered = service.applyKalmanFilter(
          position.latitude,
          position.longitude,
          accuracy,
        );

        const enhancedLoc: EnhancedLocation = {
          latitude: filtered.lat,
          longitude: filtered.lng,
          accuracy,
          altitude: undefined,
          heading: undefined,
          speed: undefined,
          timestamp: position.timestamp,
          method: 'GPS',
          confidence: service.calculateConfidence(accuracy, 0),
        };

        service.lastKnownLocation = enhancedLoc;
        console.log(`📍 Background location updated: ±${accuracy.toFixed(1)}m`);
      }, 1000);

    if (!started) {
      console.log('Native fused pre-warming unavailable');
      return;
    }

    service.backgroundWatchId = {
      remove: () => {
        nativeFusedLocationService.stopTracking().catch(() => {});
      },
    };

    service.isPreWarmed = true;
    console.log('✅ GPS pre-warmed and ready');
  } catch (error) {
    console.error('Failed to start background tracking:', error);
  }
}

export async function stopBackgroundTracking(service: any): Promise<void> {
  if (service.backgroundWatchId) {
    service.backgroundWatchId.remove();
    service.backgroundWatchId = null;
    service.isPreWarmed = false;
    console.log('Background tracking stopped');
  }
}
