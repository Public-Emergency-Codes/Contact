import { type EnhancedLocation, type WiFiNetwork } from './locationModels';

export function calculateConfidence(accuracy: number, wifiCount: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (accuracy < 20 && wifiCount > 3) return 'HIGH';
  if (accuracy < 50 && wifiCount > 1) return 'HIGH';
  if (accuracy < 100) return 'MEDIUM';
  return 'LOW';
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function rejectOutliers(locations: EnhancedLocation[]): {
  filtered: EnhancedLocation[];
  rejected: number;
  spread: number;
} {
  if (locations.length < 3) {
    return {
      filtered: locations,
      rejected: 0,
      spread: 0,
    };
  }

  const medianLat = calculateMedian(locations.map((l) => l.latitude));
  const medianLon = calculateMedian(locations.map((l) => l.longitude));

  const distances = locations.map((loc) =>
    calculateDistance(loc.latitude, loc.longitude, medianLat, medianLon),
  );

  const mad = calculateMedian(distances);
  const threshold = Math.max(mad * 2.5, 50);
  const filtered = locations.filter((_, idx) => distances[idx] <= threshold);
  const spread =
    filtered.length > 0
      ? Math.max(
          ...filtered.map((loc) =>
            calculateDistance(loc.latitude, loc.longitude, medianLat, medianLon),
          ),
        )
      : 0;

  console.log(
    `📊 Outlier rejection: ${filtered.length}/${locations.length} samples kept, spread: ${spread.toFixed(1)}m, MAD: ${mad.toFixed(1)}m`,
  );

  return {
    filtered: filtered.length > 0 ? filtered : locations,
    rejected: locations.length - filtered.length,
    spread,
  };
}

export function summarizeWiFiNetworks(networks: WiFiNetwork[]): {
  total: number;
  validBssids: number;
  uniqueBssids: number;
} {
  const valid = networks.filter((n) => isValidMac(n.bssid));
  const unique = new Set(valid.map((n) => n.bssid.toLowerCase()));
  return { total: networks.length, validBssids: valid.length, uniqueBssids: unique.size };
}

export function isValidMac(mac: string): boolean {
  if (!mac || typeof mac !== 'string') return false;
  const normalized = mac.trim();
  if (normalized.toLowerCase() === 'unknown') return false;
  if (normalized === '00:00:00:00:00:00') return false;
  return /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(normalized);
}

export function isMobileHotspot(ssid: string): boolean {
  const hotspotPatterns = [
    /android[_\s-]?hotspot/i,
    /iphone/i,
    /galaxy[_\s-]?s\d+/i,
    /pixel[_\s-]?\d+/i,
    /oneplus/i,
    /^\d{4}$/,
  ];
  return hotspotPatterns.some((pattern) => pattern.test(ssid));
}

export function computeCentroidOffset(
  lat: number,
  lon: number,
  accuracy: number,
): { centroid_lat: number; centroid_lon: number; centroid_unc: number } {
  // Semi-random physical bearing (0 to 359)
  const bearingDeg = Math.floor(Math.random() * 360);
  // Semi-random localized distance offset (0m to 100m)
  const distanceM = Math.random() * 100;

  const R = 6378137; // Earth radius in meters
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceM * Math.cos(bearingRad)) / R * (180 / Math.PI);
  const dLon = (distanceM * Math.sin(bearingRad)) / (R * Math.cos((lat * Math.PI) / 180)) * (180 / Math.PI);

  const centroid_lat = lat + dLat;
  const centroid_lon = lon + dLon;

  // Uncertainty / error margin buffer capped conservatively between 50m and 120m
  const centroid_unc = Math.max(50, Math.min(120, accuracy || 75));

  return {
    centroid_lat,
    centroid_lon,
    centroid_unc,
  };
}
