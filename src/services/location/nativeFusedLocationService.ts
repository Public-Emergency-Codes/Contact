import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { FusedLocationModule } = NativeModules;

export interface NativeFusedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  intervalMs: number;
  priority: 'HIGH_ACCURACY';
}

type OnUpdate = (location: NativeFusedLocation) => void;

class NativeFusedLocationService {
  private emitter: NativeEventEmitter | null = null;
  private subscription: { remove: () => void } | null = null;

  isAvailable(): boolean {
    return Platform.OS === 'android' && !!FusedLocationModule;
  }

  async getCurrentPosition(intervalMs: number = 1000): Promise<NativeFusedLocation | null> {
    if (!this.isAvailable()) return null;

    try {
      const result = await FusedLocationModule.getCurrentPosition(intervalMs);
      if (!result) return null;
      return {
        latitude: result.latitude,
        longitude: result.longitude,
        accuracy: result.accuracy,
        timestamp: result.timestamp,
        intervalMs: result.intervalMs || intervalMs,
        priority: 'HIGH_ACCURACY',
      };
    } catch (error) {
      console.warn('Native fused getCurrentPosition failed:', error);
      return null;
    }
  }

  async startTracking(onUpdate: OnUpdate, intervalMs: number = 1000): Promise<boolean> {
    if (!this.isAvailable()) return false;

    this.stopSubscription();
    this.emitter = new NativeEventEmitter(FusedLocationModule);
    this.subscription = this.emitter.addListener('fusedLocationUpdate', (payload: NativeFusedLocation) => {
      onUpdate({
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy,
        timestamp: payload.timestamp,
        intervalMs: payload.intervalMs || intervalMs,
        priority: 'HIGH_ACCURACY',
      });
    });

    try {
      const started = await FusedLocationModule.startTracking(intervalMs);
      if (!started) {
        this.stopSubscription();
      }
      return !!started;
    } catch (error) {
      this.stopSubscription();
      console.warn('Native fused startTracking failed:', error);
      return false;
    }
  }

  async stopTracking(): Promise<void> {
    this.stopSubscription();
    if (!this.isAvailable()) return;
    try {
      await FusedLocationModule.stopTracking();
    } catch (error) {
      console.warn('Native fused stopTracking failed:', error);
    }
  }

  private stopSubscription() {
    this.subscription?.remove();
    this.subscription = null;
    this.emitter = null;
  }
}

export default new NativeFusedLocationService();
