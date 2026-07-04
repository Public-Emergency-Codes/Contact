import { useEffect, useRef } from 'react';
import { useEmergencyCallSessionEffects } from './useEmergencyCallSessionEffects';

export const useEmergencyCallEffects = ({
  KeepAwake, actions, camera, fromHomeRecording, withVideo,
  loading, setLoadingDots, emergencyCallActive, psapSmsCapable, psapSmsSessionActive,
  setChatMessages, scrollToBottom, emergencyTypeSelection,
  showLocationConfirm, detectedLocation, medicalProfileSentRef, userLangCode,
  user,
  sendPsapMessage, setKeyboardHeight, detectedAddresses, initialAddressIndex,
  svHtml, setSvHtml, coneHeading, setConeHeading, locationScanTimerRef,
  lastScannedLocationRef, savedAddresses, prevAddrTimestamps, savedAddrSentRef,
  setExactMatchAddress, setNearbyAddress, setNearbyAddressConfirmed, detectedAddress,
  recordingDotOpacity, chatMessages, lastChatLengthRef, identityPhotosAtTopRef,
  scrollViewRef, savedAddressesLoaded, dispatch, loadSavedAddresses, languageCode, setUserLangCode,
  streetViewPosition, mapCenter, mapZoom, baseMapUrl, mapType, showStreetNames,
  showBusinessNames, mapPin, mapViewRatio, setMapCenter, setBaseMapUrl,
  initialState, lastPanoId, skipRecenterUntil, activeE911EventId,
}: any) => {
  useEffect(() => {
    if (!savedAddressesLoaded) loadSavedAddresses(dispatch);
  }, [savedAddressesLoaded, dispatch, loadSavedAddresses]);

  useEffect(() => {
    setUserLangCode(languageCode || 'en');
  }, [languageCode, setUserLangCode]);

  const actionsRef = useRef(actions);

  // Default dialer role prompt is now opt-in only from permissions/settings UI.
  actionsRef.current = actions;

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => setLoadingDots((prev: string) => (prev.length >= 3 ? '' : prev + '.')), 500);
    return () => clearInterval(interval);
  }, [loading, setLoadingDots]);

  useEffect(() => {
    if (!emergencyCallActive) return;
    KeepAwake?.activateKeepAwakeAsync?.('emergency-recording').catch(() => {});
    return () => {
      if (KeepAwake?.deactivateKeepAwake) KeepAwake.deactivateKeepAwake('emergency-recording');
    };
  }, [KeepAwake, emergencyCallActive]);

  useEmergencyCallSessionEffects({
    psapSmsCapable, psapSmsSessionActive, setChatMessages, scrollToBottom, camera, fromHomeRecording, withVideo,
    emergencyTypeSelection, showLocationConfirm, detectedLocation, medicalProfileSentRef,
    userLangCode, user, sendPsapMessage, setKeyboardHeight, detectedAddresses, initialAddressIndex,
    svHtml, setSvHtml, coneHeading, setConeHeading, locationScanTimerRef, lastScannedLocationRef,
    savedAddresses, prevAddrTimestamps, savedAddrSentRef, setExactMatchAddress, setNearbyAddress,
    setNearbyAddressConfirmed, detectedAddress, recordingDotOpacity, chatMessages,
    lastChatLengthRef, identityPhotosAtTopRef, scrollViewRef, actions,
    streetViewPosition, mapCenter, mapZoom, baseMapUrl, mapType, showStreetNames,
    showBusinessNames, mapPin, mapViewRatio, setMapCenter, setBaseMapUrl,
    initialState, lastPanoId, skipRecenterUntil, activeE911EventId,
  });
};
