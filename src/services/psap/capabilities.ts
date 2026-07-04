// Bundled, device-local PSAP Text-to-911 capability + local emergency numbers.
// Replaces the former backend Postgres tables (psap_sms_capabilities,
// local_emergency_numbers). Sourced from the FCC Text-to-911 registry seed.
// The app is fully local-device-only: no server lookup is performed.

export interface PsapCapabilityRecord {
  latitude: number;
  longitude: number;
  county: string;
  state: string;
  psapId: string;
  psapName: string;
  smsCapable: boolean;
  confidence: number;
}

export interface LocalEmergencyNumberRecord {
  countryCode: string;
  state?: string | null;
  county?: string | null;
  city?: string | null;
  medicalNumber: string;
  fireNumber: string;
  source: string;
}

export const PSAP_CAPABILITIES: PsapCapabilityRecord[] = [
  { latitude: 40.7128, longitude: -74.006, county: 'New York', state: 'NY', psapId: 'NYC911', psapName: 'New York City 911', smsCapable: true, confidence: 0.95 },
  { latitude: 40.7589, longitude: -73.9851, county: 'New York', state: 'NY', psapId: 'NYC911', psapName: 'New York City 911', smsCapable: true, confidence: 0.95 },
  { latitude: 40.6782, longitude: -73.9442, county: 'Kings', state: 'NY', psapId: 'NYC911', psapName: 'New York City 911', smsCapable: true, confidence: 0.95 },
  { latitude: 40.7282, longitude: -73.7949, county: 'Queens', state: 'NY', psapId: 'NYC911', psapName: 'New York City 911', smsCapable: true, confidence: 0.95 },
  { latitude: 34.0522, longitude: -118.2437, county: 'Los Angeles', state: 'CA', psapId: 'LAPD911', psapName: 'Los Angeles PSAP', smsCapable: true, confidence: 0.95 },
  { latitude: 34.0195, longitude: -118.4912, county: 'Los Angeles', state: 'CA', psapId: 'LAPD911', psapName: 'Los Angeles PSAP', smsCapable: true, confidence: 0.95 },
  { latitude: 34.1478, longitude: -118.1445, county: 'Los Angeles', state: 'CA', psapId: 'LAPD911', psapName: 'Los Angeles PSAP', smsCapable: true, confidence: 0.95 },
  { latitude: 41.8781, longitude: -87.6298, county: 'Cook', state: 'IL', psapId: 'CHI911', psapName: 'Chicago OEMC', smsCapable: true, confidence: 0.95 },
  { latitude: 29.7604, longitude: -95.3698, county: 'Harris', state: 'TX', psapId: 'HOU911', psapName: 'Houston Emergency Communications', smsCapable: true, confidence: 0.9 },
  { latitude: 33.4484, longitude: -112.074, county: 'Maricopa', state: 'AZ', psapId: 'PHX911', psapName: 'Phoenix Regional Dispatch', smsCapable: true, confidence: 0.9 },
  { latitude: 39.9526, longitude: -75.1652, county: 'Philadelphia', state: 'PA', psapId: 'PHL911', psapName: 'Philadelphia 911', smsCapable: true, confidence: 0.95 },
  { latitude: 29.4241, longitude: -98.4936, county: 'Bexar', state: 'TX', psapId: 'SAT911', psapName: 'San Antonio PSAP', smsCapable: true, confidence: 0.85 },
  { latitude: 32.7157, longitude: -117.1611, county: 'San Diego', state: 'CA', psapId: 'SD911', psapName: 'San Diego Regional Communications', smsCapable: true, confidence: 0.9 },
  { latitude: 32.7767, longitude: -96.797, county: 'Dallas', state: 'TX', psapId: 'DAL911', psapName: 'Dallas 911', smsCapable: true, confidence: 0.9 },
  { latitude: 37.3382, longitude: -121.8863, county: 'Santa Clara', state: 'CA', psapId: 'SJ911', psapName: 'San Jose PSAP', smsCapable: true, confidence: 0.9 },
  { latitude: 30.2672, longitude: -97.7431, county: 'Travis', state: 'TX', psapId: 'AUS911', psapName: 'Austin-Travis County ECC', smsCapable: true, confidence: 0.95 },
  { latitude: 47.6062, longitude: -122.3321, county: 'King', state: 'WA', psapId: 'SEA911', psapName: 'Seattle 911', smsCapable: true, confidence: 0.95 },
  { latitude: 39.7392, longitude: -104.9903, county: 'Denver', state: 'CO', psapId: 'DEN911', psapName: 'Denver 911', smsCapable: true, confidence: 0.9 },
  { latitude: 38.9072, longitude: -77.0369, county: 'District of Columbia', state: 'DC', psapId: 'DC911', psapName: 'DC 911 / OUC', smsCapable: true, confidence: 0.95 },
  { latitude: 42.3601, longitude: -71.0589, county: 'Suffolk', state: 'MA', psapId: 'BOS911', psapName: 'Boston Emergency Services', smsCapable: true, confidence: 0.95 },
  { latitude: 25.7617, longitude: -80.1918, county: 'Miami-Dade', state: 'FL', psapId: 'MIA911', psapName: 'Miami-Dade County 911', smsCapable: true, confidence: 0.9 },
  { latitude: 33.749, longitude: -84.388, county: 'Fulton', state: 'GA', psapId: 'ATL911', psapName: 'Atlanta-Fulton E911', smsCapable: true, confidence: 0.85 },
  { latitude: 44.9778, longitude: -93.265, county: 'Hennepin', state: 'MN', psapId: 'MSP911', psapName: 'Minneapolis Emergency Communications', smsCapable: true, confidence: 0.9 },
  { latitude: 45.5152, longitude: -122.6784, county: 'Multnomah', state: 'OR', psapId: 'PDX911', psapName: 'Bureau of Emergency Communications', smsCapable: true, confidence: 0.9 },
  { latitude: 36.1699, longitude: -115.1398, county: 'Clark', state: 'NV', psapId: 'LV911', psapName: 'Las Vegas Metro Police', smsCapable: true, confidence: 0.85 },
  { latitude: 46.8797, longitude: -110.3626, county: 'Fergus', state: 'MT', psapId: 'LEW911', psapName: 'Lewistown PSAP', smsCapable: false, confidence: 0.8 },
  { latitude: 64.8378, longitude: -147.7164, county: 'Fairbanks North Star', state: 'AK', psapId: 'FBK911', psapName: 'Fairbanks North Star Borough', smsCapable: false, confidence: 0.75 },
  { latitude: 42.8666, longitude: -106.3131, county: 'Natrona', state: 'WY', psapId: 'CAS911', psapName: 'Casper PSAP', smsCapable: false, confidence: 0.7 },
];

export const LOCAL_EMERGENCY_NUMBERS: LocalEmergencyNumberRecord[] = [
  { countryCode: 'US', medicalNumber: '911', fireNumber: '911', source: 'default_fallback' },
  { countryCode: 'IL', medicalNumber: '101', fireNumber: '102', source: 'country_registry' },
  { countryCode: 'US', state: 'CA', county: 'Los Angeles', medicalNumber: '911', fireNumber: '911', source: 'county_registry' },
  { countryCode: 'US', state: 'TX', county: 'Travis', medicalNumber: '911', fireNumber: '911', source: 'county_registry' },
  { countryCode: 'US', state: 'FL', county: 'Miami-Dade', medicalNumber: '911', fireNumber: '911', source: 'county_registry' },
];
