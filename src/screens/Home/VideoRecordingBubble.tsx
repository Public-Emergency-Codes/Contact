/** VideoRecordingBubble - camera-preview card or headless recorder.
 *  Supports dual-camera (PIP) mode on devices that expose concurrent sessions
 *  via Camera2 (Android 11+). Falls back to single-camera on unsupported hardware.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  PermissionsAndroid,
  AppState,
} from 'react-native';
import AppText from '../../components/AppText';
const Text = AppText;
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface VideoRecordingBubbleProps {
  isActive?: boolean;
  onClipSaved?: (path: string) => void;
  onReady?: (handle: VideoRecordingHandle) => void;
  headless?: boolean;
  children?: React.ReactNode;
}

export interface VideoRecordingHandle {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  isRecording: () => boolean;
}

const VideoRecordingBubble: React.FC<VideoRecordingBubbleProps> = ({
  isActive = true,
  onClipSaved,
  onReady,
  headless = false,
  children,
}) => {
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const [activeCamera, setActiveCamera] = useState<'front' | 'back'>('back');
  const [hasMic, setHasMic] = useState(false);
  const [permRequested, setPermRequested] = useState(false);
  const [dualSupported, setDualSupported] = useState(false);
  const [dualMode, setDualMode] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [locationChecked, setLocationChecked] = useState(false);

  const mainRef = useRef<any>(null);
  const pipRef = useRef<any>(null);
  const recording = useRef(false);
  const dotOpacity = useRef(new Animated.Value(1)).current;

  /* Check if device supports concurrent front+back cameras */
  useEffect(() => {
    try {
      const groups: string[][] = (Camera as any).getConcurrentCameraIds?.() ?? [];
      if (frontDevice && backDevice) {
        const ok = groups.some(g => g.includes(frontDevice.id) && g.includes(backDevice.id));
        setDualSupported(ok);
      }
    } catch {
      setDualSupported(false);
    }
  }, [frontDevice, backDevice]);

  /* Mic permission — only request when the user actually activates recording */
  useEffect(() => {
    if (!isActive && headless) return;
    (async () => {
      if (Platform.OS === 'android') {
        const s = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          { title: 'Microphone', message: 'Needed for video recording.', buttonPositive: 'Allow' },
        );
        setHasMic(s === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        setHasMic(true);
      }
    })();
  }, [isActive, headless]);

  /* Camera permission — only request when the user actually activates recording */
  useEffect(() => {
    if (!isActive && headless) return;
    if (!hasPermission && !permRequested) {
      setPermRequested(true);
      requestPermission();
    }
  }, [hasPermission, permRequested, isActive, headless]);

  /* Location permission — used to gate the camera preview */
  const refreshLocationPermission = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setHasLocationPermission(status === 'granted');
    } finally {
      setLocationChecked(true);
    }
  }, []);

  useEffect(() => {
    refreshLocationPermission();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshLocationPermission();
    });
    return () => sub.remove();
  }, [refreshLocationPermission]);

  /* Blinking recording dot */
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dotOpacity]);

  const saveClip = useCallback(async (video: any) => {
    try {
      const dest = `${FileSystem.documentDirectory}emergency_recording_${Date.now()}.mp4`;
      const src = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
      await FileSystem.moveAsync({ from: src, to: dest });
      onClipSaved?.(dest);
    } catch (e) {
      console.error('VideoRecordingBubble: save failed', e);
    }
  }, [onClipSaved]);

  const startCamRec = (ref: React.MutableRefObject<any>) => {
    if (!ref.current) return;
    ref.current.startRecording({
      onRecordingFinished: saveClip,
      onRecordingError: (err: any) => {
        if (err?.message?.includes('no data') || err?.code === 'capture/no-data') return;
        console.error('rec error', err);
      },
    });
  };

  const startRecording = async () => {
    if (recording.current) return;
    recording.current = true;
    startCamRec(mainRef);
    if (dualMode) startCamRec(pipRef);
  };

  const stopRecording = async () => {
    if (!recording.current) return;
    recording.current = false;
    for (const ref of [mainRef, pipRef]) {
      if (!ref.current) continue;
      try { await ref.current.stopRecording(); } catch (e: any) {
        if (!e?.message?.includes('no-recording-in-progress')) console.error('stop err', e);
      }
    }
  };

  /* Re-expose handle whenever dualMode changes */
  useEffect(() => {
    onReady?.({ startRecording, stopRecording, isRecording: () => recording.current });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dualMode]);

  const mainDevice = dualMode ? backDevice : (activeCamera === 'front' ? frontDevice : backDevice);

  if (!hasPermission || !mainDevice || !locationChecked || hasLocationPermission === false) {
    if (headless) return null;
    return (
      <View style={st.placeholder}>
        <Ionicons name="videocam-outline" size={32} color="#9CA3AF" />
        <Text style={st.placeholderText}>{locationChecked ? 'Start Video Recording' : 'Loading camera permissions...'}</Text>
      </View>
    );
  }

  return (
    <View style={[st.wrapper, !headless && st.wrapperVisible]}>
      <View style={headless ? st.hiddenCam : st.cameraBox}>
        {/* Main camera - back in dual mode, user-chosen in single mode */}
        <Camera
          ref={mainRef}
          style={headless ? { width: 1, height: 1 } : StyleSheet.absoluteFill}
          device={mainDevice}
          isActive={isActive}
          photo video audio={hasMic}
          outputOrientation="device"
          onError={(e) => console.error('Main cam error', e)}
          androidPreviewViewType="texture-view"
        />

        {/* PIP: front camera overlay - only mounted when dualMode is on */}
        {dualMode && frontDevice && !headless && (
          <View style={st.pip}>
            <Camera
              ref={pipRef}
              style={StyleSheet.absoluteFill}
              device={frontDevice}
              isActive={isActive}
              photo video audio={false}
              outputOrientation="device"
              onError={(e) => console.error('PIP cam error', e)}
              androidPreviewViewType="texture-view"
            />
          </View>
        )}
      </View>

      {/* Recording badge */}
      {!headless && recording.current && (
        <View style={[st.badge, { top: insets.top + 12 }]}>
          <Animated.View style={[st.dot, { opacity: dotOpacity }]} />
          <Text style={st.badgeText}>{dualMode ? 'DUAL REC' : 'REC'}</Text>
        </View>
      )}

      {/* Dual-mode toggle - only visible when hardware supports it */}
      {!headless && dualSupported && (
        <TouchableOpacity
          style={[st.dualBtn, { top: insets.top + 60 }, dualMode && st.dualBtnActive]}
          onPress={() => setDualMode(p => !p)}
          activeOpacity={0.7}
        >
          <Ionicons name="layers-outline" size={20} color="#FFF" />
        </TouchableOpacity>
      )}

      {/* Flip button - hidden in dual mode since both cameras are already active */}
      {!headless && !dualMode && (
        <TouchableOpacity
          style={st.flipBtn}
          onPress={() => setActiveCamera(p => p === 'front' ? 'back' : 'front')}
          activeOpacity={0.7}
        >
          <Ionicons name="camera-reverse-outline" size={32} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      )}

      {children}
    </View>
  );
};

export default VideoRecordingBubble;

const st = StyleSheet.create({
  wrapper: { width: '100%' },
  wrapperVisible: { flex: 1 },
  hiddenCam: { width: 1, height: 1, overflow: 'hidden', position: 'absolute', opacity: 0 },
  cameraBox: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
  placeholder: { flex: 1, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center', gap: 8 },
  placeholderText: { color: '#9CA3AF', fontSize: 15, fontWeight: '600' },
  badge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 5 },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  flipBtn: { position: 'absolute', top: '50%', alignSelf: 'center', marginTop: -20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  pip: { position: 'absolute', bottom: 16, right: 16, width: 110, height: 150, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  dualBtn: { position: 'absolute', top: 60, right: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  dualBtnActive: { backgroundColor: '#3B82F6' },
});
