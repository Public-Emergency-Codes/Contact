import { useEmergencyCallCamera } from './useEmergencyCallCamera';
import { useEmergencyCallSilentMode } from './useEmergencyCallSilentMode';
import { useEmergencyCallCollapseAnimations } from './useEmergencyCallCollapseAnimations';
import { useEmergencyCallActions } from './useEmergencyCallActions';
import { useEmergencyVideoCall } from './useEmergencyVideoCall';

export const useEmergencyCallController = (callState: any) => {
  const camera = useEmergencyCallCamera({
    setChatMessages: callState.setChatMessages,
    scrollToBottom: callState.scrollToBottom,
    detectedLocation: callState.detectedLocation,
    fromHomeRecording: callState.fromHomeRecording,
    psapNumber: callState.psapNumber,
  });
  const silentMode = useEmergencyCallSilentMode({
    emergencyCallActive: callState.emergencyCallActive,
    sendPsapMessage: callState.sendPsapMessage,
    setChatMessages: callState.setChatMessages,
  });
  const collapseAnims = useEmergencyCallCollapseAnimations(callState.scrollViewRef);
  const actions = useEmergencyCallActions({    user: callState.user, languageCode: callState.languageCode, userLangCode: callState.userLangCode,
    detectedLocation: callState.detectedLocation, mapPin: callState.mapPin, mapZoom: callState.mapZoom,
    mapViewRatio: callState.mapViewRatio, mapSectionHeight: callState.mapSectionHeight,
    mapType: callState.mapType, showStreetNames: callState.showStreetNames, showBusinessNames: callState.showBusinessNames,
    pinFullAddress: callState.pinFullAddress, locationReplyText: callState.locationReplyText,
    showLocationConfirm: callState.showLocationConfirm,
    streetViewPosition: callState.streetViewPosition, lastPanoId: callState.lastPanoId, loading: callState.loading,
    volumeState: silentMode.volumeState, psapSmsCapable: callState.psapSmsCapable,
    silentModeActive: silentMode.silentModeActive, isLocationTextRef: callState.isLocationTextRef,
    lastScannedLocationRef: callState.lastScannedLocationRef, identityPhotosSentRef: callState.identityPhotosSentRef,
    identityImagesRef: callState.identityImagesRef, identityPsapNoticeSentRef: callState.identityPsapNoticeSentRef,
    localProfileSentRef: callState.localProfileSentRef,
    activeE911EventId: callState.activeE911EventId, activeEmergencyEventId: callState.activeEmergencyEventId,
    exactMatchAddress: callState.exactMatchAddress, webViewRef: callState.webViewRef, skipRecenterUntil: callState.skipRecenterUntil,
    cameraRef: camera.cameraRef, cameraReadyRef: camera.cameraReadyRef,
    sendPsapMessage: callState.sendPsapMessage, scrollToBottom: callState.scrollToBottom,
    captureCallStartSelfie: camera.captureCallStartSelfie,
    setLoading: callState.setLoading, setDetectedLocation: callState.setDetectedLocation,
    setDetectedAddress: callState.setDetectedAddress, setDetectedAddresses: callState.setDetectedAddresses,
    setCurrentAddressIndex: callState.setCurrentAddressIndex, setInitialAddressIndex: callState.setInitialAddressIndex,
    setStreetViewUrl: callState.setStreetViewUrl, setSvHtml: callState.setSvHtml,
    setShowLocationConfirm: callState.setShowLocationConfirm, setChatMessages: callState.setChatMessages,
    setAddressSearchText: callState.setAddressSearchText, setInsideOutside: callState.setInsideOutside,
    setCallResult: callState.setCallResult, setSentUpdateBubble: callState.setSentUpdateBubble,
    setShowQuickResponses: callState.setShowQuickResponses, setLocationReplyText: callState.setLocationReplyText,
    setMapExpanded: callState.setMapExpanded, setActiveE911EventId: callState.setActiveE911EventId,
    setCheckingPsap: callState.setCheckingPsap, setPsapSmsCapable: callState.setPsapSmsCapable,
    setMapPin: callState.setMapPin, setMapCenter: callState.setMapCenter, setMapZoom: callState.setMapZoom,
    setBaseMapUrl: callState.setBaseMapUrl, setConeHeading: callState.setConeHeading,
    setAddressSearching: callState.setAddressSearching, setMapModified: callState.setMapModified,
    setPinnedIdentityImages: callState.setPinnedIdentityImages,
    setUserJustEnabledCamera: camera.setUserJustEnabledCamera,
    setEmergencyTypeSelection: callState.setEmergencyTypeSelection,
    setEmergencyTypeSendFailed: callState.setEmergencyTypeSendFailed,
    videoBubblePushedRef: camera.videoBubblePushedRef,
    emergencyTypeRetryRef: callState.emergencyTypeRetryRef, stopCameraRecording: camera.stopCameraRecording,
    nativeIncident: callState.nativeIncident, nativeIncidentConsumedRef: callState.nativeIncidentConsumedRef,
    pendingAttachments: callState.pendingAttachments, clearAttachments: callState.clearAttachments,
    psapNumber: callState.psapNumber,
  });

  // Video-calling entry: auto-start the stream and notify the PSAP a live
  // video stream has been requested (with user fallback messaging).
  useEmergencyVideoCall({
    withVideo: callState.withVideo,
    camera,
    collapseAnims,
    chatMessages: callState.chatMessages,
    setChatMessages: callState.setChatMessages,
    scrollToBottom: callState.scrollToBottom,
    sendPsapMessage: callState.sendPsapMessage,
    detectedLocation: callState.detectedLocation,
    videoRequestId: callState.e911ActionId,
  });

  return { camera, silentMode, collapseAnims, actions };
};
