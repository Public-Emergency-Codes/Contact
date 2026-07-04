/**
 * Saved Address Service (fully offline)
 *
 * Matches the user's current GPS coordinates against saved addresses and
 * builds a dispatcher-ready text block that excludes all "unsure" fields.
 * Geocoding from typed addresses is done offline using built-in state/county data.
 *
 * No server calls — everything stays on the device.
 */
import { store } from '../store';
import { updateAddress } from '../store/slices/savedAddressesSlice';
import type { SavedAddress } from '../store/slices/savedAddressesSlice';
import LAYOUT_QUESTIONS from '../utils/addressLayoutQuestions';
import { geocodeAddressOffline } from '../utils/offlineGeocoding';

/** Haversine distance in meters between two coordinates. */
export function haversineMeters(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Maximum distance (meters) for "nearby" — prompt the user to confirm.
 */
const NEARBY_RADIUS_METERS = 150;

export type AddressMatchResult =
  | { type: 'exact'; address: SavedAddress }
  | { type: 'nearby'; address: SavedAddress }
  | { type: 'none' };

/**
 * Synchronous version — only considers addresses that already have coordinates.
 */
export function classifyNearestAddress(
  latitude: number,
  longitude: number,
  accuracy?: number,
): AddressMatchResult {
  const { addresses } = store.getState().savedAddresses;
  if (!addresses.length) return { type: 'none' };

  let best: SavedAddress | null = null;
  let bestDist = Infinity;

  for (const addr of addresses) {
    if (addr.latitude == null || addr.longitude == null) continue;
    const dist = haversineMeters(latitude, longitude, addr.latitude, addr.longitude);
    if (dist < NEARBY_RADIUS_METERS && dist < bestDist) {
      best = addr;
      bestDist = dist;
    }
  }

  if (!best) return { type: 'none' };
  if (accuracy != null && bestDist <= accuracy) {
    return { type: 'exact', address: best };
  }
  return { type: 'nearby', address: best };
}

/**
 * Async version — also attempts offline geocoding for addresses that
 * have no stored coordinates yet.
 */
export async function classifyNearestAddressAsync(
  latitude: number,
  longitude: number,
  accuracy?: number,
): Promise<AddressMatchResult> {
  const { addresses } = store.getState().savedAddresses;
  if (!addresses.length) return { type: 'none' };

  // Offline-geocode any addresses missing coordinates
  const resolved: Array<SavedAddress & { latitude: number; longitude: number }> = [];
  for (const addr of addresses) {
    if (addr.latitude != null && addr.longitude != null) {
      resolved.push(addr as SavedAddress & { latitude: number; longitude: number });
    } else {
      const coords = geocodeAddressOffline(addr.address);
      if (coords) {
        store.dispatch(updateAddress({ ...addr, latitude: coords.lat, longitude: coords.lng }));
        resolved.push({ ...addr, latitude: coords.lat, longitude: coords.lng });
      }
    }
  }

  let best: (SavedAddress & { latitude: number; longitude: number }) | null = null;
  let bestDist = Infinity;
  for (const addr of resolved) {
    const dist = haversineMeters(latitude, longitude, addr.latitude, addr.longitude);
    if (dist < NEARBY_RADIUS_METERS && dist < bestDist) {
      best = addr;
      bestDist = dist;
    }
  }

  if (!best) return { type: 'none' };
  if (accuracy != null && bestDist <= accuracy) {
    return { type: 'exact', address: best };
  }
  return { type: 'nearby', address: best };
}

/** Resolve coordinates for saved addresses, preserving already-pinned values. */
export async function geocodeAddressesToCoords(
  addresses: SavedAddress[],
): Promise<Array<SavedAddress & { latitude: number; longitude: number }>> {
  const resolved: Array<SavedAddress & { latitude: number; longitude: number }> = [];
  for (const address of addresses) {
    if (address.latitude != null && address.longitude != null) {
      resolved.push(address as SavedAddress & { latitude: number; longitude: number });
      continue;
    }
    const coordinates = geocodeAddressOffline(address.address);
    if (!coordinates) continue;
    const updated = { ...address, latitude: coordinates.lat, longitude: coordinates.lng };
    store.dispatch(updateAddress(updated));
    resolved.push(updated);
  }
  return resolved;
}

/**
 * Find the closest saved address within NEARBY_RADIUS_METERS.
 * Returns null if no match. (kept for backwards-compat)
 */
export function findMatchingAddress(
  latitude: number,
  longitude: number,
): SavedAddress | null {
  const result = classifyNearestAddress(latitude, longitude);
  return result.type !== 'none' ? result.address : null;
}

/**
 * Build a dispatcher-ready string from a SavedAddress.
 * Every field marked "unsure" or left blank is excluded.
 */
export function buildDispatcherInfo(addr: SavedAddress): string {
  const parts: string[] = [];
  parts.push(`📍 Saved Location: ${addr.label} — ${addr.address}`);

  // Layout details (skip unsure / blank)
  const layout = addr.layout;
  for (const q of LAYOUT_QUESTIONS) {
    const val = (layout as any)[q.key] as string;
    if (!val || val === 'unsure') continue;
    const displayLabel = q.label;
    if (q.type === 'text') {
      parts.push(`${displayLabel}: ${val}`);
    } else {
      const opt = q.options.find((o) => o.value === val);
      parts.push(`${displayLabel}: ${opt?.label || val}`);
    }
  }

  if (addr.accessInstructions) {
    parts.push(`Access Instructions: ${addr.accessInstructions}`);
  }

  return parts.join('\n');
}

/**
 * Build a shorter version for SMS to emergency contacts.
 * Includes address, key layout info, and instructions.
 */
export function buildContactSmsInfo(addr: SavedAddress): string {
  const parts: string[] = [];
  parts.push(`📍 Known Location: ${addr.label} — ${addr.address}`);

  const { layout } = addr;
  if (layout.buildingType && layout.buildingType !== 'unsure') {
    const opt = LAYOUT_QUESTIONS.find((q) => q.key === 'buildingType')
      ?.options.find((o) => o.value === layout.buildingType);
    parts.push(`Building: ${opt?.label || layout.buildingType}`);
  }
  if (addr.accessInstructions) {
    parts.push(`Access: ${addr.accessInstructions}`);
  }
  return parts.join('\n');
}
