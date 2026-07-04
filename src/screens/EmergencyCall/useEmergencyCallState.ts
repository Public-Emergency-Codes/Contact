import { useState, useRef, useCallback, useMemo } from 'react';
import { Animated, useWindowDimensions } from 'react-native';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { useTextScale } from '../../context/TextScaleContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppLanguage } from '../../context/AppLanguageContext';
import { translateWithDictionary } from '../../services/uiTranslationService';
import { EMERGENCY_TEST_NUMBER } from '../../services/runtimeConfig';
import videoRecordingService from '../../services/videoRecordingService';
import psapMessagingService from '../../services/psap/psapMessagingService';
import { makeEmergencyCallStyles } from './emergencyCallStyles';
import type { EmergencyCallMessage } from './emergencyCallMessageTypes';

export const useEmergencyCallState = (route: any) => {
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => makeEmergencyCallStyles(colors), [colors]);
  const { textScale, setTextScale } = useTextScale();
  const { languageCode, dictionary } = useAppLanguage();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const user = null;
  const activeEmergencyEventId = useAppSelector((s: any) => s.emergency?.currentEvent?.id);
  const savedAddresses = useAppSelector((s: any) => s.savedAddresses.addresses);
  const savedAddressesLoaded = useAppSelector((s: any) => s.savedAddresses.loaded);
  const t = useCallback((v: string) => translateWithDictionary(v, languageCode, dictionary), [dictionary, languageCode]);
  const fromHomeRecording = route?.params?.fromHomeRecording === true || videoRecordingService.startedFromHome;
  const withVideo = route?.params?.withVideo === true;
  const e911ActionId = (route?.params?.e911ActionId as string | number) ?? undefined;
  const isLandscape = windowWidth > windowHeight;
  const fs = (n: number) => Math.round(n * textScale);
  const collapseH = Math.round(54 * textScale);
  const btnLabel = { color: colors.textPrimary as any, fontSize: fs(12), fontWeight: '500' as any };

  const [loading, setLoading] = useState(false);
  const [loadingDots, setLoadingDots] = useState('');
  const [callResult, setCallResult] = useState<any>(null);
  const [showLocationConfirm, setShowLocationConfirm] = useState(false);
  const [detectedLocation, setDetectedLocation] = useState<any>(null);
  const [detectedAddress, setDetectedAddress] = useState<any>(null);
  const [detectedAddresses, setDetectedAddresses] = useState<any[]>([]);
  const [currentAddressIndex, setCurrentAddressIndex] = useState(0);
  const [initialAddressIndex, setInitialAddressIndex] = useState(0);
  const [streetViewUrl, setStreetViewUrl] = useState<string | null>(null);
  const [svHtml, setSvHtml] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<EmergencyCallMessage[]>([]);
  const [locationReplyText, setLocationReplyText] = useState('');
  const [showQuickResponses, setShowQuickResponses] = useState(true);
  const [psapSmsCapable, setPsapSmsCapable] = useState<any>(null);
  const [checkingPsap, setCheckingPsap] = useState(false);
  const [activeE911EventId, setActiveE911EventId] = useState<string | null>(null);
  const [pinnedIdentityImages, setPinnedIdentityImages] = useState<any[]>([]);
  const [sentUpdateBubble, setSentUpdateBubble] = useState<any>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapPin, setMapPin] = useState<any>(null);
  const [pinFullAddress, setPinFullAddress] = useState('');
  const [mapType, setMapType] = useState('roadmap');
  const [showStreetNames, setShowStreetNames] = useState(true);
  const [showBusinessNames, setShowBusinessNames] = useState(false);
  const [insideOutside, setInsideOutside] = useState<'inside' | 'outside'>('outside');
  const [floorType, setFloorType] = useState<'level' | 'basement'>('level');
  const [floorNumber, setFloorNumber] = useState('1');
  const [confirmedFloor] = useState<number | null>(null);
  const [addressSearchText, setAddressSearchText] = useState('');
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressSearchFocused, setAddressSearchFocused] = useState(false);
  const [mapPanOffset, setMapPanOffset] = useState({ x: 0, y: 0 });
  const [mapContainerSize, setMapContainerSize] = useState({ w: windowWidth, h: 300 });
  const [mapViewRatio, setMapViewRatio] = useState(0.3);
  const [mapSectionHeight, setMapSectionHeight] = useState(400);
  const [searchToggleHeight, setSearchToggleHeight] = useState(100);
  const [mapZoom, setMapZoom] = useState(16);
  const [baseMapUrl, setBaseMapUrl] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<any>(null);
  const [coneHeading, setConeHeading] = useState(0);
  const [streetViewPosition, setStreetViewPosition] = useState<any>(null);
  const [mapModified, setMapModified] = useState(false);
  const [showArrow, setShowArrow] = useState(false);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [webViewKey] = useState(0);
  const [controlsVisible] = useState(true);
  const [currentHeading] = useState(0);
  const [joystickPosition, setJoystickPosition] = useState({ x: 0, y: 0 });
  const [isRotating, setIsRotating] = useState(false);
  const [showTextSlider, setShowTextSlider] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [bottomAreaHeight, setBottomAreaHeight] = useState(130);
  const [emergencyTypeSelection, setEmergencyTypeSelection] = useState<string | null>(null);
  const [emergencyTypeSendFailed, setEmergencyTypeSendFailed] = useState(false);
  const [cprAlertSent] = useState(false);
  const [userLangCode, setUserLangCode] = useState<string | null>(languageCode || null);
  const [exactMatchAddress, setExactMatchAddress] = useState<any>(null);
  const [nearbyAddress, setNearbyAddress] = useState<any>(null);
  const [nearbyAddressConfirmed, setNearbyAddressConfirmed] = useState(false);

  const scrollViewRef = useRef<any>(null);
  const webViewRef = useRef<any>(null);
  const isLocationTextRef = useRef(false);
  const lastScannedLocationRef = useRef<any>(null);
  const locationScanTimerRef = useRef<any>(null);
  const identityPhotosSentRef = useRef(false);
  const identityImagesRef = useRef<string[]>([]);
  const identityPsapNoticeSentRef = useRef(false);
  const savedAddrSentRef = useRef(false);
  const medicalProfileSentRef = useRef(false);
  const localProfileSentRef = useRef(false);
  const lastChatLengthRef = useRef(0);
  const identityPhotosAtTopRef = useRef(false);
  const pinchStartRef = useRef<any>(null);
  const panMidpointRef = useRef<any>(null);
  const mapPanOffsetRef = useRef({ x: 0, y: 0 });
  const initialState = useRef<any>(null);
  const initialStateSettled = useRef(0);
  const skipRecenterUntil = useRef(0);
  const lastPanoId = useRef<string | null>(null);
  const lastResetTime = useRef(0);
  const tapStartRef = useRef<any>(null);
  const mapContainerRef = useRef<any>(null);
  const psapSmsSessionActive = useRef(false);
  const emergencyTypeRetryRef = useRef<any>(null);
  const emergencyTypeTriggerRef = useRef<any>(null);
  const prevAddrTimestamps = useRef<Map<string, string>>(new Map());
  const nativeIncident = route?.params?.nativeIncident || null;
  const nativeIncidentConsumedRef = useRef(false);
  const recordingDotOpacity = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY()).current;
  const emergencyCallActive = loading || (showLocationConfirm && !!detectedLocation);

  const scrollToBottom = useCallback((delay = 300) => {
    if (identityPhotosAtTopRef.current) return;
    setTimeout(() => scrollViewRef.current?.scrollToEnd?.({ animated: true }), delay);
  }, []);

  const sendPsapMessage = useCallback(async (message: string, _lat?: number, _lng?: number): Promise<boolean> => {
    // Always use the permanent emergency override as fallback for any dial/message glitches.
    let devOverride: string | null = null;
    if (__DEV__) {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        devOverride = await AsyncStorage.getItem('dev_emergency_override_number');
      } catch (_) {}
    }
    const nativeAvailable = psapMessagingService.isAvailable();
    const fallbackNumber = EMERGENCY_TEST_NUMBER;
    // If for any reason a number is missing, fallback to the override number.
    const numberToUse = (devOverride && typeof devOverride === 'string' && devOverride.trim()) ? devOverride.trim() : fallbackNumber;
    console.log('[PsapSms] sendPsapMessage: devOverride=', devOverride, 'nativeAvailable=', nativeAvailable, 'psapSmsCapable=', psapSmsCapable, 'numberToUse=', numberToUse);
    if ((devOverride || psapSmsCapable?.capable || psapSmsCapable?.smsCapable || psapSmsCapable === null) && nativeAvailable) {
      const r = await psapMessagingService.sendMessage(message, numberToUse);
      console.log('[PsapSms] sendMessage result:', r);
      if (r.success) return true;
    }
    // Local-device-only: if native SMS is unavailable or failed there is no
    // speech fallback — the message simply could not be delivered.
    return false;
  }, [psapSmsCapable, detectedLocation, activeE911EventId, activeEmergencyEventId]);

  return {
    dispatch, colors, styles, textScale, setTextScale, languageCode, dictionary, windowWidth, windowHeight,
    user, activeEmergencyEventId, savedAddresses, savedAddressesLoaded, t, fromHomeRecording, withVideo, e911ActionId,
    isLandscape, fs, collapseH, btnLabel,
    loading, setLoading, loadingDots, setLoadingDots, callResult, setCallResult,
    showLocationConfirm, setShowLocationConfirm, detectedLocation, setDetectedLocation,
    detectedAddress, setDetectedAddress, detectedAddresses, setDetectedAddresses,
    currentAddressIndex, setCurrentAddressIndex, initialAddressIndex, setInitialAddressIndex,
    streetViewUrl, setStreetViewUrl, svHtml, setSvHtml,
    chatMessages, setChatMessages, locationReplyText, setLocationReplyText,
    showQuickResponses, setShowQuickResponses, psapSmsCapable, setPsapSmsCapable,
    checkingPsap, setCheckingPsap, activeE911EventId, setActiveE911EventId,
    pinnedIdentityImages, setPinnedIdentityImages, sentUpdateBubble, setSentUpdateBubble,
    mapExpanded, setMapExpanded, mapPin, setMapPin, pinFullAddress, setPinFullAddress,
    mapType, setMapType, showStreetNames, setShowStreetNames, showBusinessNames, setShowBusinessNames,
    insideOutside, setInsideOutside, floorType, setFloorType, floorNumber, setFloorNumber,
    confirmedFloor, addressSearchText, setAddressSearchText, addressSearching, setAddressSearching,
    addressSearchFocused, setAddressSearchFocused, mapPanOffset, setMapPanOffset,
    mapContainerSize, setMapContainerSize, mapViewRatio, setMapViewRatio,
    mapSectionHeight, setMapSectionHeight, searchToggleHeight, setSearchToggleHeight,
    mapZoom, setMapZoom, baseMapUrl, setBaseMapUrl, mapCenter, setMapCenter,
    coneHeading, setConeHeading, streetViewPosition, setStreetViewPosition,
    mapModified, setMapModified, showArrow, setShowArrow, isDraggingDivider, setIsDraggingDivider,
    webViewKey, controlsVisible, currentHeading, joystickPosition, setJoystickPosition,
    isRotating, setIsRotating, showTextSlider, setShowTextSlider,
    keyboardHeight, setKeyboardHeight, bottomAreaHeight, setBottomAreaHeight,
    emergencyTypeSelection, setEmergencyTypeSelection, emergencyTypeSendFailed, setEmergencyTypeSendFailed,
    cprAlertSent,
    userLangCode, setUserLangCode, exactMatchAddress, setExactMatchAddress,
    nearbyAddress, setNearbyAddress, nearbyAddressConfirmed, setNearbyAddressConfirmed,
    scrollViewRef, webViewRef, isLocationTextRef, lastScannedLocationRef, locationScanTimerRef,
    identityPhotosSentRef, identityImagesRef, identityPsapNoticeSentRef,
    savedAddrSentRef, medicalProfileSentRef, localProfileSentRef, lastChatLengthRef, identityPhotosAtTopRef,
    pinchStartRef, panMidpointRef, mapPanOffsetRef, initialState, initialStateSettled,
    skipRecenterUntil, lastPanoId, lastResetTime, tapStartRef, mapContainerRef,
    psapSmsSessionActive, emergencyTypeRetryRef, emergencyTypeTriggerRef, prevAddrTimestamps,
    nativeIncident, nativeIncidentConsumedRef,
    recordingDotOpacity, pan,
    emergencyCallActive, scrollToBottom, sendPsapMessage,
  };
};
