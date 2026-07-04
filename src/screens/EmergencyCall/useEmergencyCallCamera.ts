import { useState, useRef, useEffect, useCallback } from 'react';
import type { EmergencyMessageStateSetter } from './emergencyCallMessageTypes';
import { AppState, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleanupCameraCache } from '../../utils/cameraCleanup';
import { EMERGENCY_TEST_NUMBER } from '../../services/runtimeConfig';
import videoRecordingService from '../../services/videoRecordingService';
import { inCallService } from '../../services/inCallService';
import {
  isDirectSmsAvailable,
} from '../../services/directSmsMediaService';

const { DirectSms } = NativeModules;

interface UseEmergencyCallCameraParams {
  setChatMessages: EmergencyMessageStateSetter;
  scrollToBottom: (delay?: number) => void;
  detectedLocation: any;
  fromHomeRecording: boolean;
  psapNumber?: string;
}

export const useEmergencyCallCamera = ({
  setChatMessages, scrollToBottom, fromHomeRecording, psapNumber,
}: UseEmergencyCallCameraParams) => {
  const { hasPermission: hasCamPermission, requestPermission: requestCamPermission } = useCameraPermission();
  const frontCameraDevice = useCameraDevice('front');
  const backCameraDevice = useCameraDevice('back');
  const [activeCamera, setActiveCamera] = useState<'front' | 'back'>('front');
  const [videoExpanded, setVideoExpanded] = useState(false);
  const [camAppState, setCamAppState] = useState(AppState.currentState);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [videoBubbleRendered, setVideoBubbleRendered] = useState(false);
  const [showCamPermAlert, setShowCamPermAlert] = useState(false);
  const [userJustEnabledCamera, setUserJustEnabledCamera] = useState(false);
  const [cameraGrantedAfterLocation, setCameraGrantedAfterLocation] = useState(false);
  const [videoStreamingActive, setVideoStreamingActiveState] = useState(false);
  const [takingPicture, setTakingPicture] = useState(false);
  const cameraRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const recordingRequestedRef = useRef(false);
  const videoStreamingActiveRef = useRef(false);
  const videoSessionCount = useRef(0);
  const camDenyCount = useRef(0);
  const videoBubblePushedRef = useRef(false);

  // Keep the lifecycle ref synchronous with callers. Native recording
  // callbacks can run before React commits the corresponding state update.
  const setVideoStreamingActive = useCallback((active: boolean) => {
    videoStreamingActiveRef.current = active;
    if (!active) recordingRequestedRef.current = false;
    setVideoStreamingActiveState(active);
  }, []);

  const stopCameraRecording = useCallback(async () => {
    recordingRequestedRef.current = false;
    if (!isRecordingRef.current || !cameraRef.current) return;
    try {
      await cameraRef.current.stopRecording();
      isRecordingRef.current = false;
    } catch (e: any) {
      if (e?.message?.includes('no-recording-in-progress') || e?.code === 'capture/no-recording-in-progress') {
        isRecordingRef.current = false;
        return;
      }
      console.error('Failed to stop recording:', e);
    }
  }, []);

  const activeCamDevice = activeCamera === 'front'
    ? (frontCameraDevice || backCameraDevice)
    : (backCameraDevice || frontCameraDevice);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setCamAppState(next));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') {
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          { title: 'Microphone Permission', message: 'This app needs microphone access to record emergency video with audio.', buttonPositive: 'Allow' }
        );
        setHasMicPermission(status === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        setHasMicPermission(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (videoStreamingActive) {
      videoRecordingService.start('e911');
    } else {
      // Stop the native camera recording so the microphone is released
      // when the video stream is turned off (e.g. call ended).
      stopCameraRecording();
      videoRecordingService.stopIfOrigin('e911');
      videoSessionCount.current = 0;
    }
    if (!videoStreamingActive) {
      videoBubblePushedRef.current = false;
    }
  }, [videoStreamingActive, stopCameraRecording]);

  useEffect(() => {
    cameraReadyRef.current = false;
  }, [activeCamDevice?.id]);

  const startCameraRecording = useCallback(async (): Promise<boolean> => {
    if (!videoStreamingActiveRef.current) {
      recordingRequestedRef.current = false;
      return false;
    }
    recordingRequestedRef.current = true;
    // Home-origin recordings are explicit user actions. Emergency video
    // capture, however, must never acquire audio before Telecom has a call.
    if (
      Platform.OS === 'android' &&
      !fromHomeRecording &&
      !(await inCallService.hasActiveCall())
    ) return false;
    if (
      isRecordingRef.current ||
      !cameraRef.current ||
      !cameraReadyRef.current ||
      camAppState === 'background'
    ) return false;

    recordingRequestedRef.current = false;
    try {
      isRecordingRef.current = true;
      cameraRef.current.startRecording({
        onRecordingFinished: async (video: any) => {
          isRecordingRef.current = false;
          try {
            const timestamp = Date.now();
            const dest = `${FileSystem.documentDirectory}emergency_recording_${timestamp}.mp4`;
            const sourcePath = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
            await FileSystem.moveAsync({ from: sourcePath, to: dest });
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status === 'granted') {
              const asset = await MediaLibrary.createAssetAsync(dest);
              await MediaLibrary.createAlbumAsync('Contact', asset, true);
            }
          } catch (e) { console.error('Failed to save recording:', e); }
        },
        onRecordingError: (error: any) => {
          isRecordingRef.current = false;
          // Stopping a recording may report through this callback. Re-arm
          // capture only if the session is still explicitly active.
          recordingRequestedRef.current = videoStreamingActiveRef.current;
          if (error?.message?.includes('no data') || error?.code === 'capture/no-data') return;
          console.error('Recording error:', error);
        },
      });
      return true;
    } catch (e) {
      isRecordingRef.current = false;
      recordingRequestedRef.current = videoStreamingActiveRef.current;
      console.error('Failed to start recording:', e);
      return false;
    }
  }, [camAppState, fromHomeRecording]);

  const resolveTarget = async (): Promise<string> => {
    let target = (psapNumber || EMERGENCY_TEST_NUMBER).trim();
    if (__DEV__) {
      try {
        const override = await AsyncStorage.getItem('dev_emergency_override_number');
        if (override?.trim()) target = override.trim();
      } catch (_) {}
    }
    return target;
  };

  const takePictureAndSend = async () => {
    if (!cameraRef.current || takingPicture) return;
    setTakingPicture(true);
    const wasRecording = isRecordingRef.current;
    try {
      if (wasRecording) {
        await stopCameraRecording();
        await new Promise<void>(r => setTimeout(r, 400));
      }

      let capturedPath: string;
      try {
        const snapshot = await cameraRef.current.takeSnapshot({ quality: 70 });
        capturedPath = snapshot.path.startsWith('file://') ? snapshot.path : `file://${snapshot.path}`;
      } catch (snapshotErr: any) {
        console.warn('[E911Camera] takeSnapshot failed, falling back to takePhoto:', snapshotErr?.message);
        const photo = await cameraRef.current.takePhoto({ flash: 'off' });
        capturedPath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      }

      const dest = `${FileSystem.cacheDirectory}emergency_photo_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: capturedPath, to: dest });

      const localPhotoMessageId = `emergency_photo_${Date.now()}`;
      const now = Date.now();
      setChatMessages(prev => [
        ...prev,
        { id: localPhotoMessageId, text: '', type: 'chat' as const, imageUrl: dest, mediaMime: 'image/jpeg', incoming: false, timestamp: now },
      ]);

      if (!isDirectSmsAvailable()) {
        setChatMessages(prev => [...prev, { text: 'Photo not sent: SMS/MMS module unavailable.', type: 'chat' as const, incoming: true, timestamp: Date.now() }]);
        return;
      }

      const target = await resolveTarget();
      if (typeof DirectSms?.sendMmsNoFallback !== 'function') {
        throw new Error('Native no-fallback MMS sender unavailable. Rebuild the Android app.');
      }
      await DirectSms.sendMmsNoFallback(target, '', dest);
    } catch (e: any) {
      const message = e?.message || String(e || 'Unknown error');
      console.warn('[E911Camera] Send failed:', message);
      setChatMessages(prev => [...prev, { text: `Photo not sent: ${message}`, type: 'chat' as const, incoming: true, timestamp: Date.now() }]);
    } finally {
      if (wasRecording && videoStreamingActiveRef.current) {
        setTimeout(() => startCameraRecording(), 400);
      }
      setTakingPicture(false);
      scrollToBottom(400);
    }
  };

  const captureCallStartSelfie = async (): Promise<string | null> => {
    if (takingPicture) return null;
    let permissionGranted = hasCamPermission;
    if (!permissionGranted) {
      try { permissionGranted = await requestCamPermission(); } catch { permissionGranted = false; }
    }
    if (!permissionGranted) return null;
    const prevCamera = activeCamera;
    const prevStreaming = videoStreamingActive;
    setTakingPicture(true);
    try {
      if (!prevStreaming) setVideoStreamingActive(true);
      if (prevCamera !== 'front') setActiveCamera('front');
      const readyBy = Date.now() + 3500;
      while (Date.now() < readyBy) {
        if (cameraRef.current && cameraReadyRef.current) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 120));
      }
      if (!cameraRef.current) return null;
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      const sourcePath = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
      const dest = `${FileSystem.documentDirectory}call_start_selfie_${Date.now()}.jpg`;
      await FileSystem.moveAsync({ from: sourcePath, to: dest });
      return dest;
    } catch (e) { console.error('Failed to capture call-start selfie:', e); return null; }
    finally {
      if (prevCamera !== 'front') setActiveCamera(prevCamera);
      if (!prevStreaming) setVideoStreamingActive(false);
      setTakingPicture(false);
    }
  };

  const onCameraInitialized = useCallback(() => {
    cameraReadyRef.current = true;
    if (fromHomeRecording) setUserJustEnabledCamera(true);
    if (videoStreamingActiveRef.current && recordingRequestedRef.current) {
      startCameraRecording();
    }
  }, [fromHomeRecording, startCameraRecording]);

  // A system role/permission prompt can briefly background E911 while the
  // recording request is pending. Start as soon as the existing screen becomes
  // active again and the camera is ready.
  useEffect(() => {
    if (
      camAppState === 'active' &&
      videoStreamingActive &&
      recordingRequestedRef.current
    ) {
      startCameraRecording();
    }
  }, [camAppState, videoStreamingActive, startCameraRecording]);

  // The E911 video-entry path often enables streaming before the Camera view
  // has mounted and fired onInitialized. Keep retrying the pending native
  // recording request until it actually starts.
  useEffect(() => {
    if (!videoStreamingActive) return;
    const interval = setInterval(() => {
      if (
        camAppState === 'active' &&
        recordingRequestedRef.current &&
        !isRecordingRef.current
      ) {
        startCameraRecording();
      }
    }, 300);
    return () => clearInterval(interval);
  }, [camAppState, startCameraRecording, videoStreamingActive]);

  // Ensure camera recording and mic are fully released when the hook unmounts
  // (e.g. navigating away from the E911 screen).
  useEffect(() => {
    return () => {
      recordingRequestedRef.current = false;
      videoStreamingActiveRef.current = false;
      if (isRecordingRef.current && cameraRef.current) {
        try { cameraRef.current.stopRecording(); } catch (_) {}
      }
      videoRecordingService.stopIfOrigin('e911');
      cleanupCameraCache();
    };
  }, []);

  const cleanup = useCallback(() => {
    setVideoStreamingActive(false);
    cameraReadyRef.current = false;
    videoBubblePushedRef.current = false;
    void stopCameraRecording();
    videoRecordingService.stopIfOrigin('e911');
    cleanupCameraCache();
  }, [setVideoStreamingActive, stopCameraRecording]);

  return {
    hasCamPermission, requestCamPermission, frontCameraDevice, backCameraDevice,
    activeCamera, setActiveCamera, videoExpanded, setVideoExpanded, camAppState,
    hasMicPermission, videoBubbleRendered, setVideoBubbleRendered,
    showCamPermAlert, setShowCamPermAlert, userJustEnabledCamera, setUserJustEnabledCamera,
    cameraGrantedAfterLocation, setCameraGrantedAfterLocation,
    videoStreamingActive, setVideoStreamingActive, takingPicture,
    cameraRef, isRecordingRef, recordingRequestedRef, cameraReadyRef, videoSessionCount, camDenyCount,
    videoBubblePushedRef, activeCamDevice,
    startCameraRecording, stopCameraRecording, takePictureAndSend,
    captureCallStartSelfie, onCameraInitialized, cleanup,
  };
};
