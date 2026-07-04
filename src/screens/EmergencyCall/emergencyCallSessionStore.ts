import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EmergencyCallMessage } from './emergencyCallMessageTypes';

// Persisted history of 911 SMS/chat sessions. Retained on-device forever
// (until the user clears app data). Each call to 911 is a discrete session.
export interface EmergencyCallSession {
  id: string;
  startedAt: number;
  updatedAt: number;
  messages: EmergencyCallMessage[];
}

export interface EmergencyCallSessionStoreData {
  // Finalized past sessions, ordered oldest -> newest.
  sessions: EmergencyCallSession[];
  // The live / most-recent session (may still be receiving messages).
  current: EmergencyCallSession | null;
}

const STORE_KEY = '@e911_sms_sessions_v1';

export const HIDE_CURRENT_AFTER_MS = 60 * 60 * 1000;

export const newEmergencyCallSession = (now = Date.now()): EmergencyCallSession => ({
  id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
  startedAt: now,
  updatedAt: now,
  messages: [],
});

export async function loadEmergencyCallSessions(): Promise<EmergencyCallSessionStoreData> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return { sessions: [], current: null };
    const parsed = JSON.parse(raw);
    return {
      sessions: Array.isArray(parsed?.sessions) ? parsed.sessions : [],
      current: parsed?.current ?? null,
    };
  } catch {
    return { sessions: [], current: null };
  }
}

export async function saveEmergencyCallSessions(data: EmergencyCallSessionStoreData): Promise<void> {
  try {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {}
}
