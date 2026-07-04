import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useTabPager } from '../../context/TabPagerContext';
import videoRecordingService from '../../services/videoRecordingService';
import VideoRecordingBubble, { VideoRecordingHandle } from '../Home/VideoRecordingBubble';

const Text = AppText;

export default function EmergencyVideoCaptureScreen({ navigation, isActive }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { goToHome } = useTabPager();
  const styles = useMemo(() => makeStyles(colors, insets.top, insets.bottom), [colors, insets.top, insets.bottom]);
  const recHandle = useRef<VideoRecordingHandle | null>(null);
  const startedRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);

  const stopRecording = useCallback(async () => {
    if (!startedRef.current) return;
    try {
      await recHandle.current?.stopRecording();
    } catch {}
    videoRecordingService.stop();
    startedRef.current = false;
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (!isActive || startedRef.current || !recHandle.current) return;
    await recHandle.current.startRecording();
    videoRecordingService.start('record-screen');
    startedRef.current = true;
    setIsRecording(true);
  }, [isActive]);

  const exitEmergencyVideoCaptureScreen = useCallback(async () => {
    await stopRecording();
    goToHome();
  }, [goToHome, stopRecording]);

  const activateCall = useCallback(async () => {
    if (recHandle.current?.isRecording()) {
      try {
        await recHandle.current.stopRecording();
      } catch {}
    }
    startedRef.current = false;
    setIsRecording(false);
    videoRecordingService.start('record-screen');
    navigation.navigate('E911Call', { fromHomeRecording: true });
  }, [navigation]);

  useEffect(() => {
    if (isActive) {
      void startRecording();
    } else {
      void stopRecording();
    }
  }, [isActive, startRecording, stopRecording]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isActive || !navigation.isFocused()) return false;
      void exitEmergencyVideoCaptureScreen();
      return true;
    });
    return () => sub.remove();
  }, [exitEmergencyVideoCaptureScreen, isActive, navigation]);

  useEffect(() => () => {
    void stopRecording();
  }, [stopRecording]);

  return (
    <View style={styles.container}>
      {/* Only mount the camera when this tab is active — avoids permission dialogs on startup */}
      {isActive && (
        <VideoRecordingBubble
          headless={false}
          isActive={isActive}
          onReady={(handle) => {
            recHandle.current = handle;
            if (isActive && !startedRef.current) {
              void startRecording();
            }
          }}
          onClipSaved={(path) => videoRecordingService.addClip(path)}
        />
      )}

      {isRecording && (
        <TouchableOpacity style={styles.callBtn} onPress={activateCall} activeOpacity={0.8}>
          <Text style={styles.callBtnText}>Emergency Call</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (_colors: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors'], _topInset: number, bottomInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    callBtn: {
      position: 'absolute',
      alignSelf: 'center',
      bottom: bottomInset + 20,
      zIndex: 100,
      backgroundColor: '#DC2626',
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    callBtnText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  });
