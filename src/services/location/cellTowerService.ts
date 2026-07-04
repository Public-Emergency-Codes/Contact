import { NativeModules, Platform, PermissionsAndroid } from 'react-native';
import * as Location from 'expo-location';
import type { EnhancedLocation } from './locationModels';

const { CellTowerScanner } = NativeModules;

export interface CellTowerInfo {
  type: string;       // LTE | GSM | WCDMA | CDMA | NR
  registered: boolean;
  mcc: number;
  mnc: number;
  lac?: number;       // GSM / WCDMA
  tac?: number;       // LTE / NR
  ci?: number;        // LTE
  cid?: number;       // GSM / WCDMA
  nci?: number;       // NR (5G) — 36-bit cell identity
  sid?: number;       // CDMA
  nid?: number;
  bsid?: number;
  pci?: number;       // LTE
  signal: number;     // dBm
}

export interface CellGeolocationPolicy {
  enabled: boolean;
  allowNr: boolean;
  allowWhenOnlyNr: boolean;
  maxCellTowers: number;
  requestTimeoutMs: number;
  maxAcceptedAccuracyM: number;
}

export interface RawCellTelemetry {
  raw_mcc: number | null;
  raw_mnc: number | null;
  raw_lac_tac: number | null;
  raw_cid: number | null;
}

type CellSkipReason =
  | 'disabled'
  | 'scanner_unavailable'
  | 'no_towers'
  | 'nr_only'
  | 'no_valid_towers'
  | 'request_failed'
  | 'coarse_accuracy';

type CellTelemetry = {
  attempts: number;
  success: number;
  skipped: Record<CellSkipReason, number>;
  http4xx: number;
  http5xx: number;
};

const DEFAULT_POLICY: CellGeolocationPolicy = {
  enabled: true,
  allowNr: false,
  allowWhenOnlyNr: false,
  maxCellTowers: 20,
  requestTimeoutMs: 3500,
  maxAcceptedAccuracyM: 50000,
};

let cellPolicy: CellGeolocationPolicy = { ...DEFAULT_POLICY };
const createEmptyTelemetry = (): CellTelemetry => ({
  attempts: 0,
  success: 0,
  skipped: {
    disabled: 0,
    scanner_unavailable: 0,
    no_towers: 0,
    nr_only: 0,
    no_valid_towers: 0,
    request_failed: 0,
    coarse_accuracy: 0,
  },
  http4xx: 0,
  http5xx: 0,
});

let telemetry: CellTelemetry = createEmptyTelemetry();
let lastTelemetry: CellTelemetry = createEmptyTelemetry();

function syncLastTelemetry() {
  lastTelemetry = JSON.parse(JSON.stringify(telemetry)) as CellTelemetry;
}

function beginTelemetryAttempt() {
  telemetry = createEmptyTelemetry();
  telemetry.attempts = 1;
  syncLastTelemetry();
}

function skip(reason: CellSkipReason) {
  telemetry.skipped[reason] += 1;
  syncLastTelemetry();
  console.log('[Cell][Skip]', reason, '| telemetry:', JSON.stringify(lastTelemetry));
}

export function setCellGeolocationPolicy(policy: Partial<CellGeolocationPolicy>) {
  cellPolicy = { ...cellPolicy, ...policy };
}

export function getCellGeolocationPolicy(): CellGeolocationPolicy {
  return { ...cellPolicy };
}

export function getCellGeolocationTelemetry(): CellTelemetry {
  return JSON.parse(JSON.stringify(lastTelemetry)) as CellTelemetry;
}

export function isAvailable(): boolean {
  return Platform.OS === 'android' && !!CellTowerScanner;
}

export async function scanCellTowers(): Promise<CellTowerInfo[]> {
  if (!isAvailable()) return [];

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return [];

    const towers: CellTowerInfo[] = await CellTowerScanner.getCellTowers();
    return Array.isArray(towers) ? towers : [];
  } catch {
    return [];
  }
}

function normalizePositive(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

function buildRawCellTelemetry(towers: CellTowerInfo[]): RawCellTelemetry {
  const selected = towers.find((tower) => tower.registered) || towers[0];
  if (!selected) {
    return {
      raw_mcc: null,
      raw_mnc: null,
      raw_lac_tac: null,
      raw_cid: null,
    };
  }

  return {
    raw_mcc: normalizePositive(selected.mcc),
    raw_mnc: normalizePositive(selected.mnc),
    raw_lac_tac: normalizePositive(selected.tac ?? selected.lac ?? selected.nid),
    raw_cid: normalizePositive(selected.ci ?? selected.cid ?? selected.nci ?? selected.bsid),
  };
}

export async function getRawCellTelemetry(): Promise<RawCellTelemetry | null> {
  try {
    if (!cellPolicy.enabled || !isAvailable()) return null;
    const towers = await scanCellTowers();
    if (towers.length === 0) return null;
    return buildRawCellTelemetry(towers);
  } catch {
    return null;
  }
}

/**
 * Converts scanned cell towers to Google Geolocation API format.
 * Only includes towers with valid cellId/cid values.
 */
/* Direct third-party cell request formatting intentionally removed.
function toGoogleCellTowers(towers: CellTowerInfo[]) {
  return towers
    .filter((t) => {
      const cellId = t.ci ?? t.cid ?? t.nci ?? t.bsid;
      const locationAreaCode = t.tac ?? t.lac ?? t.nid;
      // Google Geolocation rejects malformed cells; require core IDs.
      if (cellId === undefined || cellId <= 0) return false;
      if (locationAreaCode === undefined || locationAreaCode <= 0) return false;

      if (t.mcc <= 0 || t.mnc <= 0) return false;

      // Google Geolocation does not accept 5G NR cells directly.
      if (t.type === 'NR') return cellPolicy.allowNr;

      if (t.type === 'LTE') {
        return cellId <= 268435455 && locationAreaCode <= 65535;
      }

      if (t.type === 'GSM' || t.type === 'WCDMA') {
        return cellId <= 65535 && locationAreaCode <= 65535;
      }

      if (t.type === 'CDMA') {
        return cellId <= 65535 && locationAreaCode <= 65535;
      }

      return false;
    })
    .slice(0, cellPolicy.maxCellTowers)
    .map((t) => {
      const cellId = t.ci ?? t.cid ?? t.nci ?? t.bsid ?? 0;
      const locationAreaCode = t.tac ?? t.lac ?? t.nid ?? 0;
      const entry: Record<string, unknown> = { cellId, locationAreaCode };
      if (t.mcc > 0) entry.mobileCountryCode = t.mcc;
      if (t.mnc > 0) entry.mobileNetworkCode = t.mnc;
      if (Number.isFinite(t.signal)) entry.signalStrength = t.signal;
      const radioTypeMap: Record<string, string> = {
        LTE: 'lte',
        GSM: 'gsm',
        WCDMA: 'wcdma',
        CDMA: 'cdma',
      };
      if (radioTypeMap[t.type]) entry.radioType = radioTypeMap[t.type];
      return entry;
    });
}
*/

/**
 * Android network-provider location (built-in cell-tower triangulation).
 *
 * Uses the OS network/fused provider at low accuracy so the fix is derived from
 * cell towers (and nearby Wi-Fi) by Android itself — the same network-based
 * positioning a carrier reports to CAD/ALI for a wireless 911 call. Requires no
 * Google API key because the OS performs the lookup, so this is the closest
 * approximation to "what CAD gets" the app can obtain on-device, and it is used
 * automatically whenever GPS is weak.
 */
export async function getNetworkProviderLocation(): Promise<EnhancedLocation | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    if (!pos?.coords) return null;
    const accuracy = pos.coords.accuracy || 1500;
    if (accuracy > cellPolicy.maxAcceptedAccuracyM) return null;
    telemetry.success += 1;
    syncLastTelemetry();
    console.log('[Cell] Network-provider (OS cell triangulation) fix:', pos.coords.latitude, pos.coords.longitude, 'acc=', accuracy);
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy,
      timestamp: pos.timestamp,
      method: 'CELL',
      confidence: accuracy < 1000 ? 'MEDIUM' : 'LOW',
      cell_resolved_lat: pos.coords.latitude,
      cell_resolved_lon: pos.coords.longitude,
    };
  } catch (err) {
    console.log('[Cell] Network-provider location failed:', err);
    return null;
  }
}

/**
 * Resolves scanned cell towers to a coordinate via the Google Geolocation API.
 * Most precise cell triangulation, but requires a configured API key.
 */
/* Direct third-party cell resolution intentionally removed.
async function resolveCellViaGoogle(geolocateUrl: string): Promise<EnhancedLocation | null> {
  if (!isAvailable()) {
    skip('scanner_unavailable');
    return null;
  }

  const towers = await scanCellTowers();
  const rawTelemetry = buildRawCellTelemetry(towers);
  console.log('[Cell] scanCellTowers returned', towers.length, 'towers:', JSON.stringify(towers.map(t => ({ type: t.type, ci: t.ci, cid: t.cid, nci: t.nci, tac: t.tac, lac: t.lac, mcc: t.mcc, mnc: t.mnc }))));
  if (towers.length === 0) {
    skip('no_towers');
    return null;
  }

  const hasNonNr = towers.some((t) => t.type !== 'NR');
  if (!hasNonNr && !cellPolicy.allowWhenOnlyNr) {
    skip('nr_only');
    return null;
  }

  const googleCells = toGoogleCellTowers(towers);
  console.log('[Cell] googleCells after filter:', googleCells.length);

  if (googleCells.length === 0) {
    console.log('[Cell] No valid cell towers, skipping geolocation');
    skip('no_valid_towers');
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cellPolicy.requestTimeoutMs);

  const response = await fetch(geolocateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ considerIp: false, cellTowers: googleCells }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    console.log('[Cell] Geolocation response not ok:', response.status);
    if (response.status >= 400 && response.status < 500) telemetry.http4xx += 1;
    if (response.status >= 500) telemetry.http5xx += 1;
    syncLastTelemetry();
    skip('request_failed');
    return null;
  }

  const data = await response.json();
  console.log('[Cell] Geolocation response:', JSON.stringify(data));
  if (!data?.location) return null;

  // Cell-tower accuracy is typically 300m–several km; ignore extremely coarse results
  if (typeof data.accuracy === 'number' && data.accuracy > cellPolicy.maxAcceptedAccuracyM) {
    console.log('[Cell] Accuracy too coarse:', data.accuracy, '— skipping');
    skip('coarse_accuracy');
    return null;
  }

  telemetry.success += 1;
  syncLastTelemetry();
  console.log('[Cell][Success] telemetry:', JSON.stringify(lastTelemetry));

  return {
    latitude: data.location.lat,
    longitude: data.location.lng,
    accuracy: data.accuracy || 2000,
    timestamp: Date.now(),
    method: 'CELL',
    confidence: data.accuracy < 1000 ? 'MEDIUM' : 'LOW',
    raw_mcc: rawTelemetry.raw_mcc,
    raw_mnc: rawTelemetry.raw_mnc,
    raw_lac_tac: rawTelemetry.raw_lac_tac,
    raw_cid: rawTelemetry.raw_cid,
    cell_resolved_lat: data.location.lat,
    cell_resolved_lon: data.location.lng,
  };
}
*/

/**
 * Returns a cell-tower triangulation estimate. Prefers Google-resolved scanned
 * cell towers when an API key is configured, and otherwise (or on failure) falls
 * back to Android's built-in network provider — which needs no key and best
 * matches the network-based location a real CAD/ALI receives. Returns null on
 * total failure so callers degrade gracefully to GPS/Wi-Fi.
 */
export async function getCellOnlyLocation(): Promise<EnhancedLocation | null> {
  try {
    beginTelemetryAttempt();
    if (!cellPolicy.enabled) {
      skip('disabled');
      return null;
    }

    // No API key configured, or Google resolution failed — use the OS network
    // provider (Android's built-in cell-tower triangulation).
    return await getNetworkProviderLocation();
  } catch {
    skip('request_failed');
    return await getNetworkProviderLocation();
  }
}

export default {
  isAvailable,
  scanCellTowers,
  getRawCellTelemetry,
  getCellOnlyLocation,
  getNetworkProviderLocation,
  setCellGeolocationPolicy,
  getCellGeolocationPolicy,
  getCellGeolocationTelemetry,
};
