import { useRef, useCallback } from 'react';
import type { EmergencyMessageStateSetter } from './emergencyCallMessageTypes';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import emergencyLocationService from '../../services/location/emergencyLocationService';
import { localContacts } from '../../services/localContactsService';
import emergencyMessagingService from '../../services/emergencyMessagingService';
import psapMessagingService from '../../services/psap/psapMessagingService';
import { buildContactSmsInfo, findMatchingAddress } from '../../services/savedAddressService';
import { EMERGENCY_TEST_NUMBER } from '../../services/runtimeConfig';
import type { PendingAttachment } from '../../hooks/useAttachmentPicker';
import {
  isDirectSmsAvailable,
  sendDirectMmsAttachments,
} from '../../services/directSmsMediaService';
import {
  buildBaseMapUrl,
  buildLocationPreviewImageUrl,
  calculateZoomLevel,
} from './emergencyMap';
import { reverseGeocode } from './reverseGeocode';
import { getProfilePhotoStorageKey, CALL_INIT_SELFIE_ENABLED_KEY, getProfileMedicalInfoStorageKey, LOCAL_PROFILE_KEY, PROFILE_MEDICAL_INFO_KEY, PROFILE_PHOTO_KEY } from '../../constants/profileMedical';
import AsyncStorage from '@react-native-async-storage/async-storage';
let IntentLauncher: any = null;
try { IntentLauncher = require('expo-intent-launcher'); } catch (_) {}

import { useEmergencyMessagingActions } from './useEmergencyMessagingActions';
import { buildLocalProfileMessage } from './emergencyProfileMessage';

export interface UseEmergencyCallActionsParams {
  user: any; languageCode: string; userLangCode: string | null;
  detectedLocation: any; mapPin: any; mapZoom: number; mapViewRatio: number; mapSectionHeight: number;
  mapType: string; showStreetNames: boolean; showBusinessNames: boolean;
  pinFullAddress: string; locationReplyText: string; volumeState: any;
  showLocationConfirm: boolean;
  streetViewPosition?: any; lastPanoId?: React.MutableRefObject<string | null>; loading?: boolean;
  psapSmsCapable: any; silentModeActive: boolean; isLocationTextRef: React.MutableRefObject<boolean>;
  lastScannedLocationRef: React.MutableRefObject<any>;
  identityPhotosSentRef: React.MutableRefObject<boolean>;
  identityImagesRef: React.MutableRefObject<string[]>;
  identityPsapNoticeSentRef: React.MutableRefObject<boolean>;
  localProfileSentRef: React.MutableRefObject<boolean>;
  activeE911EventId: string | null; activeEmergencyEventId: string | null;
  exactMatchAddress: any;
  nearbyAddress?: any;
  webViewRef: React.RefObject<any>; skipRecenterUntil: React.MutableRefObject<number>;
  cameraRef: React.RefObject<any>; cameraReadyRef: React.MutableRefObject<boolean>;
  sendPsapMessage: (m: string, lat?: number, lng?: number) => Promise<boolean>;
  scrollToBottom: (d?: number) => void;
  captureCallStartSelfie: () => Promise<string | null>;
  setLoading: (v: boolean) => void; setDetectedLocation: (v: any) => void;
  setDetectedAddress: (v: any) => void; setDetectedAddresses: (v: any[]) => void;
  setCurrentAddressIndex: (v: number) => void; setInitialAddressIndex: (v: number) => void;
  setStreetViewUrl: (v: string | null) => void; setSvHtml: (v: string | null) => void;
  setShowLocationConfirm: (v: boolean) => void; setChatMessages: EmergencyMessageStateSetter;
  setAddressSearchText: (v: string) => void; setInsideOutside: (v: 'inside' | 'outside') => void;
  setCallResult: (v: any) => void; setSentUpdateBubble: (v: any) => void;
  setShowQuickResponses: (v: boolean) => void; setLocationReplyText: (v: string) => void;
  setMapExpanded: (v: boolean) => void; setActiveE911EventId: (v: string | null) => void;
  setCheckingPsap: (v: boolean) => void; setPsapSmsCapable: (v: any) => void;
  setMapPin: (v: any) => void; setMapCenter: (v: any) => void; setMapZoom: (v: number) => void;
  setBaseMapUrl: (v: string | null) => void; setConeHeading: (v: number) => void;
  setAddressSearching: (v: boolean) => void; setMapModified: (v: boolean) => void;
  setPinnedIdentityImages: (v: any[]) => void; setUserJustEnabledCamera: (v: boolean) => void;
  setEmergencyTypeSelection: (v: string | null) => void;
  setEmergencyTypeSendFailed: (v: boolean) => void; videoBubblePushedRef: React.MutableRefObject<boolean>;
  emergencyTypeRetryRef: React.MutableRefObject<any>;
  stopCameraRecording: () => void;
  nativeIncident?: any;
  nativeIncidentConsumedRef?: React.MutableRefObject<boolean>;
  pendingAttachments?: PendingAttachment[];
  clearAttachments?: () => void;
  psapNumber?: string;
}

export const useEmergencyCallActions = (params: UseEmergencyCallActionsParams) => {
  const resolveDirectSmsTarget = useCallback(async () => {
    if (__DEV__) {
      try {
        const override = await AsyncStorage.getItem('dev_emergency_override_number');
        if (override?.trim()) return override.trim();
      } catch (_) {}
    }
    return (params.psapNumber || EMERGENCY_TEST_NUMBER).trim();
  }, [params.psapNumber]);

  const getEffectiveMapType = useCallback(() => (params.mapType === 'satellite' ? (params.showStreetNames || params.showBusinessNames ? 'hybrid' : 'satellite') : 'roadmap'), [params.mapType, params.showStreetNames, params.showBusinessNames]);
  const getMapStyleParams = useCallback(() => {
    let s = '';
    if (!params.showStreetNames) s += '&style=feature:road|element:labels|visibility:off';
    if (!params.showBusinessNames) { s += '&style=feature:poi|element:labels|visibility:off'; s += '&style=feature:poi.business|visibility:off'; }
    return s;
  }, [params.showStreetNames, params.showBusinessNames]);
  const buildMapUrl = useCallback(
    (lat: number, lng: number, zoom: number, _hideCircle = false) =>
      buildBaseMapUrl(lat, lng, zoom, getEffectiveMapType(), getMapStyleParams()),
    [getEffectiveMapType, getMapStyleParams],
  );

  const detectIndoorOutdoor = useCallback(async (_lat: number, _lng: number, gpsAccuracy: number | null = null, geocodeResults: any[] | null = null) => {
    const buildingTypes = ['premise','establishment','point_of_interest','airport','shopping_mall','hospital','university','school','stadium','museum','library','place_of_worship','subway_station','train_station'];
    const outdoorTypes = ['route','street_address','intersection','natural_feature','park','parking','neighborhood','political','administrative_area_level_1','administrative_area_level_2','administrative_area_level_3','country','postal_code','postal_code_suffix','locality','sublocality','sublocality_level_1'];
    if (geocodeResults?.length) {
      const allTypes: string[] = geocodeResults.flatMap((r: any) => r.types as string[]);
      if (buildingTypes.some(t => allTypes.includes(t))) { params.setInsideOutside('inside'); return; }
      if (allTypes.every(t => outdoorTypes.includes(t))) { params.setInsideOutside('outside'); return; }
    }
    if (gpsAccuracy !== null) params.setInsideOutside(gpsAccuracy > 20 ? 'inside' : 'outside');
  }, [params.setInsideOutside]);

  const searchAddress = useCallback(async (query: string) => {
    if (!query.trim()) return;
    params.setAddressSearching(true);
    try {
      // Forward geocode via the Android OS Geocoder (expo-location) — no Google
      // Geocoding API call leaves the app, so nothing to disclose to the store.
      const results = await Location.geocodeAsync(query.trim());
      if (results?.length) {
        const { latitude: lat, longitude: lng } = results[0];
        params.setAddressSearchText(query.trim()); params.setMapPin({ lat, lng }); params.setMapCenter({ lat, lng }); params.setBaseMapUrl(buildMapUrl(lat, lng, params.mapZoom)); params.setMapModified(true); params.skipRecenterUntil.current = 0;
        detectIndoorOutdoor(lat, lng, null);
        if (params.webViewRef.current) { params.webViewRef.current.injectJavaScript(`if(window.pano){targetLat=${lat};targetLng=${lng};searchLat=${lat};searchLng=${lng};autoWalkDone=false;autoWalkPhase=1;(function(){var _svs=new google.maps.StreetViewService();_svs.getPanorama({location:{lat:${lat},lng:${lng}},radius:50,source:google.maps.StreetViewSource.OUTDOOR,preference:google.maps.StreetViewPreference.NEAREST},function(data,status){if(status==='OK'&&data&&data.location){window.pano.setPano(data.location.pano);}else{window.pano.setPosition({lat:${lat},lng:${lng}});} });}()); }true;`); }
      }
    } catch (_) {}
    params.setAddressSearching(false);
  }, [buildMapUrl, detectIndoorOutdoor, params]);

  const prepareCallStartIdentityPhotos = useCallback(async (): Promise<string[]> => {
    if (params.identityPhotosSentRef.current) return params.identityImagesRef.current;
    params.identityPhotosSentRef.current = true;
    try {
      const [selfieSetting, scopedPhotoRaw, legacyPhotoRaw, localRaw] = await Promise.all([
        AsyncStorage.getItem(CALL_INIT_SELFIE_ENABLED_KEY),
        AsyncStorage.getItem(getProfilePhotoStorageKey()),
        AsyncStorage.getItem(PROFILE_PHOTO_KEY),
        AsyncStorage.getItem(LOCAL_PROFILE_KEY),
      ]);
      let profilePhoto = String(scopedPhotoRaw || legacyPhotoRaw || '').trim();
      if (!profilePhoto && localRaw) {
        try {
          const local = JSON.parse(localRaw);
          profilePhoto = String(local?.photoUri || '').trim();
        } catch {}
      }
      if (!profilePhoto) {
        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const photoKeys = allKeys.filter((k) => k.startsWith('@profile_photo_uri:'));
          if (photoKeys.length > 0) {
            const pairs = await AsyncStorage.multiGet(photoKeys);
            const firstPhoto = pairs.map(([, v]) => String(v || '').trim()).find(Boolean);
            if (firstPhoto) profilePhoto = firstPhoto;
          }
        } catch {}
      }
      const liveSelfie = selfieSetting === 'true' ? await params.captureCallStartSelfie() : null;
      const imgs = Array.from(new Set([liveSelfie, profilePhoto].filter(Boolean) as string[]));
      params.identityImagesRef.current = imgs;
      if (imgs.length > 0) params.setPinnedIdentityImages(imgs.map(uri => ({ uri, caption: uri === liveSelfie ? "Here's a new selfie to help identify me." : "Here's my profile picture to help identify me." })));
      return imgs;
    } catch { params.identityImagesRef.current = []; return []; }
  }, [params]);

  const openLocationNavigator = useCallback(() => params.setMapExpanded(true), [params.setMapExpanded]);
  const scrollToBottom = params.scrollToBottom;
  const locationDetectionRunningRef = useRef(false);

  const runLocationDetection = useCallback(async () => {
    // Guard against re-entrant calls (e.g. onOutgoingSmsDetected firing while we
    // are still in the middle of the first run — stale closure makes detectedLocation
    // appear null even though we already started detection).
    if (locationDetectionRunningRef.current) return;
    locationDetectionRunningRef.current = true;
    try {
      // In dev mode, auto-dial the override number then bounce back to the app
      if (false && __DEV__ && IntentLauncher) {
        try {
          const override = await AsyncStorage.getItem('dev_emergency_override_number');
          if (override) {
            console.log('[DEV] Auto-dialing override number:', override);
            // Fire call without awaiting (await blocks until call ends)
            IntentLauncher.startActivityAsync('android.intent.action.CALL', { data: `tel:${override}` }).catch((e: any) => console.warn('[DEV] CALL intent error:', e));
            // Call bringToFront immediately — Kotlin schedules startActivity 3s later
            // via Handler.postDelayed on Android's main thread, which fires reliably
            // even when the JS thread is backgrounded/throttled.
            const { NativeModules: NM } = require('react-native');
            NM.E911DetectorModule?.bringToFront?.()
              ?.catch?.((e: any) => console.warn('[DEV] bringToFront rejected (no overlay perm?):', e));
          }
        } catch (_) {}
      }
      const identityPhotosPromise = prepareCallStartIdentityPhotos();
      params.setLoading(true); params.setCallResult(null); params.setDetectedAddress(null); params.setStreetViewUrl(null); params.setDetectedLocation(null);
      emergencyLocationService.clearCache();
      const nativeIncident = params.nativeIncidentConsumedRef?.current ? null : params.nativeIncident;
      if (params.nativeIncidentConsumedRef && nativeIncident) {
        params.nativeIncidentConsumedRef.current = true;
      }
      const resolved = nativeIncident?.Resolved_Enhanced_Location;
      let loc = resolved?.latitude && resolved?.longitude
        ? resolved
        : nativeIncident?.Fused_Location_Coordinates?.latitude && nativeIncident?.Fused_Location_Coordinates?.longitude
        ? {
            latitude: Number(nativeIncident.Fused_Location_Coordinates.latitude),
            longitude: Number(nativeIncident.Fused_Location_Coordinates.longitude),
            accuracy: Number(nativeIncident.Fused_Location_Coordinates.accuracy || 50),
            timestamp: Number(nativeIncident.Incident_Timestamp || Date.now()),
            method: 'HYBRID' as const,
            confidence: 'MEDIUM' as const,
            raw_mcc: nativeIncident?.Raw_Cell_Identifiers?.raw_mcc ?? null,
            raw_mnc: nativeIncident?.Raw_Cell_Identifiers?.raw_mnc ?? null,
            raw_lac_tac: nativeIncident?.Raw_Cell_Identifiers?.raw_lac_tac ?? null,
            raw_cid: nativeIncident?.Raw_Cell_Identifiers?.raw_cid ?? null,
            cell_resolved_lat: nativeIncident?.Cell_Tower_Coordinates?.latitude ?? null,
            cell_resolved_lon: nativeIncident?.Cell_Tower_Coordinates?.longitude ?? null,
            wifi_resolved_json_array: Array.isArray(nativeIncident?.WiFi_Access_Points)
              ? nativeIncident.WiFi_Access_Points.map((ap: any) => ({
                  bssid: String(ap?.bssid || ''),
                  signalStrength: Number(ap?.signalStrength || -100),
                })).filter((ap: any) => ap.bssid.length > 0)
              : [],
          }
        // Phase I location (cell/network provider) — matches what the carrier
        // ALI sends to every PSAP CAD on a wireless 911 call. Returns immediately
        // without waiting for GPS cold-start.
        : await emergencyLocationService.getPhaseILocation();

      // Phase I location is always cell/network-provider based. The cell-resolved
      // coordinate is the primary position — this is the carrier-equivalent ALI
      // position that every PSAP CAD receives on a wireless 911 call.
      const useCellFix = typeof loc.cell_resolved_lat === 'number' && typeof loc.cell_resolved_lon === 'number';
      if (useCellFix) {
        loc = {
          ...loc,
          latitude: loc.cell_resolved_lat as number,
          longitude: loc.cell_resolved_lon as number,
          method: 'CELL' as const,
        };
      }

      // Show the map card instantly with coordinates — don't wait for reverse
      // geocode. The address fills in when the OS geocoder responds.
      params.setDetectedLocation(loc);
      const zoomLevel = calculateZoomLevel(loc.accuracy, loc.latitude);
      params.setMapCenter({ lat: loc.latitude, lng: loc.longitude });
      params.setBaseMapUrl(buildBaseMapUrl(loc.latitude, loc.longitude, zoomLevel, getEffectiveMapType(), '&style=element:labels.icon|visibility:off'));
      params.setStreetViewUrl(buildLocationPreviewImageUrl(loc.latitude, loc.longitude));
      params.setLoading(false);
      params.setShowLocationConfirm(true);

      // Reverse geocode and send automated SMS in background — the card is
      // already visible so these don't block the user experience.
      (async () => {
        const geoResult = await reverseGeocode(loc.latitude, loc.longitude);
        const address = geoResult?.address || null;
        const addrsArray = geoResult?.addresses || [];
        params.setDetectedAddress(address);
        params.setDetectedAddresses(addrsArray);
        if (geoResult?.closestIdx !== undefined) { params.setCurrentAddressIndex(geoResult.closestIdx); params.setInitialAddressIndex(geoResult.closestIdx); }
        if (address) {
          params.setAddressSearchText(address);
          const coords = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
          const phaseIMessage = `Automated location (not yet confirmed by caller): ${address} (${coords}) ~${loc.accuracy?.toFixed(0) || '?'}m`;
          params.sendPsapMessage(phaseIMessage, loc.latitude, loc.longitude).catch(() => {});
          const nearbyLabel = params.nearbyAddress?.address?.label ? `near your ${params.nearbyAddress.address.label} at ` : 'at ';
          const cardText = `We detect you are ${nearbyLabel}${address}, if inaccurate use "Change Location".`;
          params.setChatMessages((prev) => prev.some((m: any) => m.historyOnly) ? prev : [...prev, { type: 'location', text: cardText, locationLine: address, historyOnly: true, incoming: true, timestamp: Date.now() }]);
        }
        detectIndoorOutdoor(loc.latitude, loc.longitude, loc.accuracy ?? null).catch(() => {});
      })().catch(() => {});
      try {
        const contactsRes = await localContacts.getEmergencyContacts();
        const smsContacts = (contactsRes.data.contacts || []).filter((c: any) => c.contact_phone && c.notify_sms !== false).map((c: any) => ({ name: c.contact_name, phone: c.contact_phone }));
        if (smsContacts.length > 0) {
          const matched = findMatchingAddress(loc.latitude, loc.longitude);
          await emergencyMessagingService.sendEmergencySms({ contacts: smsContacts, userName: params.user?.first_name ? `${params.user.first_name} ${params.user.last_name||''}`.trim() : 'A user', location: { latitude: loc.latitude, longitude: loc.longitude, address: null }, savedAddressInfo: matched?.includeInSms ? buildContactSmsInfo(matched) : null });
        }
      } catch (_) {}
      let imgs: string[] = [];
      let profilePayload: string | null = null;
      try {
        const [localRaw, scopedMedicalRaw, legacyMedicalRaw, identityImgs] = await Promise.all([
          AsyncStorage.getItem(LOCAL_PROFILE_KEY),
          AsyncStorage.getItem(getProfileMedicalInfoStorageKey()),
          AsyncStorage.getItem(PROFILE_MEDICAL_INFO_KEY),
          identityPhotosPromise,
        ]);
        imgs = identityImgs;
        let medicalRaw = scopedMedicalRaw || legacyMedicalRaw;
        if (!medicalRaw) {
          try {
            const allKeys = await AsyncStorage.getAllKeys();
            const medKeys = allKeys.filter((k) => k.startsWith('@profile_medical_info:'));
            if (medKeys.length > 0) {
              const pairs = await AsyncStorage.multiGet(medKeys);
              const firstMedical = pairs.map(([, v]) => v).find((v) => !!v);
              if (firstMedical) medicalRaw = firstMedical;
            }
          } catch {}
        }
        const profileMessage = buildLocalProfileMessage(localRaw, medicalRaw, params.user);
        if (profileMessage) profilePayload = profileMessage;
      } catch (_) {
        try { imgs = await identityPhotosPromise; } catch {}
      }

      if (profilePayload || imgs.length > 0) {
        let delivered = false;
        let mmsQueued = false;
        console.log(
          `[E911Identity] send check profile=${!!profilePayload} imgs=${imgs.length} ` +
            `profileSent=${params.localProfileSentRef.current} imagesSent=${params.identityPsapNoticeSentRef.current}`,
        );
        if (profilePayload && !params.localProfileSentRef.current) {
          params.setChatMessages(prev => prev.some((m: any) => m.aboveLocation) ? prev : [...prev, { type: 'chat', text: profilePayload!, aboveLocation: true, timestamp: Date.now() }]);
          scrollToBottom();
          try {
            delivered = await params.sendPsapMessage(profilePayload, loc.latitude, loc.longitude);
          } catch {}
        }

        // Fallback: attempt native SMS directly when the higher-level path fails.
        if (profilePayload && !params.localProfileSentRef.current && !delivered && psapMessagingService.isAvailable()) {
          try {
            const hasPerm = await psapMessagingService.ensurePermissions();
            if (hasPerm) {
              const direct = await psapMessagingService.sendMessage(profilePayload, EMERGENCY_TEST_NUMBER);
              delivered = !!direct.success;
            }
          } catch {}
        }

        if (imgs.length > 0 && !params.identityPsapNoticeSentRef.current && isDirectSmsAvailable()) {
          try {
            console.log(`[E911Identity] requesting MMS for ${imgs.length} image(s)`);
            const target = await resolveDirectSmsTarget();
            await sendDirectMmsAttachments(
              target,
              imgs.length === 1 ? 'Identification photo' : 'Identification photos',
              imgs.map((uri) => ({ uri, mimeType: 'image/jpeg' })),
            );
            mmsQueued = true;
            params.setChatMessages(prev => [
              ...prev,
              ...imgs.map((imageUrl) => ({ type: 'chat' as const, text: '', imageUrl, timestamp: Date.now() })),
            ]);
            scrollToBottom();
          } catch (err) {
            console.warn('[E911Identity] MMS request threw:', err);
          }
        } else if (imgs.length > 0 && params.identityPsapNoticeSentRef.current) {
          console.log('[E911Identity] identity MMS already marked sent; skipping duplicate');
        } else if (imgs.length > 0) {
          console.warn('[E911Identity] Native MMS module unavailable; identity photos were not sent.');
        }

        if (delivered || mmsQueued) {
          if (delivered) params.localProfileSentRef.current = true;
          if (imgs.length > 0 && mmsQueued) params.identityPsapNoticeSentRef.current = true;
        }
      }
    } catch (error: any) { console.error('Call setup failed:', error); Alert.alert('Call Failed', error?.response?.data?.error || error?.message); params.setLoading(false); }
    finally { locationDetectionRunningRef.current = false; }
  }, [prepareCallStartIdentityPhotos, detectIndoorOutdoor, params, resolveDirectSmsTarget]);

  const messagingActions = useEmergencyMessagingActions(params, {
    runLocationDetection, resolveDirectSmsTarget,
  });

  return { buildMapUrl, detectIndoorOutdoor, searchAddress, runLocationDetection, ...messagingActions, openLocationNavigator };
};
