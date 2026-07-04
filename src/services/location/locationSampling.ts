import locationAccuracyValidator from './locationAccuracyValidator';
import { rejectOutliers } from './locationMath';
import { type EnhancedLocation } from './locationModels';

export async function collectQuickGpsSamples(service: any, count: number): Promise<EnhancedLocation[]> {
  const samples: EnhancedLocation[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const loc = await service.getGPSLocation();
      if (loc) samples.push(loc);
      if (i < count - 1) {
        await new Promise<void>((r) => setTimeout(r, 400));
      }
    } catch {
      // skip failed sample
    }
  }
  return samples;
}

export async function recordPinCorrection(
  method: string,
  reportedAccuracy: number,
  actualErrorM: number,
): Promise<void> {
  await locationAccuracyValidator.recordCorrection(method, reportedAccuracy, actualErrorM);
}

export async function getAveragedLocation(service: any, samples?: number): Promise<EnhancedLocation> {
  const numSamples = samples || service.sampleCount;
  const locations: EnhancedLocation[] = [];

  console.log(`Taking ${numSamples} location samples for averaging...`);

  for (let i = 0; i < numSamples; i++) {
    try {
      const loc = await service.getBestLocation();
      locations.push(loc);
      console.log(`Sample ${i + 1}/${numSamples}: accuracy ±${loc.accuracy.toFixed(1)}m`);
      if (i < numSamples - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.warn(`Sample ${i + 1} failed:`, error);
    }
  }

  if (locations.length === 0) {
    throw new Error('No location samples obtained');
  }

  const { filtered, rejected, spread } = rejectOutliers(locations);

  let totalWeight = 0;
  let avgLat = 0;
  let avgLon = 0;
  let bestAccuracy = Infinity;

  filtered.forEach((loc) => {
    const weight = 1 / (loc.accuracy * loc.accuracy);
    totalWeight += weight;
    avgLat += loc.latitude * weight;
    avgLon += loc.longitude * weight;
    bestAccuracy = Math.min(bestAccuracy, loc.accuracy);
  });

  avgLat /= totalWeight;
  avgLon /= totalWeight;

  console.log(
    `✅ Final position: ${filtered.length} samples, ±${bestAccuracy.toFixed(1)}m, spread: ${spread.toFixed(1)}m`,
  );

  return {
    latitude: avgLat,
    longitude: avgLon,
    accuracy: bestAccuracy,
    timestamp: Date.now(),
    method: filtered[0].method,
    confidence: service.calculateConfidence(bestAccuracy, filtered[0].wifiNetworks?.length || 0),
    wifiNetworks: filtered[0].wifiNetworks,
    samplesUsed: filtered.length,
    samplesRejected: rejected,
    sampleSpread: spread,
  };
}
