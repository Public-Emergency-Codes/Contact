import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PixelRatio, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const TEXT_SCALE_KEY = '@text_scale_preference';
export const SYSTEM_TEXT_SCALE_KEY = '@system_text_scale_used';

interface TextScaleContextValue {
  textScale: number;
  setTextScale: (scale: number) => void;
  /** Multiply a base font size by the current scale factor */
  fs: (size: number) => number;
}

const TextScaleContext = createContext<TextScaleContextValue>({
  textScale: 1,
  setTextScale: () => {},
  fs: (size) => size,
});

export function TextScaleProvider({ children }: { children: React.ReactNode }) {
  const [textScale, setTextScaleState] = useState(1);

  useEffect(() => {
    const initializeTextScale = async () => {
      try {
        // Check if user has a saved preference
        const savedScale = await AsyncStorage.getItem(TEXT_SCALE_KEY);

        if (savedScale !== null) {
          // Use user's manual preference if set
          setTextScaleState(parseFloat(savedScale));
        } else {
          // Detect system font scale on first launch (Android only)
          if (Platform.OS === 'android') {
            const systemScale = PixelRatio.getFontScale();
            // Clamp system scale between 0.8 and 2.0 to match typical accessibility ranges
            const clampedScale = Math.max(0.8, Math.min(2.0, systemScale));
            setTextScaleState(clampedScale);
            // Save that we've applied system scale so we don't override user preference later
            await AsyncStorage.setItem(SYSTEM_TEXT_SCALE_KEY, 'true');
          }
        }
      } catch (_error) {
        // Silently fail, use default scale of 1
      }
    };

    initializeTextScale();
  }, []);

  const setTextScale = useCallback((scale: number) => {
    const rounded = Math.round(scale * 10) / 10;
    setTextScaleState(rounded);
    AsyncStorage.setItem(TEXT_SCALE_KEY, String(rounded)).catch(() => {});
  }, []);

  const fs = useCallback((size: number) => Math.round(size * textScale), [textScale]);

  return (
    <TextScaleContext.Provider value={{ textScale, setTextScale, fs }}>
      {children}
    </TextScaleContext.Provider>
  );
}

export function useTextScale(): TextScaleContextValue {
  return useContext(TextScaleContext);
}
