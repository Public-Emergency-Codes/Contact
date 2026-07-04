/**
 * useVolumeMonitor Hook
 * Monitors device volume in real-time during E911 calls.
 * Detects mute or extremely low volume to trigger silent call mode.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import volumeDetectionService from '../services/volumeDetectionService';

export interface VolumeState {
  isMuted: boolean;
  isLow: boolean;
  currentVolume: number;
  maxVolume: number;
  volumePercentage: number;
  isSilentMode: boolean;
}

interface UseVolumeMonitorOptions {
  /** Polling interval in ms (default: 3000) */
  pollInterval?: number;
  /** Whether monitoring is enabled */
  enabled?: boolean;
  /** Callback when silent mode is first detected */
  onSilentDetected?: (state: VolumeState) => void;
  /** Callback when volume returns to normal */
  onVolumeRestored?: (state: VolumeState) => void;
}

const DEFAULT_STATE: VolumeState = {
  isMuted: false,
  isLow: false,
  currentVolume: 0.5,
  maxVolume: 1.0,
  volumePercentage: 0.5,
  isSilentMode: false,
};

export function useVolumeMonitor(options: UseVolumeMonitorOptions = {}) {
  const {
    pollInterval = 3000,
    enabled = true,
    onSilentDetected,
    onVolumeRestored,
  } = options;

  const [volumeState, setVolumeState] = useState<VolumeState>(DEFAULT_STATE);
  const wasSilentRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackRefs = useRef({ onSilentDetected, onVolumeRestored });

  // Keep callback refs fresh
  callbackRefs.current = { onSilentDetected, onVolumeRestored };

  const checkVolume = useCallback(async () => {
    try {
      const status = await volumeDetectionService.getVolumeStatus();
      const isSilentMode = status.isMuted || status.isLow;
      const newState: VolumeState = { ...status, isSilentMode };

      setVolumeState(newState);

      // Fire callbacks on state transitions
      if (isSilentMode && !wasSilentRef.current) {
        wasSilentRef.current = true;
        callbackRefs.current.onSilentDetected?.(newState);
      } else if (!isSilentMode && wasSilentRef.current) {
        wasSilentRef.current = false;
        callbackRefs.current.onVolumeRestored?.(newState);
      }
    } catch (error) {
      console.warn('[VolumeMonitor] Check failed:', error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial check
    checkVolume();

    // Start polling
    intervalRef.current = setInterval(checkVolume, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, pollInterval, checkVolume]);

  /** Force an immediate volume check */
  const recheckNow = useCallback(() => checkVolume(), [checkVolume]);

  return { volumeState, recheckNow };
}

export default useVolumeMonitor;
