import adaptiveLocationPolicyService from './adaptiveLocationPolicyService';
import {
  calculateConfidence,
  calculateDistance,
  summarizeWiFiNetworks,
} from './locationMath';
import { selectBestLocation, selectPhaseILocation } from './locationSelectionEngine';
import { applyKalmanFilter, getGPSLocation } from './gpsLocationProvider';
import {
  getAveragedLocation,
  collectQuickGpsSamples,
  recordPinCorrection,
} from './locationSampling';
import {
  startBackgroundTracking,
  startLocationMonitoring,
  stopBackgroundTracking,
} from './locationTracking';
import {
  getCellOnlyLocation as getCellTowerOnlyLocation,
  getRawCellTelemetry,
} from './cellTowerService';
import { getWiFiNetworks, getWiFiOnlyLocation } from './wifiLocationProvider';
import {
  type EnhancedLocation,
  type EnabledMethods,
  type KalmanState,
  type SelectionPolicy,
  type WiFiNetwork,
} from './locationModels';

class EmergencyLocationService {
  lastKnownLocation: EnhancedLocation | null = null;
  private locationCache: Map<string, EnhancedLocation> = new Map();
  private kalmanState: KalmanState | null = null;
  backgroundWatchId: { remove: () => void } | null = null;
  private isPreWarmed = false;
  sampleCount = 3;
  private enabledMethods: EnabledMethods = {
    gps: true,
    wifi: true,
    cell: true,
    hybrid: true,
  };

  private selectionPolicy: SelectionPolicy = {
    gpsGoodAccuracyM: 15,
    wifiMinUniqueBssids: 5,
    wifiMinValidBssids: 5,
    maxDivergenceMultiplier: 3,
    minDivergenceFloorM: 200,
  };

  private adaptivePolicyLoaded = false;
  private adaptivePolicyPromise: Promise<void> | null = null;

  async ensureAdaptivePolicyLoaded() {
    if (this.adaptivePolicyLoaded) return;
    if (!this.adaptivePolicyPromise) {
      this.adaptivePolicyPromise = (async () => {
        const policy = await adaptiveLocationPolicyService.loadPolicy();
        if (policy) {
          this.setSelectionPolicy(policy);
        }
        this.adaptivePolicyLoaded = true;
      })().catch((e) => {
        console.warn('Failed to load adaptive location policy:', e?.message || e);
        this.adaptivePolicyLoaded = true;
      });
    }
    await this.adaptivePolicyPromise;
  }

  setSelectionPolicy(policy: Partial<SelectionPolicy>) {
    this.selectionPolicy = { ...this.selectionPolicy, ...policy };
  }

  applyKalmanFilter(lat: number, lng: number, accuracy: number): { lat: number; lng: number } {
    const filtered = applyKalmanFilter(this.kalmanState, lat, lng, accuracy);
    this.kalmanState = filtered.nextState;
    return { lat: filtered.lat, lng: filtered.lng };
  }

  setSampleCount(count: number) {
    this.sampleCount = Math.max(1, Math.min(count, 20));
  }

  setEnabledMethods(methods: { gps?: boolean; wifi?: boolean; cell?: boolean; hybrid?: boolean }) {
    this.enabledMethods = { ...this.enabledMethods, ...methods };
  }

  clearCache() {
    this.lastKnownLocation = null;
    this.locationCache.clear();
    this.kalmanState = null;
    console.log('🧹 Cleared all location cache and Kalman filter state');
  }

  async getBestLocation(): Promise<EnhancedLocation> {
    return selectBestLocation(this as any);
  }

  /**
   * Phase I location (cell/network provider only — carrier-equivalent).
   * Returns immediately with cell-sector location; no GPS wait.
   */
  async getPhaseILocation(): Promise<EnhancedLocation> {
    return selectPhaseILocation(this as any);
  }

  async getQuickGPSSamples(count: number): Promise<EnhancedLocation[]> {
    return collectQuickGpsSamples(this as any, count);
  }

  async recordPinCorrection(method: string, reportedAccuracy: number, actualErrorM: number): Promise<void> {
    return recordPinCorrection(method, reportedAccuracy, actualErrorM);
  }



  summarizeWiFiNetworks(networks: WiFiNetwork[]) {
    return summarizeWiFiNetworks(networks);
  }

  async getHybridLocation(): Promise<EnhancedLocation | null> {
    try {
      if (!this.enabledMethods.wifi && !this.enabledMethods.gps) {
        return null;
      }

      const promises: Promise<any>[] = [];
      promises.push(this.enabledMethods.wifi ? this.getWiFiNetworks() : Promise.resolve([]));
      promises.push(this.enabledMethods.gps ? this.getGPSLocation() : Promise.resolve(null));

      const [wifiData, gpsData] = await Promise.allSettled(promises);
      const hasWifi = wifiData.status === 'fulfilled' && wifiData.value.length > 0;
      const hasGPS = gpsData.status === 'fulfilled' && gpsData.value !== null;

      if (hasWifi && hasGPS) {
        const wifi = wifiData.value as WiFiNetwork[];
        const gps = gpsData.value as EnhancedLocation;
        return {
          ...gps,
          method: 'HYBRID',
          confidence: this.calculateConfidence(gps.accuracy, wifi.length),
          wifiNetworks: wifi,
          accuracy: Math.min(gps.accuracy, 20),
        };
      }

      if (hasGPS) {
        return gpsData.value as EnhancedLocation;
      }

      return null;
    } catch (error) {
      console.error('Hybrid location failed:', error);
      return null;
    }
  }

  private async getGPSLocation(): Promise<EnhancedLocation | null> {
    return getGPSLocation({
      kalmanState: this.kalmanState,
      setKalmanState: (state) => {
        this.kalmanState = state;
      },
    });
  }

  private async getWiFiNetworks(samples: number = 1): Promise<WiFiNetwork[]> {
    return getWiFiNetworks(samples);
  }

  async getWiFiOnlyLocation(prefetchedWifiNetworks?: WiFiNetwork[]): Promise<EnhancedLocation | null> {
    return getWiFiOnlyLocation(prefetchedWifiNetworks);
  }

  async getCellOnlyLocation(): Promise<EnhancedLocation | null> {
    return getCellTowerOnlyLocation();
  }

  async getRawCellTelemetry() {
    return getRawCellTelemetry();
  }

  private calculateConfidence(accuracy: number, wifiCount: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    return calculateConfidence(accuracy, wifiCount);
  }

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    return calculateDistance(lat1, lon1, lat2, lon2);
  }

  async getAveragedLocation(samples?: number): Promise<EnhancedLocation> {
    return getAveragedLocation(this as any, samples);
  }

  async startLocationMonitoring(callback: (location: EnhancedLocation) => void): Promise<() => void> {
    return startLocationMonitoring(this as any, callback);
  }

  async startBackgroundTracking(): Promise<void> {
    return startBackgroundTracking(this as any);
  }

  async stopBackgroundTracking(): Promise<void> {
    return stopBackgroundTracking(this as any);
  }

  isGPSPreWarmed(): boolean {
    return this.isPreWarmed;
  }
}

export default new EmergencyLocationService();
export type { EnhancedLocation } from './locationModels';
