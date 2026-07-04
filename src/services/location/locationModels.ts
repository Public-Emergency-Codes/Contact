export interface EnhancedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  adjustedAccuracy?: number;
  trustScore?: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
  method: 'GPS' | 'WIFI' | 'CELL' | 'HYBRID' | 'CACHED';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  wifiNetworks?: Array<{
    ssid: string;
    bssid: string;
    signalStrength: number;
  }>;
  raw_mcc?: number | null;
  raw_mnc?: number | null;
  raw_lac_tac?: number | null;
  raw_cid?: number | null;
  cell_resolved_lat?: number | null;
  cell_resolved_lon?: number | null;
  wifi_resolved_json_array?: Array<{
    bssid: string;
    signalStrength: number;
  }>;
  samplesUsed?: number;
  samplesRejected?: number;
  sampleSpread?: number;
  isIndoor?: boolean;
}

export interface KalmanState {
  lat: number;
  lng: number;
  variance: number;
}

export interface EnabledMethods {
  gps: boolean;
  wifi: boolean;
  cell: boolean;
  hybrid: boolean;
}

export interface SelectionPolicy {
  gpsGoodAccuracyM: number;
  wifiMinUniqueBssids: number;
  wifiMinValidBssids: number;
  maxDivergenceMultiplier: number;
  minDivergenceFloorM: number;
}

export interface WiFiNetwork {
  ssid: string;
  bssid: string;
  signalStrength: number;
}
