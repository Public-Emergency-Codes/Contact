import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMERGENCY_TEST_NUMBER } from '../../services/runtimeConfig';
import {
  EmergencyCallSession, EmergencyCallSessionStoreData, HIDE_CURRENT_AFTER_MS,
  loadEmergencyCallSessions, newEmergencyCallSession, saveEmergencyCallSessions,
} from './emergencyCallSessionStore';
import type { EmergencyCallMessage, EmergencyMessageStateSetter } from './emergencyCallMessageTypes';

interface Params {
  chatMessages: EmergencyCallMessage[];
  setChatMessages: EmergencyMessageStateSetter;
  // True only when this screen was opened by a genuinely new 911 call (from a
  // route param / home trigger), NOT on a plain revisit. Location detection
  // runs on every entry, so it must NOT be used to decide "new call".
  newCallStarted: boolean;
  newCallToken?: string | number | null;
}

/**
 * Persists the live 911 chat as a session and exposes previous sessions.
 *
 * Rules (per product spec):
 *  - All SMS history is saved on-device forever.
 *  - Previous conversations stay hidden from the live chat.
 *  - The Chat History / Hide Chat History button is the only UI that reveals
 *    archived sessions.
 */
export function useEmergencyCallSessionHistory({ chatMessages, setChatMessages, newCallStarted, newCallToken }: Params) {
  const [pastSessions, setPastSessions] = useState<EmergencyCallSession[]>([]); // newest first
  const [revealedCount, setRevealedCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const currentRef = useRef<EmergencyCallSession | null>(null);
  const archivedRef = useRef<EmergencyCallSession[]>([]); // oldest -> newest
  const latestMsgsRef = useRef<EmergencyCallMessage[]>(chatMessages);
  const liveMessageStartIndexRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const processedNewCallTokenRef = useRef<string | number | null>(null);
  const [liveMessageStartIndex, setLiveMessageStartIndex] = useState(0);

  const getMessageKey = useCallback((msg: any) => {
    if (msg?.id) return `id:${msg.id}`;
    return [
      msg?.type ?? '',
      msg?.incoming ? 'in' : 'out',
      msg?.text ?? '',
      msg?.timestamp ?? '',
      msg?.imageUrl ?? '',
      msg?.mediaMime ?? '',
      msg?.mapUrl ?? '',
      msg?.locationLine ?? '',
      msg?.address ?? '',
      msg?.coords ?? '',
      msg?.url ?? '',
      msg?.sessionId ?? '',
    ].join('|');
  }, []);

  const dedupeMessages = useCallback((messages: any[] = []) => {
    const seen = new Set<string>();
    const next: any[] = [];
    messages.forEach((msg) => {
      if (!msg) return;
      const key = getMessageKey(msg);
      if (seen.has(key)) return;
      seen.add(key);
      next.push(msg);
    });
    return next;
  }, [getMessageKey]);

  const mergeMessages = useCallback((stored: any[], live: any[]) => (
    dedupeMessages([...(stored || []), ...(live || [])])
  ), [dedupeMessages]);

  const normalizeSessions = useCallback((sessions: EmergencyCallSession[] = []) => {
    const byId = new Map<string, EmergencyCallSession>();
    const signatureToId = new Map<string, string>();

    sessions.forEach((session) => {
      if (!session || !Array.isArray(session.messages)) return;
      const messages = dedupeMessages(session.messages);
      if (messages.length === 0) return;
      const normalized: EmergencyCallSession = {
        ...session,
        messages,
        updatedAt: session.updatedAt || session.startedAt || Date.now(),
      };
      const signature = messages.map(getMessageKey).join('||');
      const id = normalized.id || `${normalized.startedAt}-${signature.slice(0, 24)}`;
      const existingId = byId.has(id) ? id : signatureToId.get(signature);

      if (existingId && byId.has(existingId)) {
        const existing = byId.get(existingId)!;
        byId.set(existingId, {
          ...existing,
          startedAt: Math.min(existing.startedAt, normalized.startedAt),
          updatedAt: Math.max(existing.updatedAt, normalized.updatedAt),
          messages: mergeMessages(existing.messages, normalized.messages),
        });
        return;
      }

      byId.set(id, { ...normalized, id });
      signatureToId.set(signature, id);
    });

    return [...byId.values()].sort((a, b) => a.startedAt - b.startedAt);
  }, [dedupeMessages, getMessageKey, mergeMessages]);

  const loadNativeSmsSessions = useCallback(async (existingMessages: EmergencyCallMessage[] = []): Promise<EmergencyCallSession[]> => {
    const SmsReader = NativeModules?.SmsReader;
    if (!SmsReader || typeof SmsReader.getThreadIdByAddress !== 'function' || typeof SmsReader.getMessages !== 'function') {
      return [];
    }

    const targets = new Set<string>([EMERGENCY_TEST_NUMBER, '911'].filter(Boolean));
    if (__DEV__) {
      try {
        const override = await AsyncStorage.getItem('dev_emergency_override_number');
        if (override?.trim()) targets.add(override.trim());
      } catch {}
    }

    const existing = existingMessages
      .map((m: any) => ({ text: String(m?.text || m?.body || '').trim(), timestamp: Number(m?.timestamp || m?.date || 0) }))
      .filter((m) => m.text && m.timestamp > 0);

    const imported: any[] = [];
    const seenIds = new Set<string>();
    for (const target of targets) {
      try {
        const threadId = await SmsReader.getThreadIdByAddress(target);
        if (!threadId) continue;
        const raw = await SmsReader.getMessages(String(threadId), 1000);
        const messages = Array.isArray(raw) ? raw : [];
        messages.forEach((m: any) => {
          const timestamp = Number(m?.date || m?.timestamp || 0);
          const text = String(m?.body || m?.text || '').trim();
          const imageUrl = m?.imageUri || m?.imageUrl;
          if ((!text && !imageUrl) || timestamp <= 0) return;
          const id = `native-sms-${m?.id || target}-${timestamp}`;
          if (seenIds.has(id)) return;
          const duplicate = existing.some((saved) =>
            saved.text === text && Math.abs(saved.timestamp - timestamp) < 10_000
          );
          if (duplicate) return;
          seenIds.add(id);
          imported.push({
            id,
            type: 'chat',
            text,
            incoming: Number(m?.type) === 1,
            timestamp,
            imageUrl,
            mediaMime: m?.mediaMime,
          });
        });
      } catch {}
    }

    const byDay = new Map<string, any[]>();
    imported
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach((msg) => {
        const d = new Date(msg.timestamp);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        byDay.set(key, [...(byDay.get(key) || []), msg]);
      });

    return [...byDay.entries()].map(([key, messages]) => ({
      id: `native-psap-sms-${key}`,
      startedAt: messages[0].timestamp,
      updatedAt: messages[messages.length - 1].timestamp,
      messages,
    }));
  }, []);

  const persist = useCallback((snapshot?: EmergencyCallSessionStoreData) => {
    const data: EmergencyCallSessionStoreData = snapshot ?? {
      sessions: normalizeSessions(archivedRef.current),
      current: currentRef.current
        ? { ...currentRef.current, messages: dedupeMessages(currentRef.current.messages) }
        : null,
    };
    saveQueueRef.current = saveQueueRef.current
      .catch(() => {})
      .then(() => saveEmergencyCallSessions(data));
    return saveQueueRef.current;
  }, [dedupeMessages, normalizeSessions]);

  // Newest-first view of archived sessions for the reveal UI.
  const refreshPast = useCallback(() => {
    archivedRef.current = normalizeSessions(archivedRef.current);
    setPastSessions([...archivedRef.current].reverse());
  }, [normalizeSessions]);

  const archiveCurrentSession = useCallback((updatedMessages?: any[]) => {
    const current = currentRef.current;
    if (!current) return;
    const messages = dedupeMessages(updatedMessages && updatedMessages.length > 0 ? updatedMessages : current.messages);
    if (messages.length === 0) return;
    const archivedSession = { ...current, messages, updatedAt: Date.now() };
    const existingIndex = archivedRef.current.findIndex((session) => session.id === current.id);
    if (existingIndex >= 0) {
      archivedRef.current = archivedRef.current.map((session, index) => (
        index === existingIndex
          ? { ...session, messages: mergeMessages(session.messages, messages), updatedAt: archivedSession.updatedAt }
          : session
      ));
    } else {
      archivedRef.current = [...archivedRef.current, archivedSession];
    }
    archivedRef.current = normalizeSessions(archivedRef.current);
  }, [dedupeMessages, mergeMessages, normalizeSessions]);

  const setLiveStart = useCallback((index: number) => {
    liveMessageStartIndexRef.current = index;
    setLiveMessageStartIndex(index);
  }, []);

  const getLiveMessages = useCallback((messages: any[] = latestMsgsRef.current) => (
    messages.slice(liveMessageStartIndexRef.current)
  ), []);

  // Load once on mount and decide whether to resume or start fresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadEmergencyCallSessions();
      if (cancelled) return;
      const now = Date.now();
      const storedMessages = [
        ...(data.sessions || []).flatMap((session: EmergencyCallSession) => session?.messages || []),
        ...(data.current?.messages || []),
      ];
      const nativeSessions = await loadNativeSmsSessions(storedMessages);
      if (cancelled) return;
      archivedRef.current = normalizeSessions([...data.sessions, ...nativeSessions]);
      const cur = data.current;
      const liveMessages = dedupeMessages(latestMsgsRef.current);

      // Stored conversations belong behind the Chat History button. Do not
      // inject them into chatMessages, or old image bubbles leak into the live
      // chat after Hide Chat History is tapped.
      if (cur && Array.isArray(cur.messages) && cur.messages.length > 0) {
        archivedRef.current = normalizeSessions([...archivedRef.current, cur]);
      }
      if (liveMessages.length > 0 && !newCallStarted) {
        archivedRef.current = normalizeSessions([
          ...archivedRef.current,
          { ...newEmergencyCallSession(now), messages: liveMessages, updatedAt: now },
        ]);
        setLiveStart(latestMsgsRef.current.length);
        currentRef.current = newEmergencyCallSession(now);
      } else {
        currentRef.current = { ...newEmergencyCallSession(now), messages: liveMessages };
        if (newCallStarted) {
          latestMsgsRef.current = [];
          setChatMessages([]);
        } else if (liveMessages.length !== latestMsgsRef.current.length) {
          setChatMessages(liveMessages);
        }
      }
      if (newCallStarted) processedNewCallTokenRef.current = newCallToken ?? 'initial-new-call';

      refreshPast();
      persist();
      setLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a ref to the latest chatMessages so the unmount cleanup can access them.
  useEffect(() => { latestMsgsRef.current = chatMessages; }, [chatMessages]);

  // If E911 stays mounted past the visible-window cutoff, move the visible
  // conversation into history without waiting for another navigation event.
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      const current = currentRef.current;
      const liveMessages = getLiveMessages();
      if (!current || liveMessages.length === 0 || Date.now() - current.startedAt < HIDE_CURRENT_AFTER_MS) return;
      archiveCurrentSession(liveMessages);
      currentRef.current = newEmergencyCallSession(Date.now());
      latestMsgsRef.current = [];
      setLiveStart(0);
      setChatMessages([]);
      setRevealedCount(0);
      refreshPast();
      persist();
    }, 60_000);
    return () => clearInterval(interval);
  }, [archiveCurrentSession, getLiveMessages, loaded, persist, refreshPast, setChatMessages, setLiveStart]);

  // Home keeps E911 mounted under the Home route. When the user taps the 911
  // phone button again, the mounted screen receives a new route-param request
  // instead of remounting, so archive the visible session and clear the chat here.
  useEffect(() => {
    if (!loaded || !newCallStarted) return;
    const token = newCallToken ?? 'mounted-new-call';
    if (processedNewCallTokenRef.current === token) return;

    processedNewCallTokenRef.current = token;
    archiveCurrentSession(getLiveMessages());
    const now = Date.now();
    currentRef.current = newEmergencyCallSession(now);
    latestMsgsRef.current = [];
    setLiveStart(0);
    setChatMessages([]);
    setRevealedCount(0);
    refreshPast();
    persist();
  }, [archiveCurrentSession, getLiveMessages, loaded, newCallStarted, newCallToken, persist, refreshPast, setChatMessages, setLiveStart]);

  // Persist live messages into the current session.
  useEffect(() => {
    if (!loaded || !currentRef.current) return;
    currentRef.current = { ...currentRef.current, messages: dedupeMessages(getLiveMessages(chatMessages)), updatedAt: Date.now() };
    persist();
  }, [chatMessages, dedupeMessages, getLiveMessages, loaded, persist]);

  // Final flush on unmount — catches messages that arrived just before navigation.
  useEffect(() => {
    return () => {
      if (currentRef.current && latestMsgsRef.current.length > 0) {
        currentRef.current = { ...currentRef.current, messages: dedupeMessages(getLiveMessages(latestMsgsRef.current)), updatedAt: Date.now() };
        persist();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revealOlderSession = useCallback(() => {
    setRevealedCount((c) => Math.min(c + 1, pastSessions.length));
  }, [pastSessions.length]);

  const revealAllSessions = useCallback(() => {
    setRevealedCount(pastSessions.length);
  }, [pastSessions.length]);

  const clearRevealedSessions = useCallback(() => {
    setRevealedCount(0);
  }, []);

  // Oldest -> newest order for rendering above the current conversation.
  const revealedSessions = pastSessions.slice(0, revealedCount).reverse();
  const hasMoreToReveal = revealedCount < pastSessions.length;

  return { revealedSessions, revealOlderSession, revealAllSessions, clearRevealedSessions, hasMoreToReveal, hasPastSessions: pastSessions.length > 0, liveMessageStartIndex };
}
