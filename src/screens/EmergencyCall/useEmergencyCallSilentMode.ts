import { useState, useRef, useEffect, useCallback } from 'react';
import type { EmergencyMessageStateSetter } from './emergencyCallMessageTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import silentCallService from '../../services/silentCallService';
import { DEAF_MUTE_KEY } from '../../constants/accessibility';
import { useVolumeMonitor } from '../../hooks/useVolumeMonitor';

interface UseEmergencyCallSilentModeParams {
  emergencyCallActive: boolean;
  sendPsapMessage: (msg: string, lat?: number, lng?: number) => Promise<boolean>;
  setChatMessages: EmergencyMessageStateSetter;
}

export const useEmergencyCallSilentMode = ({
  emergencyCallActive,
  sendPsapMessage,
  setChatMessages,
}: UseEmergencyCallSilentModeParams) => {
  const [silentModeActive, setSilentModeActive] = useState(false);
  const [silentBannerDismissed, setSilentBannerDismissed] = useState(false);
  const [dispatcherNotified, setDispatcherNotified] = useState(false);
  const silentModeActivatedRef = useRef(false);

  const activateSilentMode = useCallback(async (isMuted: boolean, volumePct: number) => {
    if (silentModeActivatedRef.current) return;
    silentModeActivatedRef.current = true;
    setSilentModeActive(true);
    await silentCallService.activate(sendPsapMessage, isMuted, volumePct);
    setDispatcherNotified(true);
    setChatMessages(prev => [...prev, {
      text: '🔇 Silent mode activated — type your messages and they will be sent to the dispatcher as text (Text-to-911).',
      type: 'chat' as const,
    }]);
  }, [sendPsapMessage, setChatMessages]);

  // Activate silent mode if user is classified as Deaf/Mute
  useEffect(() => {
    if (!emergencyCallActive) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DEAF_MUTE_KEY);
        if (raw === 'true') await activateSilentMode(true, 0);
      } catch (e) {
        console.warn('[E911] Failed to check deaf/mute setting:', e);
      }
    })();
  }, [emergencyCallActive, activateSilentMode]);

  // Volume monitoring for silent call mode detection
  const { volumeState } = useVolumeMonitor({
    enabled: emergencyCallActive,
    pollInterval: 3000,
    onSilentDetected: async (vs) => {
      await activateSilentMode(vs.isMuted, vs.volumePercentage);
    },
    onVolumeRestored: () => {
      // Don't auto-deactivate — user might toggle volume accidentally.
    },
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silentModeActivatedRef.current) silentCallService.deactivate();
    };
  }, []);

  return {
    silentModeActive,
    silentBannerDismissed,
    setSilentBannerDismissed,
    dispatcherNotified,
    silentModeActivatedRef,
    activateSilentMode,
    volumeState,
  };
};
