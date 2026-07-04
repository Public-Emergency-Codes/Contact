import React, { useRef, useState } from 'react';
import { View, TouchableOpacity, ScrollView, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AppText from '../../components/AppText';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadSavedAddresses } from '../../store/slices/savedAddressesSlice';
import { buildDispatcherInfo } from '../../services/savedAddressService';
import { Ionicons } from '@expo/vector-icons';
import { BACKGROUND_LOCATION_TASK, toStreetAddress, calculateHeading } from './emergencyMap';
import { useEmergencyCallState } from './useEmergencyCallState';
import { useEmergencyCallController } from './useEmergencyCallController';
import { useEmergencyCallEffects } from './useEmergencyCallEffects';
import { EmergencyCallMessageList } from './EmergencyCallMessageList';
import { EmergencyMapNavigator } from './EmergencyMapNavigator';
import { EmergencyCallInput } from './EmergencyCallInput';
import { EmergencyLocationPreview } from './EmergencyLocationPreview';
import EmergencyTypeBubble from './EmergencyTypeBubble';
import { EmergencyCallHistory } from './EmergencyCallHistory';
import { useEmergencyCallSessionHistory } from './useEmergencyCallSessionHistory';
import { EMERGENCY_TEST_NUMBER } from '../../services/runtimeConfig';
import { useAttachmentPicker } from '../../hooks/useAttachmentPicker';
import FullScreenChatMediaViewer, { ChatMediaMessage } from '../Home/FullScreenChatMediaViewer';
import { useEmergencyVoiceCall } from './useEmergencyVoiceCall';

const Text = AppText;
let TaskManager: any = null; try { TaskManager = require('expo-task-manager'); } catch {}
let KeepAwake: any = null; try { KeepAwake = require('expo-keep-awake'); } catch {}
if (TaskManager?.defineTask) TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async () => {});

const normalizeEmergencyNumber = (value: any) => {
  const trimmed = String(value || '').trim();
  return !trimmed || trimmed === '911' ? EMERGENCY_TEST_NUMBER : trimmed;
};

const EmergencyCallScreen = ({ navigation, route }: any) => {
  const s = useEmergencyCallState(route);
  const emergencyNumber = normalizeEmergencyNumber(route?.params?.emergencyNumber);
  const showInitiateCallButton = route?.params?.showInitiateCallButton === true;
  const [selectedMediaMessageId, setSelectedMediaMessageId] = useState<string | null>(null);
  const {
    dispatch, colors, styles, textScale, languageCode,
    user, activeEmergencyEventId, savedAddresses, savedAddressesLoaded, t,
    fromHomeRecording, isLandscape, fs, collapseH, btnLabel,
    loading, loadingDots, setLoadingDots,
    showLocationConfirm, detectedLocation,
    detectedAddress, detectedAddresses,
    currentAddressIndex, initialAddressIndex,
    streetViewUrl, svHtml, setSvHtml,
    chatMessages, setChatMessages, locationReplyText, setLocationReplyText,
    showQuickResponses, psapSmsCapable,
    activeE911EventId, setActiveE911EventId,
    pinnedIdentityImages,
    mapExpanded, setMapExpanded, mapPin, setMapPin, pinFullAddress,
    mapType, setMapType, showStreetNames, setShowStreetNames, showBusinessNames, setShowBusinessNames,
    insideOutside, setInsideOutside, floorType, setFloorType, floorNumber, setFloorNumber,
    confirmedFloor, addressSearchText, setAddressSearchText, addressSearching,
    addressSearchFocused, setAddressSearchFocused, mapPanOffset, setMapPanOffset,
    mapContainerSize, setMapContainerSize, mapViewRatio, setMapViewRatio,
    mapSectionHeight, setMapSectionHeight, searchToggleHeight, setSearchToggleHeight,
    mapZoom, setMapZoom, baseMapUrl, setBaseMapUrl, mapCenter, setMapCenter,
    coneHeading, setConeHeading, streetViewPosition, setStreetViewPosition,
    mapModified, setMapModified, showArrow, setShowArrow, isDraggingDivider, setIsDraggingDivider,
    webViewKey, controlsVisible, currentHeading, setJoystickPosition,
    isRotating, setIsRotating,
    setKeyboardHeight, bottomAreaHeight, setBottomAreaHeight,
    emergencyTypeSelection, setEmergencyTypeSelection, emergencyTypeSendFailed, setEmergencyTypeSendFailed,
    cprAlertSent,
    userLangCode, setUserLangCode, exactMatchAddress, setExactMatchAddress,
    nearbyAddress, setNearbyAddress, nearbyAddressConfirmed, setNearbyAddressConfirmed,
    scrollViewRef, webViewRef, isLocationTextRef, lastScannedLocationRef, locationScanTimerRef,
    savedAddrSentRef, medicalProfileSentRef, lastChatLengthRef, identityPhotosAtTopRef,
    pinchStartRef, panMidpointRef, mapPanOffsetRef, initialState, initialStateSettled,
    skipRecenterUntil, lastPanoId, lastResetTime, tapStartRef, mapContainerRef,
    psapSmsSessionActive, emergencyTypeRetryRef, emergencyTypeTriggerRef, prevAddrTimestamps,
    recordingDotOpacity, pan,
    emergencyCallActive, scrollToBottom, sendPsapMessage,
  } = s;

  const attachmentPicker = useAttachmentPicker(emergencyNumber);
  const { camera, silentMode, collapseAnims, actions } = useEmergencyCallController({
    ...s,
    e911ActionId: route?.params?.e911ActionId,
    pendingAttachments: attachmentPicker.pendingAttachments,
    clearAttachments: attachmentPicker.clearAttachments,
    psapNumber: emergencyNumber,
  });
  const {
    callInitiated, callWasEnded, callElapsed, showInitiateUI,
    handleInitiateCallPress, stopVideoRef, resumeActiveCallIfPresent, openOngoingCall,
  } = useEmergencyVoiceCall({
    emergencyNumber,
    initialCallInitiated: route?.params?.callInitiated === true,
    withVideo: s.withVideo,
    autoInitiateCall: route?.params?.autoInitiateCall === true,
    actionId: route?.params?.e911ActionId,
    activeEmergencyEventId, activeE911EventId, setActiveE911EventId, setChatMessages,
  });
  const locationDetectionStartedRef = useRef(false);
  // Keep a stable ref to setVideoStreamingActive so the dispatcher-disconnect
  // useEffect always calls the latest setter (avoids stale closure).
  stopVideoRef.current = (active: boolean) => {
    camera.setVideoStreamingActive(active);
    if (!active) camera.cleanup();
  };
  const e911MediaMessages = React.useMemo<ChatMediaMessage[]>(() => (
    chatMessages
      .map((msg: any, idx: number) => ({
        id: msg.id || `e911-media-${idx}`,
        body: msg.text || '',
        date: msg.timestamp || Date.now() + idx,
        type: msg.incoming ? 1 : 2,
        imageUri: msg.imageUrl,
        mediaMime: msg.mediaMime,
      }))
      .filter((msg: ChatMediaMessage) => !!msg.imageUri)
  ), [chatMessages]);

  React.useEffect(() => {
    if (locationDetectionStartedRef.current) return;
    // SMS-only mode (no call initiated): do NOT auto-detect location on mount.
    // Location detection will fire when the user sends their first SMS or
    // initiates a call — whichever comes first. This prevents a wasteful
    // location calculation before the user has taken any action.
    if (showInitiateCallButton) return;
    locationDetectionStartedRef.current = true;
    const timer = setTimeout(() => {
      actions.runLocationDetection();
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInitiateCallButton]);

  const joystickSize = 80;
  const knobSize = 35;
  const maxDistance = (joystickSize - knobSize) / 2;

  // Persist each 911 SMS/chat conversation as a session. Returning within 6
  // hours (without starting a new call) keeps the prior conversation visible;
  // otherwise it moves to history, accessible via the Chat History button.
  // A genuinely new call is signalled by the entry route params / home trigger
  // — NOT by location detection, which runs on every screen entry.
  const newCallStarted = route?.params?.startNewSession === true
    || route?.params?.source === 'native_dialer';
  const newCallToken = newCallStarted
    ? (route?.params?.e911ActionId ?? route?.params?.nativeIncident?.id ?? route?.params?.source ?? null)
    : null;
  const sessionHistory = useEmergencyCallSessionHistory({ chatMessages, setChatMessages, newCallStarted, newCallToken });
  const liveMessageStartIndex = sessionHistory.liveMessageStartIndex || 0;
  const liveChatMessages = chatMessages.slice(liveMessageStartIndex);

  const previewAddressText = toStreetAddress(detectedAddresses[currentAddressIndex]?.address || detectedAddress || t('Unknown address'));
  const lastLocationMsgIdx = chatMessages.reduce((last: number, msg: any, i: number) => (
    i >= liveMessageStartIndex && msg.type === 'location' && !msg.historyOnly
  ) ? i : last, -1);
  // Snapshot the chat length the first time the location preview becomes
  // visible. In the SMS-first layout we render the chat messages added
  // BEFORE this moment above the preview card and the ones added AFTER
  // below it, so user replies (e.g. the "I'm at Home" SMS bubble) land in
  // correct chronological order instead of jumping above the preview.
  const previewSplitIdxRef = useRef<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Track scroll position so we can offset the scroll when history is
  // inserted at the top, keeping visible content stable (no flash).
  const scrollYRef = useRef(0);
  const historyRevealPendingRef = useRef(false);
  // Only freeze the split once the user has at least one message. If location
  // loads before any message is sent, keep deferring (preview stays at bottom)
  // until a message exists so the first outgoing text doesn't end up below the
  // location card.
  if (previewSplitIdxRef.current === null && showLocationConfirm && detectedLocation && liveChatMessages.length > 0) {
    previewSplitIdxRef.current = liveChatMessages.length;
  }
  const previewSplitIdx = previewSplitIdxRef.current ?? liveChatMessages.length;
  // The medical/profile bubble is pushed right after the preview appears but
  // should render directly below the first text and ABOVE the location preview
  // card. It's tagged `aboveLocation`, so extend the pre-preview slice past any
  // such messages sitting at the split boundary.
  let aboveLocationSplit = previewSplitIdx;
  while (liveChatMessages[aboveLocationSplit]?.aboveLocation) aboveLocationSplit++;
  // The medical info must wait for the location to finish loading before it
  // appears. Until the location preview is fully resolved, keep the
  // `aboveLocation` (medical) messages hidden so they don't show above a still-
  // detecting location card.
  const locationLoaded = showLocationConfirm && !!detectedLocation && !loading;
  const aboveLocationVisibleSplit = locationLoaded ? aboveLocationSplit : previewSplitIdx;
  // Keep preview active unless app is truly backgrounded; Android can momentarily
  // report "inactive" during permission/system overlays which causes black frames.
  const cameraIsActiveProp = camera.videoStreamingActive && ((emergencyCallActive && !!TaskManager?.defineTask) ? true : camera.camAppState !== 'background');

  useEmergencyCallEffects({
    KeepAwake, actions, camera, fromHomeRecording, withVideo: s.withVideo,
    loading, setLoadingDots, emergencyCallActive, psapSmsCapable, psapSmsSessionActive,
    setChatMessages, scrollToBottom, emergencyTypeSelection,
    showLocationConfirm, detectedLocation, medicalProfileSentRef, userLangCode, user,
    sendPsapMessage, setKeyboardHeight, detectedAddresses, initialAddressIndex,
    svHtml, setSvHtml, coneHeading, setConeHeading, locationScanTimerRef,
    lastScannedLocationRef, savedAddresses, prevAddrTimestamps, savedAddrSentRef,
    setExactMatchAddress, setNearbyAddress, setNearbyAddressConfirmed, detectedAddress,
    recordingDotOpacity, chatMessages, lastChatLengthRef, identityPhotosAtTopRef,
    scrollViewRef, savedAddressesLoaded, dispatch, loadSavedAddresses, languageCode, setUserLangCode,
    streetViewPosition, mapCenter, mapZoom, baseMapUrl, mapType, showStreetNames,
    showBusinessNames, mapPin, mapViewRatio, setMapCenter, setBaseMapUrl,
    initialState, lastPanoId, skipRecenterUntil, activeE911EventId,
  });

  const insets = useSafeAreaInsets();
  const leaveE911Screen = React.useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  useFocusEffect(React.useCallback(() => {
    // SMS-only mode: skip auto-detection on focus (will fire on first SMS or call init).
    if (!locationDetectionStartedRef.current && !showInitiateCallButton) {
      locationDetectionStartedRef.current = true;
      setTimeout(() => {
        actions.runLocationDetection();
      }, 100);
    }
    resumeActiveCallIfPresent();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveE911Screen();
      return true;
    });
    return () => sub.remove();
  }, [actions, leaveE911Screen, resumeActiveCallIfPresent]));

  const handleOpenOngoingCallPress = React.useCallback(async () => {
    const opened = await openOngoingCall();
    if (!opened) {
      console.warn('[E911] Unable to open the ongoing call screen.');
    }
  }, [openOngoingCall]);

  return (
    <>
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        {/* Header — background fills all the way up behind the status bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: insets.top + 6, paddingBottom: 6, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View>
            <TouchableOpacity onPress={leaveE911Screen} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 30, lineHeight: 30, color: colors.textPrimary }}>{'‹'}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '300', color: '#FFFFFF' }}>{emergencyNumber}</Text>
            {callInitiated && !callWasEnded && (
              <Text style={{ fontSize: 12, fontWeight: '400', color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
                {String(Math.floor(callElapsed / 60)).padStart(2, '0')}:{String(callElapsed % 60).padStart(2, '0')}
              </Text>
            )}
          </View>
          {/* Call / End-call button — right side */}
          <View style={{ width: 56, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
            {showInitiateUI ? (
              <TouchableOpacity activeOpacity={0.8} onPress={handleInitiateCallPress} accessibilityLabel="Initiate call">
                <Ionicons name="call" size={26} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity activeOpacity={0.8} onPress={handleOpenOngoingCallPress} accessibilityLabel="Open ongoing call screen">
                <Ionicons name="call" size={26} color="#DC2626" style={{ transform: [{ scaleY: -1 }] }} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <ScrollView ref={scrollViewRef} style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingTop: sessionHistory.hasPastSessions ? 44 : 0 }]} scrollEventThrottle={16} alwaysBounceVertical
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onScroll={(e: any) => { scrollYRef.current = e.nativeEvent.contentOffset.y; collapseAnims.handleScrollEvent(e); }}
            onTouchStart={(e: any) => collapseAnims.handleTouchStart(e)}
            onTouchMove={(e: any) => collapseAnims.handleTouchMove(e)}>
          <View
            onLayout={(e: any) => {
              const h = e.nativeEvent.layout.height;
              if (historyRevealPendingRef.current && h > 0) {
                historyRevealPendingRef.current = false;
                scrollViewRef.current?.scrollTo({
                  y: scrollYRef.current + h,
                  animated: false,
                });
              }
            }}
          >
            <EmergencyCallHistory
              revealedSessions={sessionHistory.revealedSessions}
              emergencyNumber={emergencyNumber}
              colors={colors} fs={fs}
            />
          </View>
          <EmergencyTypeBubble
            visible={false} latitude={detectedLocation?.latitude ?? null} longitude={detectedLocation?.longitude ?? null}
            psapSmsCapable={psapSmsCapable} enlargedText={textScale}
            userName={user?.first_name ? (user.first_name + ' ' + (user.last_name || '')).trim() : undefined}
            onSelection={() => {}} onSendFailed={(failed: boolean) => setEmergencyTypeSendFailed(failed)}
            onRetryRef={emergencyTypeRetryRef} triggerSelectRef={emergencyTypeTriggerRef}
          />
          {/* Split messages around the location preview card so messages added
              before location was triggered render above it and later ones
              render below. When previewSplitIdx hasn't frozen yet, all
              messages go to the first list — identical to a flat layout. */}
            <>
              <EmergencyCallMessageList
                chatMessages={liveChatMessages} baseIndex={liveMessageStartIndex} sliceEnd={aboveLocationVisibleSplit} lastLocationMsgIdx={lastLocationMsgIdx}
                openLocationNavigator={actions.openLocationNavigator} handleRelocationResponse={actions.handleRelocationResponse}
                hasCamPermission={camera.hasCamPermission} activeCamDevice={camera.activeCamDevice}
                cameraIsActiveProp={cameraIsActiveProp} cameraRef={camera.cameraRef}
                cameraReadyRef={camera.cameraReadyRef}
                hasMicPermission={camera.hasMicPermission} onCameraInitialized={camera.onCameraInitialized}
                videoCollapseAnim={collapseAnims.videoCollapseAnim} videoBubbleRef={collapseAnims.videoBubbleRef as any}
                videoBubbleRendered={camera.videoBubbleRendered} setVideoBubbleRendered={camera.setVideoBubbleRendered}
                expandedAnims={collapseAnims.expandedAnims} expandOne={collapseAnims.expandOne}
                setVideoExpanded={camera.setVideoExpanded} takePictureAndSend={camera.takePictureAndSend}
                takingPicture={camera.takingPicture} startCameraRecording={camera.startCameraRecording} stopCameraRecording={camera.stopCameraRecording}
                videoStreamingActive={camera.videoStreamingActive}
                setVideoStreamingActive={camera.setVideoStreamingActive}
                videoSessionCount={camera.videoSessionCount}
                videoBubblePushedRef={camera.videoBubblePushedRef}
                getRelocationAnim={collapseAnims.getRelocationAnim} relocationThumbRefs={collapseAnims.relocationThumbRefs}
                getChatImageAnim={collapseAnims.getChatImageAnim} chatImageThumbRefs={collapseAnims.chatImageThumbRefs}
                recordingDotOpacity={recordingDotOpacity} activeCamera={camera.activeCamera} setActiveCamera={camera.setActiveCamera}
                isLandscape={isLandscape}
                setChatMessages={setChatMessages} detectedLocation={detectedLocation}
                sendPsapMessage={sendPsapMessage}
                onImagePress={setSelectedMediaMessageId}
                textScale={textScale} colors={colors} collapseH={collapseH} btnLabel={btnLabel} fs={fs} styles={styles}
              />
              <EmergencyLocationPreview
                loading={loading} showLocationConfirm={showLocationConfirm} detectedLocation={detectedLocation}
                loadingDots={loadingDots} mapExpanded={mapExpanded} exactMatchAddress={exactMatchAddress}
                nearbyAddress={nearbyAddress} nearbyAddressConfirmed={nearbyAddressConfirmed}
                setNearbyAddressConfirmed={setNearbyAddressConfirmed} savedAddrSentRef={savedAddrSentRef}
                buildDispatcherInfo={buildDispatcherInfo} sendPsapMessage={sendPsapMessage}
                setChatMessages={setChatMessages} previewAddressText={previewAddressText}
                detectedAddresses={detectedAddresses} initialAddressIndex={initialAddressIndex}
                currentAddressIndex={currentAddressIndex} streetViewPosition={streetViewPosition}
                streetViewUrl={streetViewUrl} lastPanoId={lastPanoId} lastLocationMsgIdx={lastLocationMsgIdx}
                openLocationNavigator={actions.openLocationNavigator}
                locationCollapseAnim={collapseAnims.locationCollapseAnim}
                locationThumbRef={collapseAnims.locationThumbRef as any}
                expandedAnims={collapseAnims.expandedAnims} expandOne={collapseAnims.expandOne}
                collapseH={collapseH} pinnedIdentityImages={pinnedIdentityImages}
                identityThumbRefs={collapseAnims.identityThumbRefs} getIdentityAnim={collapseAnims.getIdentityAnim}
                colors={colors} styles={styles} fs={fs} t={t} btnLabel={btnLabel} baseMapUrl={baseMapUrl}
              />
              <EmergencyCallMessageList
                chatMessages={liveChatMessages} baseIndex={liveMessageStartIndex} sliceStart={aboveLocationSplit} lastLocationMsgIdx={lastLocationMsgIdx}
                openLocationNavigator={actions.openLocationNavigator} handleRelocationResponse={actions.handleRelocationResponse}
                hasCamPermission={camera.hasCamPermission} activeCamDevice={camera.activeCamDevice}
                cameraIsActiveProp={cameraIsActiveProp} cameraRef={camera.cameraRef}
                cameraReadyRef={camera.cameraReadyRef}
                hasMicPermission={camera.hasMicPermission} onCameraInitialized={camera.onCameraInitialized}
                videoCollapseAnim={collapseAnims.videoCollapseAnim} videoBubbleRef={collapseAnims.videoBubbleRef as any}
                videoBubbleRendered={camera.videoBubbleRendered} setVideoBubbleRendered={camera.setVideoBubbleRendered}
                expandedAnims={collapseAnims.expandedAnims} expandOne={collapseAnims.expandOne}
                setVideoExpanded={camera.setVideoExpanded} takePictureAndSend={camera.takePictureAndSend}
                takingPicture={camera.takingPicture} startCameraRecording={camera.startCameraRecording} stopCameraRecording={camera.stopCameraRecording}
                videoStreamingActive={camera.videoStreamingActive}
                setVideoStreamingActive={camera.setVideoStreamingActive}
                videoSessionCount={camera.videoSessionCount}
                videoBubblePushedRef={camera.videoBubblePushedRef}
                getRelocationAnim={collapseAnims.getRelocationAnim} relocationThumbRefs={collapseAnims.relocationThumbRefs}
                getChatImageAnim={collapseAnims.getChatImageAnim} chatImageThumbRefs={collapseAnims.chatImageThumbRefs}
                recordingDotOpacity={recordingDotOpacity} activeCamera={camera.activeCamera} setActiveCamera={camera.setActiveCamera}
                isLandscape={isLandscape}
                setChatMessages={setChatMessages} detectedLocation={detectedLocation}
                sendPsapMessage={sendPsapMessage}
                onImagePress={setSelectedMediaMessageId}
                textScale={textScale} colors={colors} collapseH={collapseH} btnLabel={btnLabel} fs={fs} styles={styles}
              />
            </>
          {emergencyTypeSendFailed && (loading || (showLocationConfirm && detectedLocation)) && (
            <View style={[styles.previewCard, { marginBottom: 12 }]}>
              <View style={styles.chatSection}><View style={styles.chatRowLeft}><View style={styles.chatBubbleLeft}>
                <Text style={[styles.chatText, { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0, fontSize: fs(13), lineHeight: fs(18) }]}>We could not register your selection</Text>
                <TouchableOpacity onPress={() => emergencyTypeRetryRef.current?.()} activeOpacity={0.7} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10, marginHorizontal: 12, marginBottom: 10, alignSelf: 'stretch', alignItems: 'center' }}>
                  <Text style={btnLabel}>Retry</Text>
                </TouchableOpacity>
              </View></View></View>
            </View>
          )}
        </ScrollView>
        {sessionHistory.hasPastSessions && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 6, paddingBottom: 6, backgroundColor: 'transparent' }}>
            <TouchableOpacity
              activeOpacity={0.85}
              accessibilityLabel={showHistory ? 'Hide chat history' : 'Show chat history'}
              onPress={() => {
                if (showHistory) {
                  sessionHistory.clearRevealedSessions();
                  setShowHistory(false);
                } else {
                  historyRevealPendingRef.current = true;
                  sessionHistory.revealAllSessions();
                  setShowHistory(true);
                }
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <Ionicons name={showHistory ? 'eye-off-outline' : 'time-outline'} size={14} color={colors.textPrimary} />
              <Text style={{ color: colors.textPrimary, fontSize: fs(12), fontWeight: '600' }}>{showHistory ? 'Hide Chat History' : 'Chat History'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
        <EmergencyCallInput
          colors={colors} styles={styles} fs={fs} t={t} loading={loading}
          showLocationConfirm={showLocationConfirm} detectedLocation={detectedLocation} mapExpanded={mapExpanded}
          silentModeActive={silentMode.silentModeActive} silentBannerDismissed={silentMode.silentBannerDismissed}
          setSilentBannerDismissed={silentMode.setSilentBannerDismissed} volumeState={silentMode.volumeState}
          dispatcherNotified={silentMode.dispatcherNotified}
          textScale={textScale} psapSmsCapable={psapSmsCapable} sendPsapMessage={sendPsapMessage}
          setChatMessages={setChatMessages} scrollToBottom={scrollToBottom}
          emergencyTypeSelection={emergencyTypeSelection} setEmergencyTypeSelection={setEmergencyTypeSelection}
          emergencyTypeTriggerRef={emergencyTypeTriggerRef} showQuickResponses={showQuickResponses}
          cprAlertSent={cprAlertSent} mapPin={mapPin} pinFullAddress={pinFullAddress}
          handleCprNeeded={actions.handleCprNeeded} isLocationTextRef={isLocationTextRef}
          setLocationReplyText={setLocationReplyText} hasCamPermission={camera.hasCamPermission}
          activeCamDevice={camera.activeCamDevice} videoStreamingActive={camera.videoStreamingActive}
          videoSessionCount={camera.videoSessionCount} setVideoStreamingActive={camera.setVideoStreamingActive}
          videoCollapseAnim={collapseAnims.videoCollapseAnim} videoPeeked={collapseAnims.videoPeeked}
          startCameraRecording={camera.startCameraRecording} camDenyCount={camera.camDenyCount}
          showCamPermAlert={camera.showCamPermAlert} setShowCamPermAlert={camera.setShowCamPermAlert}
          setUserJustEnabledCamera={camera.setUserJustEnabledCamera} showLocationConfirmState={showLocationConfirm}
          setCameraGrantedAfterLocation={camera.setCameraGrantedAfterLocation}
          locationReplyText={locationReplyText} sendMessage={actions.sendMessage} sendDirectMessage={actions.sendDirectMessage} sendMedicalInfoIfNeeded={actions.sendMedicalInfoIfNeeded} setBottomAreaHeight={setBottomAreaHeight}
          pendingAttachments={attachmentPicker.pendingAttachments}
          pickImage={attachmentPicker.pickImage}
          clearAttachments={attachmentPicker.clearAttachments}
        />
      </SafeAreaView>
      {mapExpanded && (
        <EmergencyMapNavigator
          colors={colors} styles={styles} fs={fs} t={t} mapType={mapType} setMapType={setMapType}
          showStreetNames={showStreetNames} setShowStreetNames={setShowStreetNames}
          showBusinessNames={showBusinessNames} setShowBusinessNames={setShowBusinessNames}
          insideOutside={insideOutside} setInsideOutside={setInsideOutside}
          floorType={floorType} setFloorType={setFloorType} floorNumber={floorNumber} setFloorNumber={setFloorNumber}
          confirmedFloor={confirmedFloor} mapSectionHeight={mapSectionHeight} setMapSectionHeight={setMapSectionHeight}
          mapViewRatio={mapViewRatio} setMapViewRatio={setMapViewRatio}
          isDraggingDivider={isDraggingDivider} setIsDraggingDivider={setIsDraggingDivider}
          baseMapUrl={baseMapUrl} mapContainerSize={mapContainerSize} setMapContainerSize={setMapContainerSize}
          streetViewPosition={streetViewPosition} mapCenter={mapCenter} mapZoom={mapZoom} setMapZoom={setMapZoom}
          coneHeading={coneHeading} mapPin={mapPin} setMapPin={setMapPin} setPinFullAddress={s.setPinFullAddress}
          mapPanOffset={mapPanOffset} setMapPanOffset={setMapPanOffset} mapPanOffsetRef={mapPanOffsetRef}
          mapModified={mapModified} setMapModified={setMapModified} showArrow={showArrow} setShowArrow={setShowArrow}
          detectedAddresses={detectedAddresses} currentAddressIndex={currentAddressIndex}
          detectedLocation={detectedLocation} svHtml={svHtml} webViewRef={webViewRef}
          webViewKey={webViewKey} controlsVisible={controlsVisible} pan={pan}
          isRotating={isRotating} setIsRotating={setIsRotating} joystickSize={joystickSize}
          knobSize={knobSize} maxDistance={maxDistance} currentHeading={currentHeading}
          setJoystickPosition={setJoystickPosition} pinchStartRef={pinchStartRef} panMidpointRef={panMidpointRef}
          lastPanoId={lastPanoId} initialState={initialState} initialStateSettled={initialStateSettled}
          skipRecenterUntil={skipRecenterUntil} tapStartRef={tapStartRef} mapContainerRef={mapContainerRef}
          lastResetTime={lastResetTime} streetViewUrl={streetViewUrl}
          addressSearchText={addressSearchText} setAddressSearchText={setAddressSearchText}
          addressSearching={addressSearching} addressSearchFocused={addressSearchFocused}
          setAddressSearchFocused={setAddressSearchFocused} searchAddress={actions.searchAddress}
          buildMapUrl={actions.buildMapUrl} setConeHeading={setConeHeading}
          setStreetViewPosition={setStreetViewPosition} setBaseMapUrl={setBaseMapUrl}
          setMapCenter={setMapCenter} setMapExpanded={setMapExpanded}
          bottomAreaHeight={bottomAreaHeight} searchToggleHeight={searchToggleHeight} setSearchToggleHeight={setSearchToggleHeight}
          calculateHeading={calculateHeading}
        />
      )}
      <FullScreenChatMediaViewer
        visible={selectedMediaMessageId !== null}
        media={e911MediaMessages}
        initialMessageId={selectedMediaMessageId}
        senderTitle="PSAP"
        address={emergencyNumber}
        starredMessageIds={[]}
        onClose={() => setSelectedMediaMessageId(null)}
        onDelete={(message) => {
          setChatMessages((prev) =>
            prev.filter((m: any, idx: number) => (m.id || `e911-media-${idx}`) !== message.id)
          );
          setSelectedMediaMessageId(null);
        }}
        onToggleStar={() => {}}
      />
    </>
  );
};

export default EmergencyCallScreen;
