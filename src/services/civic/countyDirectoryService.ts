import * as Location from 'expo-location';
import countyDirectory from '../../data/civic/countyDirectory.json';

export type CountyDirectoryEntry = {
  county: string;
  state: string;
  phone: string;
  has_311: boolean;
};

export type Local311Equivalent = {
  county: string;
  state: string;
  phone: string | null;
  has311: boolean;
};

const isAvailablePhone = (value: string | null | undefined): value is string => {
  const normalized = value?.trim().toLowerCase();
  return !!normalized && normalized !== 'not available';
};

const STATE_ABBREVIATIONS: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming',
};

const normalizeState = (value: string): string => {
  const trimmed = value.trim();
  return STATE_ABBREVIATIONS[trimmed.toUpperCase()] || trimmed;
};

const normalizeCounty = (value: string): string => value
  .toLowerCase()
  .replace(/\b(city and borough|census area|county|parish|borough|municipality)\b/g, '')
  .replace(/[^a-z0-9]/g, '');

export function findCountyDirectoryEntry(
  county: string | null | undefined,
  state: string | null | undefined,
): CountyDirectoryEntry | null {
  if (!county || !state) return null;
  const targetCounty = normalizeCounty(county);
  const targetState = normalizeState(state).toLowerCase();

  return (countyDirectory as CountyDirectoryEntry[]).find((entry) =>
    entry.state.toLowerCase() === targetState &&
    normalizeCounty(entry.county) === targetCounty,
  ) || null;
}

export async function resolveLocal311Equivalent(
  latitude: number,
  longitude: number,
): Promise<Local311Equivalent | null> {
  const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
  const address = addresses?.[0];
  if (!address) return null;

  const entry = findCountyDirectoryEntry(
    address.subregion,
    address.region,
  );
  if (!entry) return null;

  return {
    county: entry.county,
    state: entry.state,
    phone: isAvailablePhone(entry.phone) ? entry.phone.trim() : null,
    has311: entry.has_311,
  };
}
