import NetInfo from '@react-native-community/netinfo';
import { NativeModules, PermissionsAndroid, Platform, type Permission } from 'react-native';
import { type EnhancedLocation, type WiFiNetwork } from './locationModels';
import { isMobileHotspot, isValidMac } from './locationMath';

const { WiFiScanner } = NativeModules;

export async function getWiFiNetworks(samples: number = 1): Promise<WiFiNetwork[]> {
  try {
    if (Platform.OS === 'android' && WiFiScanner) {
      try {
        const nearbyPermission = (PermissionsAndroid.PERMISSIONS as any)
          .NEARBY_WIFI_DEVICES as Permission | undefined;

        // Check only — never request. PermissionOnboardingScreen handles requesting on first launch.
        const fineGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        const nearbyGranted =
          Platform.Version >= 33 && nearbyPermission
            ? await PermissionsAndroid.check(nearbyPermission)
            : false;

        if (!fineGranted && !nearbyGranted) {
          console.warn('WiFi scan permissions denied - cannot scan WiFi');
          return [];
        }

        const isWiFiEnabled = await WiFiScanner.isWiFiEnabled();
        if (!isWiFiEnabled) {
          console.log('WiFi is disabled - cannot scan');
          return [];
        }

        const allScans: WiFiNetwork[][] = [];
        console.log(`🔍 Taking ${samples} WiFi scans for averaging...`);

        for (let i = 0; i < samples; i++) {
          const scanResults = await WiFiScanner.scanNetworks();
          if (scanResults && scanResults.length > 0) {
            allScans.push(
              scanResults.map((network: any) => ({
                ssid: network.ssid || 'Unknown',
                bssid: network.bssid || 'Unknown',
                signalStrength: network.signalStrength || -100,
              })),
            );
          }
          if (i < samples - 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 300));
          }
        }

        if (allScans.length === 0) {
          console.log('All WiFi scans returned no results');
          return [];
        }

        const bssidMap = new Map<string, { ssid: string; signals: number[] }>();

        for (const scan of allScans) {
          for (const network of scan) {
            const key = network.bssid.toLowerCase();
            if (!bssidMap.has(key)) {
              bssidMap.set(key, { ssid: network.ssid, signals: [] });
            }
            bssidMap.get(key)!.signals.push(network.signalStrength);
          }
        }

        const networks = Array.from(bssidMap.entries())
          .map(([bssid, data]) => {
            const avgSignal = data.signals.reduce((a, b) => a + b, 0) / data.signals.length;
            return {
              ssid: data.ssid,
              bssid,
              signalStrength: Math.round(avgSignal),
              consistency: data.signals.length,
            };
          })
          .filter((n) => {
            if (n.signalStrength < -85) return false;
            if (isMobileHotspot(n.ssid)) return false;
            return true;
          })
          .sort((a, b) => {
            if (b.signalStrength !== a.signalStrength) {
              return b.signalStrength - a.signalStrength;
            }
            return b.consistency - a.consistency;
          })
          .slice(0, 20)
          .map(({ ssid, bssid, signalStrength }) => ({ ssid, bssid, signalStrength }));

        console.log(`📡 Found ${networks.length} quality WiFi networks (from ${bssidMap.size} total)`);
        return networks;
      } catch (error) {
        console.error('Native WiFi scan failed:', error);
      }
    }

    console.log('Using legacy WiFi detection (connected network only)');
    const netInfo = await NetInfo.fetch();

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );

      if (!granted) {
        return [];
      }

      if (netInfo.type === 'wifi' && netInfo.details) {
        return [
          {
            ssid: (netInfo.details as any).ssid || 'Unknown',
            bssid: (netInfo.details as any).bssid || 'Unknown',
            signalStrength: (netInfo.details as any).strength || -50,
          },
        ];
      }
    }

    return [];
  } catch (error) {
    console.error('WiFi scan failed:', error);
    return [];
  }
}

export async function getWiFiOnlyLocation(
  prefetchedWifiNetworks?: WiFiNetwork[],
): Promise<EnhancedLocation | null> {
  try {
    const geolocateUrl: string | null = null;
    if (!geolocateUrl) {
      console.log('[WiFi] No Google Geolocation API key configured, skipping WiFi positioning');
      return null;
    }
    const wifiNetworks = prefetchedWifiNetworks || (await getWiFiNetworks());
    if (wifiNetworks.length === 0) {
      console.log('No WiFi networks found for WiFi-only positioning');
      return null;
    }

    console.log('[WiFi] Raw networks before filter:', wifiNetworks.map(w => `${w.ssid} | ${w.bssid}`));
    const wifiAccessPoints = wifiNetworks.filter((wifi) => {
      const valid = isValidMac(wifi.bssid);
      if (!valid) console.log(`[WiFi] Filtered out BSSID: "${wifi.bssid}" (ssid: ${wifi.ssid})`);
      return valid;
    }).map((wifi) => {
      let signalStrength = wifi.signalStrength;
      if (typeof signalStrength === 'number') {
        if (signalStrength > 0) {
          signalStrength = Math.round(-100 + Math.min(100, signalStrength) * 0.6);
        }
        signalStrength = Math.max(-100, Math.min(-30, signalStrength));
      } else {
        signalStrength = -70;
      }

      return {
        macAddress: wifi.bssid,
        signalStrength,
        signalToNoiseRatio: 0,
      };
    });

    if (wifiAccessPoints.length === 0) {
      console.log('No valid BSSIDs available for WiFi-only positioning');
      return null;
    }

    const response = await fetch(geolocateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ considerIp: false, wifiAccessPoints }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      // 404 means Google couldn't find the APs in their database — normal outcome, not an error
      if (response.status === 404) {
        console.log('WiFi geolocation: APs not in Google database, skipping');
      } else {
        console.warn('Google Geolocation API error:', response.status, details);
      }
      return null;
    }

    const data = await response.json();

    if (data.location) {
      if (typeof data.accuracy === 'number' && data.accuracy > 50000) {
        console.log(`WiFi geolocation too coarse (${data.accuracy}m) - ignoring`);
        return null;
      }
      return {
        latitude: data.location.lat,
        longitude: data.location.lng,
        accuracy: data.accuracy || 500,
        timestamp: Date.now(),
        method: 'WIFI',
        confidence: data.accuracy < 200 ? 'HIGH' : data.accuracy < 500 ? 'MEDIUM' : 'LOW',
        wifiNetworks,
      };
    }

    return null;
  } catch (error) {
    console.warn('WiFi-only location failed:', error);
    return null;
  }
}
