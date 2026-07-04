import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

export interface LocationMethodStats {
  totalSamples: number;
  avgErrorM: number;
  minErrorM: number;
  maxErrorM: number;
  successRate: number; // 0-1
  lastUpdated: number;
}

export interface AdaptiveLocationPolicy {
  deviceModel: string;
  osVersion: string;

  // GPS quality thresholds
  gpsGoodAccuracyM: number;
  gpsExcellentAccuracyM: number;

  // WiFi quality thresholds
  wifiMinUniqueBssids: number;
  wifiMinValidBssids: number;
  wifiOptimalBssidCount: number;

  // Divergence/sanity check thresholds
  maxDivergenceMultiplier: number;
  minDivergenceFloorM: number;

  // Per-method reliability (learned from calibration)
  methodStats: {
    gps?: LocationMethodStats;
    wifi?: LocationMethodStats;
    hybrid?: LocationMethodStats;
  };

  // Per-condition method reliability (learned from calibration)
  conditionMethodStats: {
    [conditionKey: string]: {
      gps?: LocationMethodStats;
      wifi?: LocationMethodStats;
      hybrid?: LocationMethodStats;
    };
  };

  // Meta
  calibrationCount: number;
  lastCalibrationTimestamp: number;
  confidenceLevel: 'LOW' | 'MEDIUM' | 'HIGH'; // Based on calibration count
}

const DEFAULT_POLICY: AdaptiveLocationPolicy = {
  deviceModel: 'unknown',
  osVersion: 'unknown',
  gpsGoodAccuracyM: 15,
  gpsExcellentAccuracyM: 5,
  wifiMinUniqueBssids: 5,
  wifiMinValidBssids: 5,
  wifiOptimalBssidCount: 10,
  maxDivergenceMultiplier: 3,
  minDivergenceFloorM: 200,
  methodStats: {},
  conditionMethodStats: {},
  calibrationCount: 0,
  lastCalibrationTimestamp: 0,
  confidenceLevel: 'LOW',
};

class AdaptiveLocationPolicyService {
  private policy: AdaptiveLocationPolicy = { ...DEFAULT_POLICY };
  private storageKey = 'adaptive_location_policy';
  private initialized = false;

  private getDeviceKey(): string {
    const model = Device.modelName || Device.deviceName || 'unknown';
    const osVersion = Platform.Version?.toString() || 'unknown';
    return `${Platform.OS}_${model}_${osVersion}`;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const deviceKey = this.getDeviceKey();
      const stored = await AsyncStorage.getItem(`${this.storageKey}_${deviceKey}`);

      if (stored) {
        const parsed = JSON.parse(stored) as AdaptiveLocationPolicy;
        this.policy = { ...DEFAULT_POLICY, ...parsed };
        console.log(`📊 Loaded adaptive policy for ${deviceKey}: ${this.policy.calibrationCount} calibrations`);
      } else {
        this.policy = {
          ...DEFAULT_POLICY,
          deviceModel: Device.modelName || Device.deviceName || 'unknown',
          osVersion: Platform.Version?.toString() || 'unknown',
        };
        console.log(`📊 Initialized default policy for ${deviceKey}`);
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to load adaptive policy:', error);
      this.policy = { ...DEFAULT_POLICY };
      this.initialized = true;
    }
  }

  async save(): Promise<void> {
    try {
      const deviceKey = this.getDeviceKey();
      await AsyncStorage.setItem(`${this.storageKey}_${deviceKey}`, JSON.stringify(this.policy));
      console.log(`💾 Saved adaptive policy for ${deviceKey}`);
    } catch (error) {
      console.error('Failed to save adaptive policy:', error);
    }
  }

  async loadPolicy(): Promise<AdaptiveLocationPolicy> {
    await this.initialize();
    return this.getPolicy();
  }

  getPolicy(): AdaptiveLocationPolicy {
    return { ...this.policy };
  }

  /**
   * Update policy based on calibration results
   */
  async updateFromCalibration(calibrationResults: {
    bestMethod: string;
    bestError: number;
    variationResults: Array<{
      name: string;
      method: string;
      error: number;
      wifiCount?: number;
      bssidCount?: number;
    }>;
    avgError: number;
    samplesUsed: number;
    converged: boolean;
    environmentalConditions?: {
      weather?: string;
      season?: string;
      timeOfDay?: string;
    };
  }): Promise<void> {
    await this.initialize();

    this.policy.calibrationCount++;
    this.policy.lastCalibrationTimestamp = Date.now();

    // Update confidence level based on calibration count
    if (this.policy.calibrationCount >= 10) {
      this.policy.confidenceLevel = 'HIGH';
    } else if (this.policy.calibrationCount >= 3) {
      this.policy.confidenceLevel = 'MEDIUM';
    } else {
      this.policy.confidenceLevel = 'LOW';
    }

    // Learn per-method stats
    for (const variation of calibrationResults.variationResults) {
      const methodKey = this.normalizeMethodKey(variation.method);
      if (!methodKey) continue;

      const existing = this.policy.methodStats[methodKey];
      const newSample = {
        errorM: variation.error,
        success: Number.isFinite(variation.error) && variation.error < 1000,
      };

      if (existing && Number.isFinite(newSample.errorM)) {
        // Running average update
        const totalSamples = existing.totalSamples + 1;
        const avgErrorM = (existing.avgErrorM * existing.totalSamples + newSample.errorM) / totalSamples;
        const minErrorM = Math.min(existing.minErrorM, newSample.errorM);
        const maxErrorM = Math.max(existing.maxErrorM, newSample.errorM);
        const successRate = (existing.successRate * existing.totalSamples + (newSample.success ? 1 : 0)) / totalSamples;

        this.policy.methodStats[methodKey] = {
          totalSamples,
          avgErrorM,
          minErrorM,
          maxErrorM,
          successRate,
          lastUpdated: Date.now(),
        };
      } else if (Number.isFinite(newSample.errorM)) {
        this.policy.methodStats[methodKey] = {
          totalSamples: 1,
          avgErrorM: newSample.errorM,
          minErrorM: newSample.errorM,
          maxErrorM: newSample.errorM,
          successRate: newSample.success ? 1 : 0,
          lastUpdated: Date.now(),
        };
      }
    }

    // Track per-condition stats (weather, season, time-of-day)
    const env = calibrationResults.environmentalConditions;
    if (env) {
      const condKeys: string[] = [];
      if (env.weather) condKeys.push(`weather:${env.weather}`);
      if (env.season) condKeys.push(`season:${env.season}`);
      if (env.timeOfDay) condKeys.push(`tod:${env.timeOfDay}`);

      for (const ck of condKeys) {
        if (!this.policy.conditionMethodStats[ck]) {
          this.policy.conditionMethodStats[ck] = {};
        }
        for (const variation of calibrationResults.variationResults) {
          const mk = this.normalizeMethodKey(variation.method);
          if (!mk || !Number.isFinite(variation.error)) continue;
          const ex = this.policy.conditionMethodStats[ck][mk];
          if (ex) {
            const t = ex.totalSamples + 1;
            this.policy.conditionMethodStats[ck][mk] = {
              totalSamples: t,
              avgErrorM: (ex.avgErrorM * ex.totalSamples + variation.error) / t,
              minErrorM: Math.min(ex.minErrorM, variation.error),
              maxErrorM: Math.max(ex.maxErrorM, variation.error),
              successRate: (ex.successRate * ex.totalSamples + (variation.error < 1000 ? 1 : 0)) / t,
              lastUpdated: Date.now(),
            };
          } else {
            this.policy.conditionMethodStats[ck][mk] = {
              totalSamples: 1,
              avgErrorM: variation.error,
              minErrorM: variation.error,
              maxErrorM: variation.error,
              successRate: variation.error < 1000 ? 1 : 0,
              lastUpdated: Date.now(),
            };
          }
        }
      }
    }

    // Adapt GPS thresholds based on observed GPS performance
    const gpsStats = this.policy.methodStats.gps;
    if (gpsStats && gpsStats.totalSamples >= 3) {
      // If GPS consistently achieves < 10m, lower the "good" threshold
      if (gpsStats.avgErrorM < 8 && gpsStats.maxErrorM < 15) {
        this.policy.gpsGoodAccuracyM = Math.max(8, gpsStats.avgErrorM * 1.5);
        this.policy.gpsExcellentAccuracyM = Math.max(3, gpsStats.minErrorM * 1.2);
      }
      // If GPS is consistently poor, raise thresholds to allow WiFi more often
      else if (gpsStats.avgErrorM > 20) {
        this.policy.gpsGoodAccuracyM = Math.min(25, gpsStats.avgErrorM * 0.8);
        this.policy.gpsExcellentAccuracyM = Math.min(12, gpsStats.minErrorM * 1.5);
      }
    }

    // Adapt WiFi BSSID thresholds based on WiFi performance
    const wifiStats = this.policy.methodStats.wifi;
    const wifiVariations = calibrationResults.variationResults.filter((v) =>
      v.method.toLowerCase().includes('wifi') && Number.isFinite(v.bssidCount)
    );

    if (wifiVariations.length > 0) {
      // Find the minimum BSSID count that gave good results (< 20m error)
      const goodWifiSamples = wifiVariations.filter((v) => v.error < 20);
      if (goodWifiSamples.length > 0) {
        const minGoodBssids = Math.min(...goodWifiSamples.map((v) => v.bssidCount || 999));
        const avgGoodBssids = goodWifiSamples.reduce((sum, v) => sum + (v.bssidCount || 0), 0) / goodWifiSamples.length;

        // Lower the threshold if we see good results with fewer BSSIDs
        if (minGoodBssids < this.policy.wifiMinUniqueBssids) {
          this.policy.wifiMinUniqueBssids = Math.max(3, Math.floor(minGoodBssids));
          this.policy.wifiMinValidBssids = this.policy.wifiMinUniqueBssids;
        }

        this.policy.wifiOptimalBssidCount = Math.floor(avgGoodBssids);
      }

      // If WiFi consistently fails or is worse than GPS, raise thresholds
      if (wifiStats && wifiStats.successRate < 0.5) {
        this.policy.wifiMinUniqueBssids = Math.min(10, this.policy.wifiMinUniqueBssids + 1);
        this.policy.wifiMinValidBssids = this.policy.wifiMinUniqueBssids;
      }
    }

    // Adapt divergence thresholds based on GPS vs WiFi agreement patterns
    if (gpsStats && wifiStats && gpsStats.totalSamples >= 3 && wifiStats.totalSamples >= 3) {
      const avgCombinedError = (gpsStats.avgErrorM + wifiStats.avgErrorM) / 2;

      // If methods typically agree well, tighten divergence check
      if (calibrationResults.bestMethod.toLowerCase().includes('hybrid') && calibrationResults.bestError < 10) {
        this.policy.maxDivergenceMultiplier = Math.max(2, this.policy.maxDivergenceMultiplier - 0.2);
        this.policy.minDivergenceFloorM = Math.max(100, avgCombinedError * 10);
      }
      // If they often disagree, loosen it
      else if (Math.abs(gpsStats.avgErrorM - wifiStats.avgErrorM) > 30) {
        this.policy.maxDivergenceMultiplier = Math.min(5, this.policy.maxDivergenceMultiplier + 0.3);
        this.policy.minDivergenceFloorM = Math.min(300, avgCombinedError * 15);
      }
    }

    await this.save();
    console.log('🎯 Updated adaptive policy:', {
      gpsGoodAccuracyM: this.policy.gpsGoodAccuracyM.toFixed(1),
      wifiMinBssids: this.policy.wifiMinUniqueBssids,
      calibrations: this.policy.calibrationCount,
      confidence: this.policy.confidenceLevel,
    });
  }

  private normalizeMethodKey(methodName: string): 'gps' | 'wifi' | 'hybrid' | null {
    const lower = methodName.toLowerCase();
    if (lower.includes('gps') && !lower.includes('wifi') && !lower.includes('hybrid')) return 'gps';
    if (lower.includes('wifi') && !lower.includes('gps') && !lower.includes('hybrid')) return 'wifi';
    if (lower.includes('hybrid') || (lower.includes('gps') && lower.includes('wifi'))) return 'hybrid';
    return null;
  }

  /**
   * Get the best location method for current environmental conditions
   */
  getBestMethodForConditions(
    weather?: string,
    season?: string,
    timeOfDay?: string
  ): { method: string; avgError: number } | null {
    const condKeys: string[] = [];
    if (weather) condKeys.push(`weather:${weather}`);
    if (season) condKeys.push(`season:${season}`);
    if (timeOfDay) condKeys.push(`tod:${timeOfDay}`);

    let bestMethod: string | null = null;
    let bestError = Infinity;

    for (const ck of condKeys) {
      const bucket = this.policy.conditionMethodStats[ck];
      if (!bucket) continue;
      for (const mk of ['gps', 'wifi', 'hybrid'] as const) {
        const s = bucket[mk];
        if (s && s.totalSamples >= 2 && s.avgErrorM < bestError) {
          bestError = s.avgErrorM;
          bestMethod = mk;
        }
      }
    }

    return bestMethod ? { method: bestMethod, avgError: bestError } : null;
  }

  /**
   * Reset policy to defaults (for testing or device change)
   */
  async reset(): Promise<void> {
    this.policy = {
      ...DEFAULT_POLICY,
      deviceModel: Device.modelName || Device.deviceName || 'unknown',
      osVersion: Platform.Version?.toString() || 'unknown',
    };
    await this.save();
    console.log('🔄 Reset adaptive policy to defaults');
  }

  /**
   * Get summary for debugging
   */
  getSummary(): string {
    const lines: string[] = [];
    lines.push(`Device: ${this.policy.deviceModel} (${this.policy.osVersion})`);
    lines.push(`Calibrations: ${this.policy.calibrationCount} (${this.policy.confidenceLevel} confidence)`);
    lines.push(`GPS thresholds: good=${this.policy.gpsGoodAccuracyM.toFixed(1)}m, excellent=${this.policy.gpsExcellentAccuracyM.toFixed(1)}m`);
    lines.push(`WiFi thresholds: min=${this.policy.wifiMinUniqueBssids} BSSIDs, optimal=${this.policy.wifiOptimalBssidCount}`);
    lines.push(`Divergence: ${this.policy.maxDivergenceMultiplier.toFixed(1)}x, floor=${this.policy.minDivergenceFloorM.toFixed(0)}m`);

    if (this.policy.methodStats.gps) {
      const gps = this.policy.methodStats.gps;
      lines.push(`GPS stats: ${gps.totalSamples} samples, avg=${gps.avgErrorM.toFixed(1)}m, range=${gps.minErrorM.toFixed(1)}-${gps.maxErrorM.toFixed(1)}m`);
    }

    if (this.policy.methodStats.wifi) {
      const wifi = this.policy.methodStats.wifi;
      lines.push(`WiFi stats: ${wifi.totalSamples} samples, avg=${wifi.avgErrorM.toFixed(1)}m, success=${(wifi.successRate * 100).toFixed(0)}%`);
    }

    if (this.policy.methodStats.hybrid) {
      const hybrid = this.policy.methodStats.hybrid;
      lines.push(`Hybrid stats: ${hybrid.totalSamples} samples, avg=${hybrid.avgErrorM.toFixed(1)}m`);
    }

    return lines.join('\n');
  }
}

export default new AdaptiveLocationPolicyService();
