import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

const NativeLocation = NativeModules.FossLocation;
const emitter = NativeLocation ? new NativeEventEmitter(NativeLocation) : null;

export enum Accuracy { Lowest = 1, Low = 2, Balanced = 3, High = 4, Highest = 5, BestForNavigation = 6 }

export interface LocationObjectCoords {
  latitude: number; longitude: number; altitude: number | null; accuracy: number | null;
  altitudeAccuracy: number | null; heading: number | null; speed: number | null;
}
export interface LocationObject { coords: LocationObjectCoords; timestamp: number; mocked?: boolean }
export interface LocationGeocodedAddress {
  name?: string | null; street?: string | null; streetNumber?: string | null;
  district?: string | null; city?: string | null; subregion?: string | null;
  region?: string | null; postalCode?: string | null; country?: string | null;
  isoCountryCode?: string | null;
}
export interface LocationSubscription { remove(): void }

const requireNative = () => {
  if (!NativeLocation) throw new Error('FLOSS location module is unavailable. Rebuild the Android app.');
  return NativeLocation;
};

export async function getForegroundPermissionsAsync(): Promise<{ status: 'granted' | 'denied' }> {
  if (Platform.OS !== 'android') return { status: 'denied' };
  const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return { status: granted ? 'granted' : 'denied' };
}
export async function getCurrentPositionAsync(options: Record<string, unknown> = {}): Promise<LocationObject> {
  return requireNative().getCurrentPosition(options);
}
export async function getLastKnownPositionAsync(options: Record<string, unknown> = {}): Promise<LocationObject | null> {
  return requireNative().getLastKnownPosition(options);
}
export async function watchPositionAsync(
  options: { timeInterval?: number; distanceInterval?: number; accuracy?: Accuracy },
  callback: (location: LocationObject) => void,
): Promise<LocationSubscription> {
  const subscription = emitter?.addListener('fossLocationChanged', callback);
  await requireNative().startWatching(options);
  return { remove: () => { subscription?.remove(); requireNative().stopWatching(); } };
}
export async function reverseGeocodeAsync(coordinate: { latitude: number; longitude: number }): Promise<LocationGeocodedAddress[]> {
  return requireNative().reverseGeocode(coordinate.latitude, coordinate.longitude);
}
export async function geocodeAsync(address: string): Promise<Array<{ latitude: number; longitude: number; altitude?: number | null; accuracy?: number | null }>> {
  return requireNative().geocode(address);
}
