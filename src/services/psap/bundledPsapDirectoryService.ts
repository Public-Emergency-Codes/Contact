// Device-local PSAP capability + emergency-number lookup. Pure in-memory
// computation over the bundled dataset; no network calls. Mirrors the response
// shapes the app previously consumed from the backend so call sites are a drop-in.

import {
  PSAP_CAPABILITIES,
  LOCAL_EMERGENCY_NUMBERS,
  PsapCapabilityRecord,
} from './capabilities';

export interface SmsCapabilityResult {
  capable: boolean;
  smsCapable: boolean;
  smsNumber?: string;
  psap: string;
  state?: string;
  county?: string;
  confidence: number;
  reason?: string;
}

export interface LocalEmergencyNumbersResult {
  policeNumber: string;
  medicalNumber: string;
  fireNumber: string;
  matchedBy: string;
  county: string | null;
  state: string | null;
  city: string | null;
  countryCode: string;
  psap: string | null;
  source: string;
}

// Squared planar distance in degrees (matches the backend's point <-> point
// ordering; good enough for nearest-neighbour ranking at these scales).
function distanceDegrees(lat: number, lng: number, r: PsapCapabilityRecord): number {
  const dLat = lat - r.latitude;
  const dLng = lng - r.longitude;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function nearestPsap(lat: number, lng: number): { record: PsapCapabilityRecord; distance: number } | null {
  let best: PsapCapabilityRecord | null = null;
  let bestDist = Infinity;
  for (const r of PSAP_CAPABILITIES) {
    const d = distanceDegrees(lat, lng, r);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best ? { record: best, distance: bestDist } : null;
}

/**
 * Determine Text-to-911 capability for a location from bundled data.
 * Within ~55km (0.5 deg) of a known PSAP we trust its flag; otherwise we
 * default to "not capable" (the safe default — app falls back to voice/TTS).
 */
export function checkSmsCapability(latitude: number, longitude: number): SmsCapabilityResult {
  const nearest = nearestPsap(latitude, longitude);
  if (nearest && nearest.distance < 0.5 && nearest.record.confidence >= 0.6) {
    const r = nearest.record;
    return {
      capable: r.smsCapable,
      smsCapable: r.smsCapable,
      smsNumber: '911',
      psap: r.psapName,
      state: r.state,
      county: r.county,
      confidence: r.confidence,
    };
  }
  return {
    capable: false,
    smsCapable: false,
    psap: 'Unknown',
    confidence: 0,
    reason: 'unknown_psap',
  };
}

/**
 * Resolve local police/medical/fire numbers for a location from bundled data.
 * County/state are derived from the nearest PSAP, then matched against the
 * bundled number table with city > county > state > country fallback ordering.
 */
export function resolveLocalEmergencyNumbers(
  latitude: number,
  longitude: number,
  hints: { city?: string | null; county?: string | null; state?: string | null; countryCode?: string | null } = {},
): LocalEmergencyNumbersResult {
  const countryCode = (hints.countryCode || 'US').toUpperCase();
  let county = hints.county || null;
  let state = hints.state || null;
  const city = hints.city || null;
  let matchedPsap: string | null = null;

  const nearest = nearestPsap(latitude, longitude);
  if (nearest && nearest.distance < 0.75) {
    county = county || nearest.record.county || null;
    state = state || nearest.record.state || null;
    matchedPsap = nearest.record.psapName || null;
  }

  const candidates = LOCAL_EMERGENCY_NUMBERS.filter((row) => {
    if (row.countryCode.toUpperCase() !== countryCode) return false;
    if (row.state && (!state || row.state.toUpperCase() !== state.toUpperCase())) return false;
    if (row.county && (!county || row.county.toLowerCase() !== county.toLowerCase())) return false;
    if (row.city && (!city || row.city.toLowerCase() !== city.toLowerCase())) return false;
    return true;
  });

  const rank = (row: typeof LOCAL_EMERGENCY_NUMBERS[number]): number => {
    if (row.city && city && row.city.toLowerCase() === city.toLowerCase()) return 0;
    if (row.county && county && row.county.toLowerCase() === county.toLowerCase()) return 1;
    if (row.state && state && row.state.toUpperCase() === state.toUpperCase()) return 2;
    return 3;
  };
  candidates.sort((a, b) => rank(a) - rank(b));
  const row = candidates[0];

  return {
    policeNumber: '911',
    medicalNumber: row?.medicalNumber || '911',
    fireNumber: row?.fireNumber || '911',
    matchedBy: row?.city ? 'city' : row?.county ? 'county' : row?.state ? 'state' : 'country_fallback',
    county,
    state,
    city,
    countryCode,
    psap: matchedPsap,
    source: row?.source || 'default_fallback',
  };
}

export const bundledPsapDirectory = { checkSmsCapability, resolveLocalEmergencyNumbers };
export default bundledPsapDirectory;
