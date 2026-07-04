/**
 * Indoor Detection Service
 *
 * Automatically determines whether the device is likely indoors or outdoors
 * by analyzing GPS signal quality and WiFi environment. When indoors, the
 * location engine should prioritize WiFi-based positioning over GPS because
 * GPS signals degrade significantly inside buildings while WiFi access
 * points are abundant and produce better accuracy.
 *
 * Heuristics:
 *  1. GPS accuracy value > 30 m OR GPS completely failing → likely indoors.
 *  2. 2+ strong WiFi signals (RSSI ≥ -60 dBm) → likely surrounded by routers.
 *  3. High ratio of strong APs to total APs → dense indoor WiFi environment.
 *  4. Combination yields a 0–1 confidence score; >= 0.6 is classified indoor.
 */

export interface IndoorDetectionResult {
  /** Whether the device is likely indoors */
  isIndoor: boolean;
  /** 0-1 confidence in the indoor determination */
  confidence: number;
  /** Human-readable reason for the determination */
  reason: string;
  /** Individual signal scores used in the determination */
  signals: {
    gpsWeakOrMissing: boolean;
    gpsAccuracyM: number | null;
    strongWifiCount: number;
    totalWifiCount: number;
    strongWifiRatio: number;
  };
}

/** Thresholds (tunable) */
const GPS_WEAK_ACCURACY_M = 30;
const STRONG_WIFI_RSSI = -60; // dBm — very strong signal
const MIN_STRONG_WIFI_FOR_INDOOR = 2;
const INDOOR_CONFIDENCE_THRESHOLD = 0.6;

class IndoorDetectionService {
  /**
   * Analyse available sensor signals and return an indoor/outdoor verdict.
   *
   * @param gpsAccuracyM  GPS-reported accuracy in metres, or `null` if GPS
   *                       failed / timed out entirely.
   * @param wifiNetworks   The WiFi scan results already gathered by the
   *                       location engine (avoids a duplicate scan).
   */
  detect(
    gpsAccuracyM: number | null,
    wifiNetworks: Array<{ ssid: string; bssid: string; signalStrength: number }>,
  ): IndoorDetectionResult {
    // --- GPS signal analysis ---
    const gpsFailed = gpsAccuracyM === null;
    const gpsWeak = gpsFailed || gpsAccuracyM > GPS_WEAK_ACCURACY_M;

    // GPS contribution: 0 (perfect outdoors GPS) → 0.5 (terrible / missing GPS)
    let gpsScore = 0;
    if (gpsFailed) {
      gpsScore = 0.5; // strongest indoor signal from GPS side
    } else if (gpsAccuracyM! > GPS_WEAK_ACCURACY_M) {
      // Scale 30-100 m → 0.2-0.5
      gpsScore = Math.min(0.5, 0.2 + ((gpsAccuracyM! - GPS_WEAK_ACCURACY_M) / 140) * 0.3);
    }

    // --- WiFi signal analysis ---
    const strongWifi = wifiNetworks.filter(
      (n) => n.signalStrength >= STRONG_WIFI_RSSI,
    );
    const strongCount = strongWifi.length;
    const totalCount = wifiNetworks.length;
    const strongRatio = totalCount > 0 ? strongCount / totalCount : 0;

    // WiFi contribution: many strong APs → likely indoors (max 0.5)
    let wifiScore = 0;
    if (strongCount >= MIN_STRONG_WIFI_FOR_INDOOR) {
      // 2 strong APs = 0.25, 4+ = 0.45, capped at 0.5
      wifiScore = Math.min(0.5, 0.15 + strongCount * 0.075);
    }
    // Bonus for high strong-to-total ratio (dense indoor environment)
    if (strongRatio > 0.4 && totalCount >= 3) {
      wifiScore = Math.min(0.5, wifiScore + 0.1);
    }

    // --- Combined score ---
    const confidence = Math.min(1, gpsScore + wifiScore);
    const isIndoor = confidence >= INDOOR_CONFIDENCE_THRESHOLD;

    // --- Human-readable reason ---
    const reasons: string[] = [];
    if (gpsFailed) {
      reasons.push('GPS unavailable');
    } else if (gpsWeak) {
      reasons.push(`GPS accuracy weak (${gpsAccuracyM!.toFixed(0)} m)`);
    }
    if (strongCount >= MIN_STRONG_WIFI_FOR_INDOOR) {
      reasons.push(`${strongCount} strong WiFi AP(s) nearby`);
    }
    const reason = isIndoor
      ? `Likely indoor: ${reasons.join(', ')}`
      : reasons.length > 0
        ? `Likely outdoor despite: ${reasons.join(', ')}`
        : 'Likely outdoor: strong GPS, few strong WiFi APs';

    const result: IndoorDetectionResult = {
      isIndoor,
      confidence,
      reason,
      signals: {
        gpsWeakOrMissing: gpsWeak,
        gpsAccuracyM,
        strongWifiCount: strongCount,
        totalWifiCount: totalCount,
        strongWifiRatio: strongRatio,
      },
    };

    console.log(
      `🏠 Indoor detection: ${isIndoor ? 'INDOOR' : 'OUTDOOR'} ` +
        `(confidence=${confidence.toFixed(2)}, gps=${gpsScore.toFixed(2)}, ` +
        `wifi=${wifiScore.toFixed(2)}) — ${reason}`,
    );

    return result;
  }
}

export default new IndoorDetectionService();
