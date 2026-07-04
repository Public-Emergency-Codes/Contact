import * as Location from 'expo-location';

export interface ReverseGeocodeResult {
  address: string;
  addresses: any[];
  closestIdx: number;
}

// Formats an expo-location reverse-geocode result into a single-line address,
// e.g. "257 East 4th Street, Brooklyn, NY 11218".
const formatOsAddress = (a: Location.LocationGeocodedAddress): string => {
  const street = [a.streetNumber, a.street || a.name].filter(Boolean).join(' ').trim();
  const cityState = [a.city || a.subregion, a.region].filter(Boolean).join(', ').trim();
  const tail = [cityState, a.postalCode].filter(Boolean).join(' ').trim();
  return [street, tail].filter(Boolean).join(', ').trim();
};

// Reverse geocodes a point through Android into a structured address record.
// No external road lookup or third-party geocoding fallback is performed here.
const buildAddressRecord = async (
  queryLat: number,
  queryLng: number,
  isPrimary: boolean,
): Promise<any | null> => {
  let formatted = '';
  let streetNumber = '';
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: queryLat, longitude: queryLng });
    const a = results?.[0];
    if (a) {
      formatted = formatOsAddress(a);
      streetNumber = (a.streetNumber || formatted.match(/^\d+/)?.[0] || '').trim();
    }
  } catch {}
  if (!formatted) return null;

  return {
    address: formatted,
    latitude: queryLat,
    longitude: queryLng,
    roadLat: queryLat,
    roadLng: queryLng,
    locationType: 'ROOFTOP',
    panoId: undefined,
    panoLat: undefined,
    panoLng: undefined,
    distance: 0,
    streetNumber,
    isPrimary,
    heading: 0,
  };
};

/**
 * Reverse geocodes lat/lng using only the Android OS Geocoder (expo-location).
 * Returns address data without setting any React state.
 * Caller is responsible for updating state from the returned values.
 */
export const reverseGeocode = async (
  latitude: number,
  longitude: number,
): Promise<ReverseGeocodeResult | null> => {
  try {
    const primaryData = await buildAddressRecord(latitude, longitude, true);
    if (!primaryData) return null;

    let allAddresses = [primaryData];

    // Probe immediate left/right neighbours (~15 m east/west) so the user can pick
    // the adjacent house number if the matched point landed on the wrong unit.
    const earthRadius = 6371000;
    const searchDistance = 15;
    const dLng = (searchDistance / (earthRadius * Math.cos(latitude * Math.PI / 180))) * (180 / Math.PI);
    const searchPoints = [
      { lat: latitude, lng: longitude - dLng },
      { lat: latitude, lng: longitude + dLng },
    ];

    for (const point of searchPoints) {
      try {
        const neighbor = await buildAddressRecord(point.lat, point.lng, false);
        if (neighbor && neighbor.streetNumber && neighbor.address !== primaryData.address) {
          allAddresses.push(neighbor);
        }
      } catch {
        // ignore an individual neighbour failure
      }
    }

    const uniqueAddresses = allAddresses.filter((addr, index, self) =>
      index === self.findIndex(a => a.address === addr.address)
    );
    uniqueAddresses.sort((a, b) => parseInt(a.streetNumber || '0', 10) - parseInt(b.streetNumber || '0', 10));
    allAddresses = uniqueAddresses;

    const primaryIdx = allAddresses.findIndex(a => a.isPrimary);
    const resolvedIdx = primaryIdx >= 0 ? primaryIdx : 0;
    const closestAddress = allAddresses[resolvedIdx]?.address ?? primaryData.address;

    return { address: closestAddress, addresses: allAddresses, closestIdx: resolvedIdx };
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
};
