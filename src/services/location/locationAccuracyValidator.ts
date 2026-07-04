/**
 * Location Accuracy Validator
 *
 * Solves the core problem: a method's self-reported accuracy radius
 * doesn't mean it's actually accurate. A cell tower might claim 500m
 * but be 2km off, while GPS might claim 25m and be spot-on.
 *
 * Three strategies:
 * 1. Consistency scoring — multi-sample scatter check per method
 * 2. Historical trust multiplier — learned from pin corrections
 * 3. Cross-validation — agreement between independent methods
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ValidatedLocation {
  latitude: number;
  longitude: number;
  reportedAccuracy: number;   // What the method claims
  adjustedAccuracy: number;   // Our corrected estimate
  trustScore: number;         // 0-1, how much we trust this reading
  method: string;
  consistencySpread?: number; // Scatter of multi-sample (meters)
  historicalMultiplier?: number;
}

export interface MethodTrustRecord {
  sampleCount: number;
  // Ratio of actual error to reported accuracy, running average
  // e.g. if GPS reports 15m but is actually 40m off, ratio = 2.67
  avgAccuracyRatio: number;
  maxAccuracyRatio: number;
  // Standard deviation of the ratio (how consistent is the lie?)
  ratioVariance: number;
  lastUpdated: number;
}

export interface TrustDatabase {
  gps: MethodTrustRecord;
  wifi: MethodTrustRecord;
  hybrid: MethodTrustRecord;
  cell: MethodTrustRecord;
}

const DEFAULT_TRUST: MethodTrustRecord = {
  sampleCount: 0,
  avgAccuracyRatio: 1.0, // Assume honest until proven otherwise
  maxAccuracyRatio: 1.0,
  ratioVariance: 0,
  lastUpdated: 0,
};

const STORAGE_KEY = 'location_trust_database';

class LocationAccuracyValidator {
  private trustDb: TrustDatabase = {
    gps: { ...DEFAULT_TRUST },
    wifi: { ...DEFAULT_TRUST },
    hybrid: { ...DEFAULT_TRUST },
    cell: { ...DEFAULT_TRUST },
  };
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TrustDatabase>;
        this.trustDb = {
          gps: { ...DEFAULT_TRUST, ...parsed.gps },
          wifi: { ...DEFAULT_TRUST, ...parsed.wifi },
          hybrid: { ...DEFAULT_TRUST, ...parsed.hybrid },
          cell: { ...DEFAULT_TRUST, ...parsed.cell },
        };
        console.log('📊 Loaded trust database');
      }
    } catch (e) {
      console.warn('Failed to load trust database:', e);
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.trustDb));
    } catch (e) {
      console.warn('Failed to save trust database:', e);
    }
  }

  /**
   * STRATEGY 1: Consistency Scoring
   *
   * Take multiple quick samples from one method. If scatter is much
   * larger than the reported accuracy, the accuracy claim is inflated.
   *
   * Returns a multiplier >= 1.0 to inflate reported accuracy.
   */
  computeConsistencyMultiplier(
    samples: Array<{ lat: number; lng: number; reportedAccuracy: number }>
  ): { multiplier: number; spread: number } {
    if (samples.length < 2) return { multiplier: 1.0, spread: 0 };

    // Calculate centroid
    const cLat = samples.reduce((s, p) => s + p.lat, 0) / samples.length;
    const cLng = samples.reduce((s, p) => s + p.lng, 0) / samples.length;

    // Calculate spread: max distance from centroid
    const distances = samples.map((s) =>
      this.haversineM(s.lat, s.lng, cLat, cLng)
    );
    const spread = Math.max(...distances);
    const avgReported = samples.reduce((s, p) => s + p.reportedAccuracy, 0) / samples.length;

    // If scatter exceeds reported accuracy, inflate proportionally
    // spread/avgReported gives how many times worse the scatter is
    if (spread > avgReported && avgReported > 0) {
      const rawRatio = spread / avgReported;
      // Dampen: don't go crazy — cap at 5x multiplier
      const multiplier = Math.min(5.0, 1.0 + (rawRatio - 1.0) * 0.7);
      console.log(
        `📏 Consistency: spread=${spread.toFixed(1)}m vs reported=${avgReported.toFixed(1)}m → ${multiplier.toFixed(2)}x`
      );
      return { multiplier, spread };
    }

    // Scatter is within reported accuracy — good sign, slight trust bonus
    const multiplier = spread > 0 ? Math.max(0.8, spread / avgReported) : 0.9;
    return { multiplier, spread };
  }

  /**
   * STRATEGY 2: Historical Trust Multiplier
   *
   * Uses past pin corrections to learn how much each method
   * exaggerates (or understates) its accuracy.
   *
   * Returns a multiplier: >1 means the method over-promises.
   */
  getHistoricalMultiplier(method: string): number {
    const key = this.normalizeKey(method);
    if (!key) return 1.0;
    const record = this.trustDb[key];
    if (record.sampleCount < 3) return 1.0; // Not enough data
    // Use the average ratio, but don't let it go below 0.5 or above 5
    return Math.max(0.5, Math.min(5.0, record.avgAccuracyRatio));
  }

  /**
   * STRATEGY 3: Cross-Validation Score
   *
   * When two independent methods produce readings, their agreement
   * is a strong signal of actual accuracy. If GPS says X and WiFi
   * says Y and they're 10m apart, both are probably accurate.
   * If they're 500m apart, neither's reported accuracy is trustworthy.
   *
   * Returns a trust factor 0-1 for each method.
   */
  crossValidate(
    a: { lat: number; lng: number; reportedAccuracy: number; method: string },
    b: { lat: number; lng: number; reportedAccuracy: number; method: string }
  ): { trustA: number; trustB: number; separation: number } {
    const separation = this.haversineM(a.lat, a.lng, b.lat, b.lng);
    const combinedUncertainty = a.reportedAccuracy + b.reportedAccuracy;

    if (separation <= combinedUncertainty * 0.5) {
      // Excellent agreement — both within half their combined uncertainty
      return { trustA: 1.0, trustB: 1.0, separation };
    }

    if (separation <= combinedUncertainty) {
      // Reasonable agreement — within combined uncertainty circles
      const trust = 1.0 - 0.3 * (separation / combinedUncertainty);
      return { trustA: trust, trustB: trust, separation };
    }

    // Disagreement — at least one is lying about accuracy
    // The one with SMALLER reported accuracy is more likely lying
    // (claiming to be precise when it's actually off)
    const ratio = separation / combinedUncertainty;
    const penalty = Math.max(0.1, 1.0 / ratio);

    // Method with smaller accuracy claim gets penalized more
    // because it's making a bolder claim that's clearly wrong
    if (a.reportedAccuracy < b.reportedAccuracy) {
      const aOverconfidence = b.reportedAccuracy / a.reportedAccuracy;
      const penaltyA = Math.max(0.05, penalty / Math.sqrt(aOverconfidence));
      return { trustA: penaltyA, trustB: Math.min(0.7, penalty * 1.2), separation };
    } else {
      const bOverconfidence = a.reportedAccuracy / b.reportedAccuracy;
      const penaltyB = Math.max(0.05, penalty / Math.sqrt(bOverconfidence));
      return { trustA: Math.min(0.7, penalty * 1.2), trustB: penaltyB, separation };
    }
  }

  /**
   * Combined: Get the adjusted accuracy for a location reading,
   * applying all three strategies.
   */
  adjustAccuracy(
    reportedAccuracy: number,
    method: string,
    consistencyMultiplier: number,
    crossValidationTrust?: number
  ): { adjustedAccuracy: number; trustScore: number } {
    const historical = this.getHistoricalMultiplier(method);

    // Combine multipliers: take the worse (higher) of consistency
    // and historical, since both are independent evidence of unreliability
    const combinedMultiplier = Math.max(consistencyMultiplier, historical);

    let adjustedAccuracy = reportedAccuracy * combinedMultiplier;

    // Cross-validation can improve trust (if methods agree) or worsen it
    let trustScore = 1.0 / combinedMultiplier; // Base trust from self-assessment
    if (crossValidationTrust !== undefined) {
      // Blend: cross-validation is strong evidence
      trustScore = trustScore * 0.4 + crossValidationTrust * 0.6;
      // If cross-validation says we're trustworthy, reduce inflation
      if (crossValidationTrust > 0.8) {
        adjustedAccuracy = reportedAccuracy * (1 + (combinedMultiplier - 1) * 0.3);
      }
    }

    trustScore = Math.max(0.05, Math.min(1.0, trustScore));
    adjustedAccuracy = Math.max(1, adjustedAccuracy);

    return { adjustedAccuracy, trustScore };
  }

  /**
   * Record a pin correction to learn trust levels.
   * Called when user pins their location and we know the true position.
   *
   * @param method          Which method produced the reading
   * @param reportedAccuracy What the method claimed
   * @param actualErrorM    Distance from reading to user's pin (meters)
   */
  async recordCorrection(
    method: string,
    reportedAccuracy: number,
    actualErrorM: number
  ): Promise<void> {
    await this.load();
    const key = this.normalizeKey(method);
    if (!key || !Number.isFinite(actualErrorM) || reportedAccuracy <= 0) return;

    const ratio = actualErrorM / reportedAccuracy;
    const record = this.trustDb[key];

    if (record.sampleCount === 0) {
      record.avgAccuracyRatio = ratio;
      record.maxAccuracyRatio = ratio;
      record.ratioVariance = 0;
      record.sampleCount = 1;
    } else {
      // Exponential moving average with heavier weight on recent samples
      const alpha = Math.max(0.1, 1 / (record.sampleCount + 1));
      const oldAvg = record.avgAccuracyRatio;
      record.avgAccuracyRatio = oldAvg + alpha * (ratio - oldAvg);
      // Update variance using Welford's online algorithm
      const delta = ratio - oldAvg;
      const delta2 = ratio - record.avgAccuracyRatio;
      record.ratioVariance =
        record.ratioVariance * (1 - alpha) + alpha * delta * delta2;
      record.maxAccuracyRatio = Math.max(record.maxAccuracyRatio, ratio);
      record.sampleCount++;
    }
    record.lastUpdated = Date.now();

    console.log(
      `📝 Trust update [${key}]: reported=${reportedAccuracy.toFixed(1)}m, ` +
        `actual=${actualErrorM.toFixed(1)}m, ratio=${ratio.toFixed(2)}, ` +
        `avgRatio=${record.avgAccuracyRatio.toFixed(2)} (${record.sampleCount} samples)`
    );

    await this.save();
  }

  /**
   * Get a summary for debugging/display.
   */
  getSummary(): string {
    const lines: string[] = ['=== Location Trust Database ==='];
    for (const key of ['gps', 'wifi', 'hybrid', 'cell'] as const) {
      const r = this.trustDb[key];
      if (r.sampleCount === 0) {
        lines.push(`  ${key.toUpperCase()}: no data`);
      } else {
        const trustPct = Math.round((1 / Math.max(0.5, r.avgAccuracyRatio)) * 100);
        lines.push(
          `  ${key.toUpperCase()}: ${r.sampleCount} corrections, ` +
            `avg ratio=${r.avgAccuracyRatio.toFixed(2)}x, ` +
            `trust=${trustPct}%, ` +
            `worst=${r.maxAccuracyRatio.toFixed(2)}x`
        );
      }
    }
    return lines.join('\n');
  }

  getTrustDb(): TrustDatabase {
    return { ...this.trustDb };
  }

  private normalizeKey(method: string): keyof TrustDatabase | null {
    const m = method.toLowerCase();
    if (m === 'gps') return 'gps';
    if (m === 'wifi') return 'wifi';
    if (m === 'hybrid') return 'hybrid';
    if (m === 'cell') return 'cell';
    return null;
  }

  private haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

export default new LocationAccuracyValidator();
