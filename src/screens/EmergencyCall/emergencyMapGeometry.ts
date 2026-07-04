export const toStreetAddress = (fullAddress: string) => {
  if (!fullAddress) return '';
  const parts = fullAddress.split(',').map(p => p.trim());
  if (parts.length === 0) return '';

  // If first part is a pure house/apartment number and second part is a street name (like in OpenStreetMap/Nominatim representation)
  // e.g., "257, East 4th Street, Canton..." -> "257 East 4th Street"
  if (parts.length > 1 && /^\d+[\w-/]*$/.test(parts[0])) {
    const maybeStreet = parts[1];
    if (!/township|county|country/i.test(maybeStreet)) {
      return `${parts[0]} ${maybeStreet}`;
    }
  }

  // Otherwise, return first part if it doesn't contain undesired keywords
  const first = parts[0];
  if (/township|county/i.test(first)) {
    const cleanPart = parts.find(p => !/township|county|country/i.test(p));
    return cleanPart || '';
  }
  return first;
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLam = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) * Math.sin(dLam / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const calculateHeading = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lam1 = (lon1 * Math.PI) / 180;
  const lam2 = (lon2 * Math.PI) / 180;
  const y = Math.sin(lam2 - lam1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lam2 - lam1);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
};

export const latLngToPixel = (lat: number, lng: number, centerLat: number, centerLng: number, zoom: number) => {
  const scale = (256 * Math.pow(2, zoom)) / 360;
  const x = 300 + (lng - centerLng) * scale * Math.cos(centerLat * Math.PI / 180);
  const y = 300 - (lat - centerLat) * scale;
  return { x, y };
};

export const calculateZoomLevel = (radiusMeters: number, lat: number, mapSize = 600) => {
  const paddingFactor = 1.1;
  const diameterMeters = radiusMeters * 2 * paddingFactor;
  const metersPerPixelAtZoom0 = 156543.03392 * Math.cos(lat * Math.PI / 180);
  const zoom = Math.log2(metersPerPixelAtZoom0 * mapSize / diameterMeters);
  return Math.max(1, Math.min(20, Math.floor(zoom)));
};

export const generateCirclePoints = (lat: number, lng: number, radiusMeters: number, numPoints = 32) => {
  const points: string[] = [];
  const earthRadius = 6371000;
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    const deltaLat = dy / earthRadius;
    const deltaLng = dx / (earthRadius * Math.cos(lat * Math.PI / 180));
    const newLat = lat + (deltaLat * 180 / Math.PI);
    const newLng = lng + (deltaLng * 180 / Math.PI);
    points.push(`${newLat.toFixed(6)},${newLng.toFixed(6)}`);
  }
  return points.join('|');
};
