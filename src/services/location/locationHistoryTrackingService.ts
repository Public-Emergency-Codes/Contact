import * as Location from 'expo-location';
import { store } from '../../store';
import { setLocation, setError } from '../../store/slices/locationSlice';

let watchSubscription: Location.LocationSubscription | null = null;

const normalizeCoordinate = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

export const startLocationTracking = async () => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      store.dispatch(setError('Location permission not granted'));
      return;
    }

    watchSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
        timeInterval: 5000,
      },
      async (position) => {
        const latitude = normalizeCoordinate(position.coords.latitude);
        const longitude = normalizeCoordinate(position.coords.longitude);

        if (latitude === null || longitude === null) {
          console.warn('Skipping invalid location update', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          return;
        }

        const location = {
          latitude,
          longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude || undefined,
          speed: position.coords.speed || undefined,
          heading: position.coords.heading || undefined,
          timestamp: position.timestamp,
        };

        store.dispatch(setLocation(location));
        // Local-device-only: location is kept in Redux; nothing is sent to any server.
      }
    );
  } catch (error: any) {
    console.error('Location tracking error:', error);
    store.dispatch(setError(error.message));
  }
};

export const stopLocationTracking = () => {
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
  }
};

export const getCurrentLocation = async (): Promise<any> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission not granted');
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const latitude = normalizeCoordinate(position.coords.latitude);
    const longitude = normalizeCoordinate(position.coords.longitude);

    if (latitude === null || longitude === null) {
      throw new Error('Invalid location coordinates');
    }

    return {
      latitude,
      longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude || undefined,
      speed: position.coords.speed || undefined,
      heading: position.coords.heading || undefined,
      timestamp: position.timestamp,
    };
  } catch (error) {
    throw error;
  }
};
