import React, { useEffect, useState } from 'react';
import type { EmergencyMessageStateSetter } from './emergencyCallMessageTypes';
import {
  Image, View, TouchableOpacity, ScrollView, TextInput, Keyboard,
  PermissionsAndroid, Linking, Modal, Animated,
} from 'react-native';
import AppText from '../../components/AppText';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import SilentCallBanner from './SilentCallBanner';
import SilentCallChat from './SilentCallChat';
import type { PendingAttachment } from '../../hooks/useAttachmentPicker';

const Text = AppText;

interface Props {
  colors: any; styles: any; fs: (n: number) => number; t: (k: string) => string;
  // state / location
  loading: boolean; showLocationConfirm: boolean; detectedLocation: any; mapExpanded: boolean;
  // silent mode
  silentModeActive: boolean; silentBannerDismissed: boolean; setSilentBannerDismissed: (v: boolean) => void;
  volumeState: any; dispatcherNotified: boolean; textScale: number;
  psapSmsCapable: any; sendPsapMessage: (msg: string, lat?: number, lng?: number) => Promise<boolean>;
  setChatMessages: EmergencyMessageStateSetter; scrollToBottom: (d?: number) => void;
  // emergency type strip
  emergencyTypeSelection: string | null; setEmergencyTypeSelection: (v: string | null) => void;
  emergencyTypeTriggerRef: React.MutableRefObject<((t: 'Medical' | 'Fire' | 'Law Enforcement (Police)') => void) | null>;
  // quick responses
  showQuickResponses: boolean; cprAlertSent: boolean; mapPin: any; pinFullAddress: string | null;
  handleCprNeeded: () => void; isLocationTextRef: React.MutableRefObject<boolean>;
  setLocationReplyText: (v: string) => void;
  // camera
  hasCamPermission: boolean; activeCamDevice: any; videoStreamingActive: boolean;
  videoSessionCount: React.MutableRefObject<number>; setVideoStreamingActive: (v: boolean) => void;
  videoCollapseAnim: Animated.Value; videoPeeked: React.MutableRefObject<boolean>;
  startCameraRecording: () => void; camDenyCount: React.MutableRefObject<number>;
  showCamPermAlert: boolean; setShowCamPermAlert: (v: boolean) => void;
  setUserJustEnabledCamera: (v: boolean) => void; showLocationConfirmState: boolean;
  setCameraGrantedAfterLocation: (v: boolean) => void;
  sendMedicalInfoIfNeeded: () => void;
  // text input
  locationReplyText: string; sendMessage: () => void; sendDirectMessage: (text: string) => void;
  setBottomAreaHeight: (v: number) => void;
  pendingAttachments: PendingAttachment[];
  pickImage: () => void;
  clearAttachments: () => void;
}

export const EmergencyCallInput: React.FC<Props> = ({
  colors, styles, fs, t, loading, detectedLocation, mapExpanded,
  silentModeActive, silentBannerDismissed, setSilentBannerDismissed, volumeState,
  dispatcherNotified, textScale, psapSmsCapable, sendPsapMessage,
  setChatMessages, scrollToBottom, emergencyTypeSelection, setEmergencyTypeSelection,
  emergencyTypeTriggerRef, showQuickResponses, cprAlertSent, mapPin, pinFullAddress,
  handleCprNeeded, setLocationReplyText, hasCamPermission, activeCamDevice,
  videoStreamingActive, videoSessionCount, setVideoStreamingActive, videoCollapseAnim,
  videoPeeked, startCameraRecording, camDenyCount, showCamPermAlert, setShowCamPermAlert,
  setUserJustEnabledCamera, showLocationConfirmState, setCameraGrantedAfterLocation,
  sendMedicalInfoIfNeeded, locationReplyText, sendMessage, sendDirectMessage, setBottomAreaHeight,
  pendingAttachments, pickImage, clearAttachments,
}) => {
  const hasPendingAttachments = pendingAttachments.length > 0;
  const showVideoButton = !(hasCamPermission && activeCamDevice) || !videoStreamingActive;
  const inputLeftPadding = showVideoButton ? 68 : 42;

  // Track keyboard height to push the input area up (same approach as ChatInputBar)
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  return (
  <>
    {true && (
      <View
        style={[styles.bottomInputArea, { marginBottom: keyboardHeight }]}
        onLayout={(e) => { if (mapExpanded) setBottomAreaHeight(e.nativeEvent.layout.height); }}
      >
        {silentModeActive && !silentBannerDismissed && (
          <SilentCallBanner
            isMuted={volumeState.isMuted} volumePercent={volumeState.volumePercentage}
            dispatcherNotified={dispatcherNotified}
            onDismiss={() => setSilentBannerDismissed(true)} textScale={textScale}
          />
        )}
        {silentModeActive && (
          <View style={{ maxHeight: 220, marginHorizontal: 10, marginBottom: 6 }}>
            <SilentCallChat
              sendPsapMessage={sendPsapMessage}
              psapSmsCapable={!!(psapSmsCapable?.capable || psapSmsCapable?.smsCapable)}
              textScale={textScale}
              onUserMessage={(text) => { setChatMessages(prev => [...prev, { text: `[Silent] ${text}`, type: 'chat' as const }]); scrollToBottom(); }}
            />
          </View>
        )}
        {!emergencyTypeSelection && !mapExpanded ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickResponseContainer} contentContainerStyle={styles.quickResponseContent}>
            {([
              { label: 'This is a medical emergency', short: 'Medical emergency...', type: 'Medical' as const },
              { label: 'This is a fire emergency', short: 'Fire emergency...', type: 'Fire' as const },
              { label: 'I need law enforcement (police)', short: 'Police needed...', type: 'Law Enforcement (Police)' as const },
            ] as const).map(({ label, short, type }) => (
              <TouchableOpacity key={type} style={styles.quickResponseButton}
                onPress={() => { setEmergencyTypeSelection(label); setChatMessages(prev => [...prev, { type: 'user', text: label }]); emergencyTypeTriggerRef.current?.(type); sendMedicalInfoIfNeeded(); }}>
                <Text style={[styles.quickResponseText, { fontSize: fs(12) }]} numberOfLines={1}>{short}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : showQuickResponses && !mapExpanded ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickResponseContainer} contentContainerStyle={styles.quickResponseContent}>
            {emergencyTypeSelection === 'This is a medical emergency' ? (
              <>
                {!cprAlertSent && (
                  <TouchableOpacity style={[styles.quickResponseButton, { borderColor: '#dc2626', borderWidth: 1 }]} onPress={handleCprNeeded}>
                    <Text style={[styles.quickResponseText, { fontSize: fs(12), color: '#fca5a5' }]} numberOfLines={1}>❤️ CPR needed</Text>
                  </TouchableOpacity>
                )}
                {(['Someone is unconscious', 'Someone is choking', 'There is severe bleeding', "I'm having chest pains", "I can't breathe"] as const).map((msg) => (
                  <TouchableOpacity key={msg} style={styles.quickResponseButton} onPress={() => sendDirectMessage(msg)}>
                    <Text style={[styles.quickResponseText, { fontSize: fs(12) }]} numberOfLines={1}>{msg}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : emergencyTypeSelection === 'This is a fire emergency' ? (
              <>
                {(["I'm trapped inside", 'The fire is spreading rapidly', 'There is smoke but no visible flames', 'Someone has been burnt or injured', 'We have evacuated'] as const).map((msg) => (
                  <TouchableOpacity key={msg} style={styles.quickResponseButton} onPress={() => sendDirectMessage(msg)}>
                    <Text style={[styles.quickResponseText, { fontSize: fs(12) }]} numberOfLines={1}>{msg}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : emergencyTypeSelection === 'I need law enforcement (police)' ? (
              <>
                {(['There is an active threat / armed person', 'Someone is breaking in', "I'm being followed / stalked", "I'm currently running away from someone towards...", 'This is a domestic violence situation'] as const).map((msg) => (
                  <TouchableOpacity key={msg} style={styles.quickResponseButton} onPress={() => sendDirectMessage(msg)}>
                    <Text style={[styles.quickResponseText, { fontSize: fs(12) }]} numberOfLines={1}>{msg}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.quickResponseButton}
                  onPress={() => sendDirectMessage(mapPin && pinFullAddress ? `The emergency isn't me, the emergency is located at ${pinFullAddress}` : "I'm in a moving vehicle, I can't talk.")}>
                  <Text style={[styles.quickResponseText, { fontSize: fs(12) }]}>{mapPin && pinFullAddress ? t("The emergency isn't me...") : t("I'm in a moving vehicle, I can't talk.")}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickResponseButton}
                  onPress={() => sendDirectMessage("I'm currently running away from someone towards...")}>
                  <Text style={[styles.quickResponseText, { fontSize: fs(12) }]}>{t("I'm currently running away from someone towards...")}</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        ) : null}
        {hasPendingAttachments && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, paddingBottom: 6 }}>
            {pendingAttachments.map((att, i) => (
              <View key={`${att.uri}-${i}`} style={{ position: 'relative' }}>
                <Image
                  source={{ uri: att.uri }}
                  style={{ width: 48, height: 48, borderRadius: 6, backgroundColor: colors.border }}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={clearAttachments}
                  style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.surface, borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}
                  accessibilityLabel="Remove pending photo"
                >
                  <Ionicons name="close-circle" size={18} color={colors.error || '#EF4444'} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={clearAttachments} style={{ marginLeft: 4 }} accessibilityLabel="Clear pending photos">
              <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.chatInputWrap} onLayout={(_e) => {}}>
          {showVideoButton && (
            <TouchableOpacity
              style={{ position: 'absolute', left: 38, top: 0, bottom: 0, justifyContent: 'center', zIndex: 2, paddingHorizontal: 2 }}
              onPress={async () => {
                if (!videoStreamingActive && hasCamPermission && activeCamDevice) {
                  videoSessionCount.current += 1; setVideoStreamingActive(true);
                  videoCollapseAnim.setValue(0); videoPeeked.current = false;
                  setTimeout(() => startCameraRecording(), 500); scrollToBottom(600);
                  // Notify the PSAP that a live video stream has been requested.
                  sendPsapMessage(
                    'Can we connect through video so i can show you live feed of the emergency',
                    detectedLocation?.latitude,
                    detectedLocation?.longitude,
                  ).catch(() => {});
                  return;
                }
                camDenyCount.current += 1;
                if (camDenyCount.current >= 3) { setShowCamPermAlert(true); return; }
                const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
                if (result === PermissionsAndroid.RESULTS.GRANTED) {
                  camDenyCount.current = 0; setUserJustEnabledCamera(true);
                  if (showLocationConfirmState && detectedLocation) setCameraGrantedAfterLocation(true);
                  // ⬇ Start video immediately after granting permission
                  videoSessionCount.current += 1; setVideoStreamingActive(true);
                  videoCollapseAnim.setValue(0); videoPeeked.current = false;
                  setTimeout(() => startCameraRecording(), 800); scrollToBottom(600);
                }
              }}
              accessibilityLabel="Activate camera" activeOpacity={0.7}
            >
              <Ionicons name="videocam-outline" size={20} color="#e53935" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{ position: 'absolute', left: 8, top: 0, bottom: 0, justifyContent: 'center', zIndex: 2, paddingHorizontal: 2 }}
            onPress={pickImage}
            accessibilityLabel="Attach photo"
            activeOpacity={0.7}
          >
            <Ionicons name="image-outline" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <TextInput
            value={locationReplyText} onChangeText={setLocationReplyText}
            style={[styles.chatInput, { paddingLeft: inputLeftPadding, fontSize: fs(13) }]}
            multiline placeholder="Type a message..." placeholderTextColor={colors.inputPlaceholder}
            cursorColor="rgba(255,255,255,0.3)" selectionColor="rgba(255,255,255,0.3)"
            onSubmitEditing={sendMessage} blurOnSubmit={false} returnKeyType="send"
          />
          <TouchableOpacity style={[styles.chatSendIconButton, loading && styles.buttonDisabled]}
            onPress={sendMessage} disabled={loading || (!locationReplyText.trim() && !hasPendingAttachments)}>
            <Ionicons name="send" size={18} color="rgba(255,255,255,0.7)" style={!locationReplyText.trim() && !hasPendingAttachments ? { opacity: 0.3 } : undefined} />
          </TouchableOpacity>
        </View>
      </View>
    )}
    <Modal visible={showCamPermAlert} transparent animationType="fade" onRequestClose={() => setShowCamPermAlert(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 24, width: '100%', maxWidth: 340 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>Camera Permission Denied</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 20 }}>You've denied camera access too many times. Android has blocked the permission dialog. To activate live video streaming, you'll need to enable camera access manually in your phone's settings.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => setShowCamPermAlert(false)} activeOpacity={0.7} style={{ flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowCamPermAlert(false); Linking.openSettings(); }} activeOpacity={0.7} style={{ flex: 1, backgroundColor: colors.accent, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </>
  );
};
