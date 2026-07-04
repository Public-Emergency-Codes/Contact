/**
 * Offline Geocoding Utility (fully local)
 *
 * Converts typed addresses to GPS coordinates without any external API.
 * Uses a built-in mapping of US states to approximate center coordinates.
 * When county is available from the address, it cross-references the
 * bundled PSAP data for a more precise location.
 *
 * No server calls — everything stays on the device.
 */

import { haversineMeters } from '../services/savedAddressService';
import { PSAP_CAPABILITIES } from '../services/psap/capabilities';
import type { SavedAddress } from '../store/slices/savedAddressesSlice';

// Approximate center coordinates for each US state
const STATE_COORDS: Record<string, { lat: number; lng: number }> = {
  'Alabama': { lat: 32.8067, lng: -86.7911 },
  'Alaska': { lat: 61.3707, lng: -152.4042 },
  'Arizona': { lat: 33.7298, lng: -111.4312 },
  'Arkansas': { lat: 34.7465, lng: -92.2896 },
  'California': { lat: 36.1162, lng: -119.6816 },
  'Colorado': { lat: 39.0598, lng: -105.3111 },
  'Connecticut': { lat: 41.5978, lng: -72.7554 },
  'Delaware': { lat: 39.3498, lng: -75.5148 },
  'Florida': { lat: 27.7663, lng: -81.6868 },
  'Georgia': { lat: 32.9866, lng: -83.6487 },
  'Hawaii': { lat: 21.0943, lng: -157.4983 },
  'Idaho': { lat: 44.2405, lng: -114.4788 },
  'Illinois': { lat: 40.1020, lng: -89.3652 },
  'Indiana': { lat: 39.8494, lng: -86.2583 },
  'Iowa': { lat: 42.0115, lng: -93.2105 },
  'Kansas': { lat: 38.4984, lng: -98.3200 },
  'Kentucky': { lat: 37.6681, lng: -84.6701 },
  'Louisiana': { lat: 30.9738, lng: -91.4299 },
  'Maine': { lat: 45.3676, lng: -69.2428 },
  'Maryland': { lat: 39.0639, lng: -76.8021 },
  'Massachusetts': { lat: 42.2302, lng: -71.5301 },
  'Michigan': { lat: 44.3148, lng: -85.4106 },
  'Minnesota': { lat: 45.7326, lng: -93.9196 },
  'Mississippi': { lat: 32.7416, lng: -89.6787 },
  'Missouri': { lat: 38.4629, lng: -92.3021 },
  'Montana': { lat: 46.9219, lng: -110.4544 },
  'Nebraska': { lat: 41.5378, lng: -99.7951 },
  'Nevada': { lat: 39.3289, lng: -116.6312 },
  'New Hampshire': { lat: 43.6552, lng: -71.5632 },
  'New Jersey': { lat: 40.2670, lng: -74.5101 },
  'New Mexico': { lat: 34.4071, lng: -106.1126 },
  'New York': { lat: 42.1498, lng: -74.9385 },
  'North Carolina': { lat: 35.6301, lng: -79.8064 },
  'North Dakota': { lat: 47.4679, lng: -100.3023 },
  'Ohio': { lat: 40.3737, lng: -82.7753 },
  'Oklahoma': { lat: 35.5376, lng: -96.9247 },
  'Oregon': { lat: 43.9793, lng: -120.7374 },
  'Pennsylvania': { lat: 40.5908, lng: -77.2097 },
  'Rhode Island': { lat: 41.6762, lng: -71.5562 },
  'South Carolina': { lat: 33.8569, lng: -80.9450 },
  'South Dakota': { lat: 44.2147, lng: -100.2537 },
  'Tennessee': { lat: 35.8303, lng: -85.9787 },
  'Texas': { lat: 31.0544, lng: -97.5635 },
  'Utah': { lat: 40.1500, lng: -111.8626 },
  'Vermont': { lat: 43.8011, lng: -72.3643 },
  'Virginia': { lat: 37.5215, lng: -78.2029 },
  'Washington': { lat: 47.4009, lng: -120.0590 },
  'West Virginia': { lat: 38.4912, lng: -80.9545 },
  'Wisconsin': { lat: 44.2685, lng: -89.6165 },
  'Wyoming': { lat: 42.7475, lng: -107.2085 },
};

// Two-letter state code → full name
const STATE_CODE_MAP: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

/** Extract state name from an address string. */
function extractState(address: string): string | null {
  // Match two-letter code before zip
  const codeMatch = address.match(/\b([A-Z]{2})\b\s*\d{5}(?:-\d{4})?$/);
  if (codeMatch) {
    const code = codeMatch[1].toUpperCase();
    if (STATE_CODE_MAP[code]) return STATE_CODE_MAP[code];
  }
  // Match full state name
  for (const state of Object.keys(STATE_COORDS)) {
    if (address.includes(state) || address.includes(state.toUpperCase())) {
      return state;
    }
  }
  return null;
}

function getStateAbbreviation(stateName: string): string | null {
  const entry = Object.entries(STATE_CODE_MAP).find(
    ([, name]) => name.toLowerCase() === stateName.toLowerCase(),
  );
  return entry ? entry[0] : null;
}

/** Extract county name by cross-referencing address against PSAP data. */
function extractCounty(address: string, stateAbbr: string | null): string | null {
  if (!stateAbbr) return null;
  const statePsaps = PSAP_CAPABILITIES.filter((p) => p.state === stateAbbr);
  for (const psap of statePsaps) {
    if (address.toLowerCase().includes(psap.county.toLowerCase())) {
      return psap.county;
    }
  }
  return null;
}

export interface OfflineLocationInfo {
  latitude: number;
  longitude: number;
  nearestPsap: string | null;
  county: string | null;
  state: string | null;
  psapDistanceKm: number | null;
  smsCapable: boolean;
  nearbySavedAddresses: SavedAddress[];
}

/**
 * Geocode an address to GPS coordinates using only local data.
 * Returns the center of the matched state, or county PSAP center if available.
 */
export function geocodeAddressOffline(address: string): { lat: number; lng: number } | null {
  const state = extractState(address);
  if (!state) return null;

  const stateAbbr = getStateAbbreviation(state);
  const county = extractCounty(address, stateAbbr);

  // Try county-level precision first
  if (county && stateAbbr) {
    const psap = PSAP_CAPABILITIES.find(
      (p) => p.county.toLowerCase() === county.toLowerCase() && p.state === stateAbbr,
    );
    if (psap) return { lat: psap.latitude, lng: psap.longitude };
  }

  // Fall back to state center
  const coords = STATE_COORDS[state];
  if (coords) return { lat: coords.lat, lng: coords.lng };

  return null;
}

/**
 * Get location context from local data only (reverse geocoding).
 */
export function getOfflineLocationContext(
  latitude: number,
  longitude: number,
  savedAddresses: SavedAddress[] = [],
): OfflineLocationInfo {
  let nearestPsap: string | null = null;
  let county: string | null = null;
  let state: string | null = null;
  let psapDistanceKm: number | null = null;
  let smsCapable = false;
  let bestDist = Infinity;

  for (const psap of PSAP_CAPABILITIES) {
    const dist = haversineMeters(latitude, longitude, psap.latitude, psap.longitude) / 1000;
    if (dist < bestDist) {
      bestDist = dist;
      nearestPsap = psap.psapName;
      county = psap.county;
      state = psap.state;
      psapDistanceKm = dist;
      smsCapable = psap.smsCapable;
    }
  }

  const nearbySavedAddresses = savedAddresses.filter((addr) => {
    if (addr.latitude == null || addr.longitude == null) return false;
    return haversineMeters(latitude, longitude, addr.latitude, addr.longitude) <= 150;
  });

  return {
    latitude, longitude, nearestPsap, county, state,
    psapDistanceKm: psapDistanceKm < 9999 ? psapDistanceKm : null,
    smsCapable, nearbySavedAddresses,
  };
}

/**
 * Get a human-readable location summary from offline data.
 */
export function getOfflineLocationSummary(
  latitude: number,
  longitude: number,
): string {
  const ctx = getOfflineLocationContext(latitude, longitude);
  const parts: string[] = [];
  if (ctx.county) parts.push(ctx.county);
  if (ctx.state) parts.push(ctx.state);
  if (parts.length > 0) return `Near ${parts.join(', ')} County`;
  return `At ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}
