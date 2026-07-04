import { type EnhancedLocation, type KalmanState } from './locationModels';
import { calculateConfidence } from './locationMath';
import nativeFusedLocationService from './nativeFusedLocationService';

export function applyKalmanFilter(
  kalmanState: KalmanState | null,
  lat: number,
  lng: number,
  accuracy: number,
): { nextState: KalmanState; lat: number; lng: number } {
  const minAccuracy = 1;
  const accuranceMeters = Math.max(accuracy, minAccuracy);
  const Q = 0.00001;

  if (!kalmanState) {
    const nextState = {
      lat,
      lng,
      variance: accuranceMeters * accuranceMeters,
    };
    return { nextState, lat, lng };
  }

  const prediction = {
    lat: kalmanState.lat,
    lng: kalmanState.lng,
    variance: kalmanState.variance + Q,
  };

  const K = prediction.variance / (prediction.variance + accuranceMeters * accuranceMeters);

  const nextState = {
    lat: prediction.lat + K * (lat - prediction.lat),
    lng: prediction.lng + K * (lng - prediction.lng),
    variance: (1 - K) * prediction.variance,
  };

  return {
    nextState,
    lat: nextState.lat,
    lng: nextState.lng,
  };
}

export async function getGPSLocation(args: {
  kalmanState: KalmanState | null;
  setKalmanState: (state: KalmanState | null) => void;
}): Promise<EnhancedLocation | null> {
  try {
    const location = await nativeFusedLocationService.getCurrentPosition(1000);
    if (!location) {
      return null;
    }

    const accuracy = location.accuracy || 100;
    const filtered = applyKalmanFilter(
      args.kalmanState,
      location.latitude,
      location.longitude,
      accuracy,
    );
    args.setKalmanState(filtered.nextState);

    return {
      latitude: filtered.lat,
      longitude: filtered.lng,
      accuracy,
      altitude: undefined,
      altitudeAccuracy: undefined,
      heading: undefined,
      speed: undefined,
      timestamp: location.timestamp,
      method: 'GPS',
      confidence: calculateConfidence(accuracy, 0),
    };
  } catch (error) {
    console.error('GPS location failed:', error);
    return null;
  }
}
