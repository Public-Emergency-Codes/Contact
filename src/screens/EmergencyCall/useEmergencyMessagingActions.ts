import { useCallback, useEffect, useRef } from 'react';
import { Alert, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkSmsCapability } from '../../services/psap/bundledPsapDirectoryService';
import emergencyCallTraceService from '../../services/emergencyCallTraceService';
import { getProfileMedicalInfoStorageKey, LOCAL_PROFILE_KEY, PROFILE_MEDICAL_INFO_KEY } from '../../constants/profileMedical';
import { needsTranslation } from '../../services/languageConfig';
import { translateToEnglish } from '../../services/dispatcherMessageTranslationService';
import { getEnglishFromOfflineTranslation } from '../../services/uiDictionaryStore';
import { isDirectSmsAvailable, sendDirectMmsAttachments, sendDirectSmsText } from '../../services/directSmsMediaService';
import { cleanupCameraCache } from '../../utils/cameraCleanup';
import videoRecordingService from '../../services/videoRecordingService';
import { buildLocationPreviewImageUrl, buildLocationPreviewMapUrl, toStreetAddress } from './emergencyMap';
import { reverseGeocode } from './reverseGeocode';
import { buildLocalProfileMessage } from './emergencyProfileMessage';
import type { UseEmergencyCallActionsParams } from './useEmergencyCallActions';

type MessagingDependencies = {
  runLocationDetection: () => Promise<void>;
  resolveDirectSmsTarget: () => Promise<string>;
};

export function useEmergencyMessagingActions(
  params: UseEmergencyCallActionsParams,
  { runLocationDetection, resolveDirectSmsTarget }: MessagingDependencies,
) {
  const scrollToBottom = params.scrollToBottom;
  const sendLocationUpdate = useCallback(async () => {
    try {
      params.setLoading(true);
      const submitLat = params.mapPin?.lat ?? params.detectedLocation.latitude;
      const submitLng = params.mapPin?.lng ?? params.detectedLocation.longitude;
      params.setCheckingPsap(true);
      try {
        const cap = checkSmsCapability(submitLat, submitLng);
        params.setPsapSmsCapable(cap.smsCapable ? { smsCapable: true, capable: true } : { smsCapable: false, useFallback: true });
      } catch (_) {
        params.setPsapSmsCapable({ smsCapable: false, useFallback: true });
      } finally { params.setCheckingPsap(false); }
      // In dev mode with override set, always force PSAP SMS capable (backend may return false in test environments)
      if (__DEV__) {
        try {
          const override = await AsyncStorage.getItem('dev_emergency_override_number');
          if (override) { params.setPsapSmsCapable({ smsCapable: true, capable: true }); console.log('[DEV] Forced psapSmsCapable=true for override:', override); }
        } catch (_) {}
      }
      const resolvedEventId = params.activeE911EventId || params.activeEmergencyEventId;
      if (!resolvedEventId) throw new Error('No active emergency event. Please restart.');
      const confirmedAddress = params.exactMatchAddress?.address ?? null;
      const fullAddress = params.mapPin ? (params.pinFullAddress || confirmedAddress || '') : (confirmedAddress || '');
      const coords = `${submitLat.toFixed(6)}, ${submitLng.toFixed(6)}`;
      const locationLine = fullAddress ? `${fullAddress} (${coords})` : `(${coords})`;
      const header = (params.locationReplyText || '').trim();
      const displayText = header ? `${header}\nThis is my current location ${locationLine}` : `This is my current location ${locationLine}`;
      // Fetch medical info from AsyncStorage if available
      let medicalInfo: any = null;
      try {
        const { getProfileMedicalInfoStorageKey } = require('../../constants/profileMedical');
        const raw = await AsyncStorage.getItem(getProfileMedicalInfoStorageKey());
        if (raw) medicalInfo = JSON.parse(raw);
      } catch (e) {
        console.log('[E911] Medical info fetch error:', e);
      }
      await emergencyCallTraceService.trace('e911_initiate_request_sent', {
        latitude: submitLat,
        longitude: submitLng,
        hasAddress: !!fullAddress,
        hasTelemetry: !!params.detectedLocation,
        hasMedicalInfo: !!medicalInfo,
      }, resolvedEventId);
      // Local-device-only: there is no backend to persist the E911 event. The
      // readable location text is delivered to the PSAP via native SMS below.
      const initiatedEventId = resolvedEventId;
      params.setActiveE911EventId(initiatedEventId);
      params.setSentUpdateBubble({ text: displayText, imageUrl: buildLocationPreviewImageUrl(submitLat, submitLng, params.streetViewPosition?.heading ?? 0, params.lastPanoId?.current ?? null), mapUrl: buildLocationPreviewMapUrl(submitLat, submitLng), coords, address: fullAddress, locationLine });
      params.setChatMessages(prev => [...prev, { text: displayText, type: 'location', address: fullAddress, coords, locationLine, imageUrl: buildLocationPreviewImageUrl(submitLat, submitLng, params.streetViewPosition?.heading ?? 0, params.lastPanoId?.current ?? null), mapUrl: buildLocationPreviewMapUrl(submitLat, submitLng), timestamp: Date.now() }]);
      params.setShowQuickResponses(false); params.setLocationReplyText(''); params.isLocationTextRef.current = false; params.setMapExpanded(false);
      params.setCallResult({ eventId: initiatedEventId, local: true }); params.setLoading(false);
      // Send the readable location text to the PSAP via native SMS (works in dev and production).
      params.sendPsapMessage(displayText).catch(() => {});
    } catch (error: any) {
      const responseStatus = error?.response?.status || null;
      const responseData = error?.response?.data;
      const responseBodySnippet = (() => {
        if (responseData == null) return null;
        if (typeof responseData === 'string') return responseData.slice(0, 500);
        try {
          return JSON.stringify(responseData).slice(0, 500);
        } catch {
          return String(responseData).slice(0, 500);
        }
      })();
      await emergencyCallTraceService.trace('e911_initiate_failed', {
        status: responseStatus,
        error: error?.response?.data?.error || error?.message || 'unknown',
        responseDataType: responseData === null ? 'null' : typeof responseData,
        responseBodySnippet,
      }, params.activeE911EventId || params.activeEmergencyEventId || null);
      Alert.alert('Call Failed', error?.response?.data?.error || error?.message);
      params.setLoading(false);
    }
  }, [params]);

  const sendMedicalInfoIfNeeded = useCallback(async () => {
    if (params.localProfileSentRef.current) return;
    params.localProfileSentRef.current = true; // guard immediately to prevent double-send from runLocationDetection
    try {
      const [localRaw, scopedMedicalRaw, legacyMedicalRaw] = await Promise.all([
        AsyncStorage.getItem(LOCAL_PROFILE_KEY),
        AsyncStorage.getItem(getProfileMedicalInfoStorageKey()),
        AsyncStorage.getItem(PROFILE_MEDICAL_INFO_KEY),
      ]);
      let medicalRaw = scopedMedicalRaw || legacyMedicalRaw;
      if (!medicalRaw) {
        try {
          const allKeys = await AsyncStorage.getAllKeys();
          const medKeys = allKeys.filter((k: string) => k.startsWith('@profile_medical_info:'));
          if (medKeys.length > 0) {
            const pairs = await AsyncStorage.multiGet(medKeys);
            const firstMedical = pairs.map(([, v]: [string, string | null]) => v).find((v: string | null) => !!v);
            if (firstMedical) medicalRaw = firstMedical;
          }
        } catch {}
      }
      const profileMessage = buildLocalProfileMessage(localRaw, medicalRaw, params.user);
      if (profileMessage) {
        params.setChatMessages(prev => [...prev, { type: 'chat', text: profileMessage, timestamp: Date.now() }]);
        scrollToBottom();
        params.sendPsapMessage(profileMessage).catch(() => {});
      }
    } catch (_) {}
  }, [params, scrollToBottom]);

  const sendMessage = useCallback(async () => {
    console.log('[E911 sendMessage] called — locationReplyText:', JSON.stringify(params.locationReplyText), 'showLocationConfirm:', params.showLocationConfirm, 'activeE911EventId:', params.activeE911EventId, 'activeEmergencyEventId:', params.activeEmergencyEventId);
    const text = (params.locationReplyText || '').trim();
    const attachments = (params.pendingAttachments || []).filter((att) => !!att.uri);
    const hasAttachments = attachments.length > 0;
    if (!text && !hasAttachments) { console.log('[E911 sendMessage] empty text and no attachments, returning'); return; }
    // SMS-only entry: location detection is deferred until the first message
    // is sent. Fire it now (without awaiting) so the SMS goes out immediately
    // while location resolves in the background.
    if (!params.detectedLocation) { runLocationDetection(); }
    // Only treat the send as a location update when the user took an explicit
    // location action (a location quick-reply chip set isLocationTextRef, or a
    // map pin is active). A free-typed message must NOT be absorbed into a
    // location bubble just because the location card happens to be visible.
    if (!hasAttachments && (params.isLocationTextRef.current || params.mapPin)) { console.log('[E911 sendMessage] calling sendLocationUpdate'); return sendLocationUpdate(); }
    params.setChatMessages(prev => [
      ...prev,
      ...(hasAttachments
        ? attachments.map((att, idx) => ({ type: 'chat' as const, text: idx === 0 ? text : '', imageUrl: att.uri, mediaMime: att.mimeType, incoming: false, timestamp: Date.now() }))
        : [{ type: 'chat' as const, text, incoming: false, timestamp: Date.now() }]),
    ]);
    params.clearAttachments?.();
    params.setLocationReplyText(''); params.setShowQuickResponses(false); Keyboard.dismiss(); scrollToBottom();
    const langCode = (params.userLangCode || params.languageCode || 'en').toLowerCase();
    let englishText = text;
    if (needsTranslation(langCode)) { const tr = await translateToEnglish(text, langCode); englishText = tr.translatedText; if (!tr.success) { const pack = await getEnglishFromOfflineTranslation(langCode, text); if (pack) englishText = pack; } }
    // sendPsapMessage internally bypasses psapSmsCapable when devOverride is set,
    // so always call it — it will no-op if neither psapSmsCapable nor devOverride is set.
    if (!hasAttachments && text) params.sendPsapMessage(englishText).catch(() => {});
    if (hasAttachments && isDirectSmsAvailable()) {
      try {
        const target = await resolveDirectSmsTarget();
        if (englishText) {
          await sendDirectSmsText(target, englishText, '');
        }
        await sendDirectMmsAttachments(target, englishText, attachments);
      } catch (err: any) {
        console.warn('[E911 sendMessage] DirectSms MMS failed:', err?.message || err);
      }
    } else if (hasAttachments) {
      console.warn('[E911 sendMessage] Native MMS module unavailable; photo was not sent.');
    }
    sendMedicalInfoIfNeeded();
  }, [params, sendLocationUpdate, scrollToBottom, sendMedicalInfoIfNeeded, resolveDirectSmsTarget]);

  const sendDirectMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    // SMS-only entry: location detection is deferred. Fire it now.
    if (!params.detectedLocation) { runLocationDetection(); }
    params.setChatMessages(prev => [...prev, { type: 'chat', text: text.trim(), incoming: false, timestamp: Date.now() }]);
    params.setLocationReplyText(''); params.setShowQuickResponses(false); scrollToBottom();
    const langCode = (params.userLangCode || params.languageCode || 'en').toLowerCase();
    let englishText = text.trim();
    if (needsTranslation(langCode)) { const tr = await translateToEnglish(englishText, langCode); englishText = tr.translatedText; if (!tr.success) { const pack = await getEnglishFromOfflineTranslation(langCode, text.trim()); if (pack) englishText = pack; } }
    params.sendPsapMessage(englishText).catch(() => {});
    sendMedicalInfoIfNeeded();
  }, [params, scrollToBottom, sendMedicalInfoIfNeeded]);

  const handleCprNeeded = useCallback(async () => {
    params.setChatMessages(prev => [...prev, { type: 'user', text: 'CPR is needed — please send help immediately.' }]);
    params.sendPsapMessage('URGENT: CPR IS NEEDED. Caller requires immediate CPR and defibrillation. Please dispatch AED-equipped responders.');
  }, [params]);

  const handleRelocationDetected = useCallback(async (newLat: number, newLng: number) => {
    try {
      const geo = await reverseGeocode(newLat, newLng);
      const newAddress = geo?.address || 'Unknown address';
      await params.sendPsapMessage(`Caller has moved to a new location: ${newAddress} at coordinates ${newLat.toFixed(6)}, ${newLng.toFixed(6)}`, newLat, newLng);
      params.setChatMessages(prev => [...prev, { text: `We have detected that you have moved to ${toStreetAddress(newAddress)}, please confirm whether or not you moved to this new location.`, type: 'relocation', address: newAddress, coords: `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`, responded: null, timestamp: Date.now() }]);
      scrollToBottom(500); params.lastScannedLocationRef.current = { latitude: newLat, longitude: newLng };
    } catch (_) {}
  }, [params, scrollToBottom]);

  const handleRelocationResponse = useCallback(async (idx: number, response: 'yes' | 'no') => {
    params.setChatMessages(prev => prev.map((m, i) => i === idx ? { ...m, responded: response } : m));
    if (response === 'no') { await params.sendPsapMessage('Still at original location. Has not moved.', params.detectedLocation?.latitude, params.detectedLocation?.longitude); if (params.detectedLocation) params.lastScannedLocationRef.current = { latitude: params.detectedLocation.latitude, longitude: params.detectedLocation.longitude }; }
    scrollToBottom(300);
  }, [params, scrollToBottom]);

  const startFreshCall = useCallback(() => {
    params.setShowLocationConfirm(false); params.setCallResult(null); params.setDetectedAddress(null); params.setDetectedAddresses([]); params.setCurrentAddressIndex(0); params.setSvHtml(null); params.setStreetViewUrl(null); params.setDetectedLocation(null); params.setSentUpdateBubble(null); params.setChatMessages(() => []); params.identityPhotosSentRef.current = false; params.identityImagesRef.current = []; params.identityPsapNoticeSentRef.current = false; params.localProfileSentRef.current = false; params.setPinnedIdentityImages([]); params.setActiveE911EventId(null); params.isLocationTextRef.current = false; params.setShowQuickResponses(true); params.setPsapSmsCapable(null); params.setCheckingPsap(false); params.setUserJustEnabledCamera(false); params.setEmergencyTypeSelection(null); params.setEmergencyTypeSendFailed(false); params.videoBubblePushedRef.current = false; params.emergencyTypeRetryRef.current = null; params.stopCameraRecording(); cleanupCameraCache(); params.cameraReadyRef.current = false; params.setLoading(false); videoRecordingService.stop();
    setTimeout(() => runLocationDetection(), 100);
  }, [params, runLocationDetection]);

  // DEBUG: auto-fire sendLocationUpdate once when showLocationConfirm is true and initiation hasn't happened yet
  const _e2eAutoSendFiredRef = useRef(false);
  useEffect(() => {
    if (_e2eAutoSendFiredRef.current) return;
    if (!params.showLocationConfirm || !params.detectedLocation) return;
    if (params.activeE911EventId) return;
    if (!params.activeEmergencyEventId) return;
    if (params.loading) return;
    _e2eAutoSendFiredRef.current = true;
    console.log('[E911 E2E-AUTO] conditions met, firing sendLocationUpdate in 1.5s');
    const t = setTimeout(() => { sendLocationUpdate(); }, 1500);
    return () => clearTimeout(t);
  }, [params.showLocationConfirm, params.detectedLocation, params.activeE911EventId, params.activeEmergencyEventId, params.loading, sendLocationUpdate]);


  return {
    sendLocationUpdate, sendMessage, sendDirectMessage, sendMedicalInfoIfNeeded,
    handleCprNeeded, handleRelocationDetected, handleRelocationResponse, startFreshCall,
  };
}
