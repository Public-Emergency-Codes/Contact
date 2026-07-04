import * as Location from 'expo-location';
import locationAccuracyValidator from './locationAccuracyValidator';
import indoorDetectionService, { type IndoorDetectionResult } from './indoorDetectionService';
import { type EnhancedLocation } from './locationModels';

/**
 * Phase I location — cell/network provider (carrier-equivalent).
 *
 * Uses Android's network provider (cell-tower triangulation via the OS) to
 * produce a fix that best matches what a carrier ALI dip returns to a PSAP
 * CAD: the cell-sector location derived from the device radio.
 *
 * Speed varies because Android's network provider returns cached data
 * instantly if the radio was recently active (any app used coarse location),
 * but needs a fresh cell scan (500-2000ms) if the radio was idle.
 */
export async function selectPhaseILocation(
  service: any,
): Promise<EnhancedLocation> {
  try {
    // Network provider — cell-tower triangulation via the OS, same source
    // the carrier ALI uses (cell radio). Fast when the radio is warm,
    // 1-2s when a fresh cell scan is needed.
    if (service.enabledMethods.cell) {
      const cellLoc = await service.getCellOnlyLocation();
      if (cellLoc) {
        service.lastKnownLocation = cellLoc;
        return cellLoc;
      }
    }

    // Fallback to last-known cached position — instant but may be stale.
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (lastKnown) {
      const accuracy = lastKnown.coords.accuracy || 200;
      const result: EnhancedLocation = {
        latitude: lastKnown.coords.latitude,
        longitude: lastKnown.coords.longitude,
        accuracy,
        adjustedAccuracy: accuracy,
        trustScore: 0.5,
        altitude: lastKnown.coords.altitude || undefined,
        altitudeAccuracy: lastKnown.coords.altitudeAccuracy || undefined,
        heading: lastKnown.coords.heading || undefined,
        speed: lastKnown.coords.speed || undefined,
        timestamp: lastKnown.timestamp,
        method: 'CACHED',
        confidence: 'LOW',
      };
      service.lastKnownLocation = result;
      return result;
    }

    throw new Error('Unable to determine location');
  } catch (error) {
    console.error('Phase I location failed:', error);
    throw error;
  }
}

export async function selectBestLocation(service: any): Promise<EnhancedLocation> {
  try {
    await service.ensureAdaptivePolicyLoaded();
    await locationAccuracyValidator.load();

    const rawCellTelemetryPromise = service.enabledMethods.cell
      ? service.getRawCellTelemetry()
      : Promise.resolve(null);
    const cellLocationPromise = service.enabledMethods.cell
      ? service.getCellOnlyLocation()
      : Promise.resolve(null);

    let gpsLocation: EnhancedLocation | null = null;
    let gpsConsistencyMult = 1.0;
    let gpsSpread = 0;
    if (service.enabledMethods.gps) {
      const gpsSamples = await service.getQuickGPSSamples(3);
      if (gpsSamples.length > 0) {
        gpsLocation = gpsSamples.reduce((best: EnhancedLocation, s: EnhancedLocation) =>
          s.accuracy < best.accuracy ? s : best,
        );
        if (gpsSamples.length >= 2) {
          const cc = locationAccuracyValidator.computeConsistencyMultiplier(
            gpsSamples.map((s) => ({
              lat: s.latitude,
              lng: s.longitude,
              reportedAccuracy: s.accuracy,
            })),
          );
          gpsConsistencyMult = cc.multiplier;
          gpsSpread = cc.spread;
        }
      }
    }

    const wantsWiFiAssist = service.enabledMethods.wifi || service.enabledMethods.hybrid;
    let wifiNetworks: Array<{ ssid: string; bssid: string; signalStrength: number }> = [];
    let wifiSummary = { total: 0, validBssids: 0, uniqueBssids: 0 };

    if (wantsWiFiAssist) {
      wifiNetworks = await service.getWiFiNetworks();
      wifiSummary = service.summarizeWiFiNetworks(wifiNetworks);
    }

    const indoorResult: IndoorDetectionResult = indoorDetectionService.detect(
      gpsLocation ? gpsLocation.accuracy : null,
      wifiNetworks,
    );

    let effectiveWifiMinUnique = service.selectionPolicy.wifiMinUniqueBssids;
    let effectiveWifiMinValid = service.selectionPolicy.wifiMinValidBssids;
    if (indoorResult.isIndoor) {
      effectiveWifiMinUnique = Math.min(effectiveWifiMinUnique, 2);
      effectiveWifiMinValid = Math.min(effectiveWifiMinValid, 2);
      console.log(
        '🏠 Indoor mode: relaxed WiFi thresholds to ' +
          `minUnique=${effectiveWifiMinUnique}, minValid=${effectiveWifiMinValid}`,
      );
    }

    let wifiLocation: EnhancedLocation | null = null;
    const wifiQualityOk =
      wifiSummary.uniqueBssids >= effectiveWifiMinUnique &&
      wifiSummary.validBssids >= effectiveWifiMinValid;

    if (service.enabledMethods.wifi && wifiQualityOk) {
      wifiLocation = await service.getWiFiOnlyLocation(wifiNetworks);
    }

    const [rawCellTelemetry, cellLocation] = await Promise.all([
      rawCellTelemetryPromise,
      cellLocationPromise,
    ]);

    const telemetryBase = {
      raw_mcc: rawCellTelemetry?.raw_mcc ?? cellLocation?.raw_mcc ?? null,
      raw_mnc: rawCellTelemetry?.raw_mnc ?? cellLocation?.raw_mnc ?? null,
      raw_lac_tac: rawCellTelemetry?.raw_lac_tac ?? cellLocation?.raw_lac_tac ?? null,
      raw_cid: rawCellTelemetry?.raw_cid ?? cellLocation?.raw_cid ?? null,
      cell_resolved_lat: cellLocation?.latitude ?? null,
      cell_resolved_lon: cellLocation?.longitude ?? null,
    };

    const toWifiResolvedArray = (
      source?: Array<{ bssid: string; signalStrength: number }>,
    ) => (source || []).map((item) => ({ bssid: item.bssid, signalStrength: item.signalStrength }));

    const withTelemetry = (location: EnhancedLocation): EnhancedLocation => ({
      ...location,
      ...telemetryBase,
      wifi_resolved_json_array: toWifiResolvedArray(location.wifiNetworks || wifiLocation?.wifiNetworks),
    });

    const gpsHistMult = locationAccuracyValidator.getHistoricalMultiplier('GPS');
    const wifiHistMult = locationAccuracyValidator.getHistoricalMultiplier('WIFI');

    let gpsTrust = 1.0;
    let wifiTrust = 1.0;
    let gpsAdjusted = gpsLocation?.accuracy || 999;
    let wifiAdjusted = wifiLocation?.accuracy || 999;

    const indoorGpsPenalty = indoorResult.isIndoor ? 1.5 : 1.0;
    const indoorWifiBoost = indoorResult.isIndoor ? 0.75 : 1.0;

    if (gpsLocation && wifiLocation) {
      const cv = locationAccuracyValidator.crossValidate(
        {
          lat: gpsLocation.latitude,
          lng: gpsLocation.longitude,
          reportedAccuracy: gpsLocation.accuracy,
          method: 'GPS',
        },
        {
          lat: wifiLocation.latitude,
          lng: wifiLocation.longitude,
          reportedAccuracy: wifiLocation.accuracy,
          method: 'WIFI',
        },
      );
      console.log(
        `🔍 Cross-validation: separation=${cv.separation.toFixed(1)}m, ` +
          `gpsTrust=${cv.trustA.toFixed(2)}, wifiTrust=${cv.trustB.toFixed(2)}`,
      );

      const gpsAdj = locationAccuracyValidator.adjustAccuracy(
        gpsLocation.accuracy,
        'GPS',
        gpsConsistencyMult,
        cv.trustA,
      );
      const wifiAdj = locationAccuracyValidator.adjustAccuracy(
        wifiLocation.accuracy,
        'WIFI',
        1.0,
        cv.trustB,
      );
      gpsAdjusted = gpsAdj.adjustedAccuracy * indoorGpsPenalty;
      wifiAdjusted = wifiAdj.adjustedAccuracy * indoorWifiBoost;
      gpsTrust = gpsAdj.trustScore * (1 / indoorGpsPenalty);
      wifiTrust = Math.min(1, wifiAdj.trustScore * (1 / indoorWifiBoost));

      console.log(
        `📊 GPS: reported=${gpsLocation.accuracy.toFixed(1)}m → adjusted=${gpsAdjusted.toFixed(1)}m ` +
          `(trust=${gpsTrust.toFixed(2)}, scatter=${gpsSpread.toFixed(1)}m, hist=${gpsHistMult.toFixed(2)}x` +
          `${indoorResult.isIndoor ? ', indoor-penalised' : ''})`,
      );
      console.log(
        `📊 WiFi: reported=${wifiLocation.accuracy.toFixed(1)}m → adjusted=${wifiAdjusted.toFixed(1)}m ` +
          `(trust=${wifiTrust.toFixed(2)}, hist=${wifiHistMult.toFixed(2)}x` +
          `${indoorResult.isIndoor ? ', indoor-boosted' : ''})`,
      );

      const distance = service.calculateDistance(
        gpsLocation.latitude,
        gpsLocation.longitude,
        wifiLocation.latitude,
        wifiLocation.longitude,
      );
      const divergenceThreshold = Math.max(
        service.selectionPolicy.minDivergenceFloorM,
        service.selectionPolicy.maxDivergenceMultiplier * Math.max(gpsAdjusted, wifiAdjusted),
      );

      if (distance > divergenceThreshold) {
        if (wifiAdjusted < gpsAdjusted || indoorResult.isIndoor) {
          service.lastKnownLocation = withTelemetry({
            ...wifiLocation,
            adjustedAccuracy: wifiAdjusted,
            trustScore: wifiTrust,
            method: service.enabledMethods.gps ? 'HYBRID' : 'WIFI',
            confidence: service.calculateConfidence(wifiAdjusted, wifiNetworks.length),
            wifiNetworks: wifiNetworks.length > 0 ? wifiNetworks : wifiLocation.wifiNetworks,
            isIndoor: indoorResult.isIndoor,
          });
          return service.lastKnownLocation;
        }
        service.lastKnownLocation = withTelemetry({
          ...gpsLocation,
          adjustedAccuracy: gpsAdjusted,
          trustScore: gpsTrust,
          method: wifiNetworks.length > 0 ? 'HYBRID' : gpsLocation.method,
          confidence: service.calculateConfidence(gpsAdjusted, wifiNetworks.length),
          wifiNetworks: wifiNetworks.length > 0 ? wifiNetworks : undefined,
          isIndoor: indoorResult.isIndoor,
        });
        return service.lastKnownLocation;
      }

      const gpsWeight = (gpsTrust * gpsTrust) / (gpsAdjusted * gpsAdjusted);
      const wifiWeight = (wifiTrust * wifiTrust) / (wifiAdjusted * wifiAdjusted);
      const totalWeight = gpsWeight + wifiWeight;

      const fusedLat = (gpsLocation.latitude * gpsWeight + wifiLocation.latitude * wifiWeight) / totalWeight;
      const fusedLng =
        (gpsLocation.longitude * gpsWeight + wifiLocation.longitude * wifiWeight) / totalWeight;
      const fusedAccuracy = Math.sqrt(1 / totalWeight);
      const fusedTrust = (gpsTrust * gpsWeight + wifiTrust * wifiWeight) / totalWeight;

      console.log(
        `🔀 Fused: GPS(adj=${gpsAdjusted.toFixed(1)}m,t=${gpsTrust.toFixed(2)}) + ` +
          `WiFi(adj=${wifiAdjusted.toFixed(1)}m,t=${wifiTrust.toFixed(2)}) = ${fusedAccuracy.toFixed(1)}m`,
      );

      service.lastKnownLocation = withTelemetry({
        latitude: fusedLat,
        longitude: fusedLng,
        accuracy: fusedAccuracy,
        adjustedAccuracy: fusedAccuracy,
        trustScore: fusedTrust,
        altitude: gpsLocation.altitude,
        altitudeAccuracy: gpsLocation.altitudeAccuracy,
        heading: gpsLocation.heading,
        speed: gpsLocation.speed,
        timestamp: Date.now(),
        method: 'HYBRID',
        confidence: service.calculateConfidence(fusedAccuracy, wifiNetworks.length),
        wifiNetworks,
        isIndoor: indoorResult.isIndoor,
      });
      return service.lastKnownLocation;
    }

    if (gpsLocation) {
      const adj = locationAccuracyValidator.adjustAccuracy(gpsLocation.accuracy, 'GPS', gpsConsistencyMult);
      service.lastKnownLocation = withTelemetry({
        ...gpsLocation,
        adjustedAccuracy: adj.adjustedAccuracy * indoorGpsPenalty,
        trustScore: adj.trustScore * (1 / indoorGpsPenalty),
        isIndoor: indoorResult.isIndoor,
      });
      return service.lastKnownLocation;
    }

    if (wifiLocation) {
      const adj = locationAccuracyValidator.adjustAccuracy(wifiLocation.accuracy, 'WIFI', 1.0);
      service.lastKnownLocation = withTelemetry({
        ...wifiLocation,
        adjustedAccuracy: adj.adjustedAccuracy * indoorWifiBoost,
        trustScore: Math.min(1, adj.trustScore * (1 / indoorWifiBoost)),
        isIndoor: indoorResult.isIndoor,
      });
      return service.lastKnownLocation;
    }

    if (service.enabledMethods.hybrid && service.enabledMethods.gps) {
      const lightweightHybrid = await service.getHybridLocation();
      if (lightweightHybrid) {
        service.lastKnownLocation = lightweightHybrid;
        return lightweightHybrid;
      }
    }

    if (cellLocation) {
      service.lastKnownLocation = withTelemetry(cellLocation);
      return service.lastKnownLocation;
    }

    if (service.lastKnownLocation) {
      return withTelemetry({
        ...service.lastKnownLocation,
        method: 'CACHED',
        confidence: 'LOW',
        trustScore: 0.1,
      });
    }

    const expoLastKnown = await Location.getLastKnownPositionAsync();
    if (expoLastKnown) {
      const accuracy = expoLastKnown.coords.accuracy || 200;
      const fallback: EnhancedLocation = withTelemetry({
        latitude: expoLastKnown.coords.latitude,
        longitude: expoLastKnown.coords.longitude,
        accuracy,
        adjustedAccuracy: accuracy,
        trustScore: 0.1,
        altitude: expoLastKnown.coords.altitude || undefined,
        altitudeAccuracy: expoLastKnown.coords.altitudeAccuracy || undefined,
        heading: expoLastKnown.coords.heading || undefined,
        speed: expoLastKnown.coords.speed || undefined,
        timestamp: expoLastKnown.timestamp,
        method: 'CACHED',
        confidence: 'LOW',
      });
      service.lastKnownLocation = fallback;
      return fallback;
    }

    throw new Error('Unable to determine location - all methods failed');
  } catch (error) {
    console.error('Enhanced location failed:', error);
    throw error;
  }
}
