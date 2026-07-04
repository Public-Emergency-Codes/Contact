import React, { useEffect, useRef, useState } from 'react';
import { Linking, NativeModules, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Provider } from 'react-redux';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { store } from './src/store';
import AppNavigator from './src/navigation/AppNavigator';
import ReturnToCallWidget from './src/components/ReturnToCallWidget';
import { ThemeProvider } from './src/context/ThemeContext';
import { TextScaleProvider } from './src/context/TextScaleContext';
import emergencyHistoryService from './src/services/emergencyHistoryService';
import locationHistoryService from './src/services/location/locationHistoryService';
import emergencyLocationService from './src/services/location/emergencyLocationService';

// ── Deep-link: contact://e911-chat?prefill=...&source=... ─────────────────
type External911Payload = { prefillMessage: string; source?: string };
type ExternalHomePayload = { initialHomeTab: 'chat' };

function parseEmergencyUrl(url: string): External911Payload | null {
  try {
    const [base, query = ''] = url.split('?');
    if (!base.toLowerCase().startsWith('contact://')) return null;
    const path = base.replace(/^contact:\/\//i, '').toLowerCase();
    if (path !== 'e911-chat' && path !== 'e911') return null;
    const params = new URLSearchParams(query);
    const prefillMessage = decodeURIComponent(
      params.get('prefill') || params.get('message') || ''
    ).trim();
    if (!prefillMessage) return null;
    return { prefillMessage, source: params.get('source') || 'external' };
  } catch {
    return null;
  }
}

// ── Deep-link: contact://sms-compose/{number} ───────────────────────────
function parseSmsComposeUrl(url: string): string | null {
  try {
    // Match contact://sms-compose/{number} using simple string search
    const marker = 'sms-compose/';
    const idx = url.toLowerCase().indexOf(marker);
    if (idx === -1) return null;
    const address = decodeURIComponent(url.slice(idx + marker.length));
    return address || null;
  } catch {
    return null;
  }
}

// ── Deep-link: contact://home?tab=chat ─────────────────────────────────
function parseHomeUrl(url: string): ExternalHomePayload | null {
  try {
    const [base, query = ''] = url.split('?');
    if (!base.toLowerCase().startsWith('contact://')) return null;
    const path = base.replace(/^contact:\/\//i, '').toLowerCase();
    if (path !== 'home') return null;
    const params = new URLSearchParams(query);
    const tab = (params.get('tab') || '').trim().toLowerCase();
    if (tab !== 'chat') return null;
    return { initialHomeTab: 'chat' };
  } catch {
    return null;
  }
}

// ── Share target from other apps (ACTION_SEND) ───────────────────────────
type ExternalSharePayload = {
  mimeType: string;
  text?: string;
  uris?: string[];
  subject?: string;
};

const { PendingShare } = NativeModules;

/** Scan the raw intent dump (JSON from native) for any content:// or file:// URIs. */
function extractShareFromDump(dump: any): ExternalSharePayload | null {
  const uris: string[] = [];
  const isUri = (s: string) => s && (s.startsWith('content://') || s.startsWith('file://'));

  // 1) Normalized URIs extracted by MainActivity
  if (Array.isArray(dump.uris)) {
    dump.uris.forEach((u: string) => { if (isUri(u)) uris.push(u); });
  }
  // 2) clipUris array
  if (Array.isArray(dump.clipUris)) {
    dump.clipUris.forEach((u: string) => { if (isUri(u)) uris.push(u); });
  }
  // 3) Scan extras for URI values
  if (dump.extras) {
    for (const key of Object.keys(dump.extras)) {
      const v = dump.extras[key];
      if (typeof v === 'string' && isUri(v)) uris.push(v);
      if (Array.isArray(v)) v.forEach((s: string) => { if (isUri(s)) uris.push(s); });
    }
  }
  // 4) intent.data
  if (isUri(dump.data)) uris.push(dump.data);

  if (uris.length === 0) return null;
  return { mimeType: dump.mimeType || dump.type || '*/*', uris: [...new Set(uris)] };
}

async function consumeNativePendingShare(): Promise<ExternalSharePayload | null> {
  if (!PendingShare?.consume) return null;
  try {
    const [raw, nativePath] = await Promise.all([
      PendingShare.consume(),
      PendingShare.getFilePath?.(),
    ]);
    console.log('[App] pending share paths:', JSON.stringify({
      nativePath,
      expoCacheDirectory: FileSystem.cacheDirectory,
    }));
    if (!raw) return null;
    const dump = JSON.parse(raw);
    console.log('[App] native intent dump:', JSON.stringify(dump).slice(0, 500));
    return extractShareFromDump(dump);
  } catch (e) {
    console.warn('[App] native pending-share read failed:', e);
    return null;
  }
}

function parseShareUrl(url: string): ExternalSharePayload | null {
  try {
    const [base, query = ''] = url.split('?');
    if (!base.toLowerCase().startsWith('contact://')) return null;
    const path = base.replace(/^contact:\/\//i, '').toLowerCase();
    if (path !== 'share') return null;
    const params = new URLSearchParams(query);
    const mimeType = params.get('mimeType') || '*/*';
    const text = params.get('text') || undefined;
    const urisRaw = params.get('uris');
    const uris = urisRaw ? urisRaw.split(',').map(decodeURIComponent) : undefined;
    const subject = params.get('subject') || undefined;
    return { mimeType, text, uris, subject };
  } catch {
    return null;
  }
}

function parseReturnToCallUrl(url: string): 'e911' | 'home' | null {
  try {
    if (!url.toLowerCase().startsWith('contact://')) return null;
    const [base, query = ''] = url.split('?');
    const path = base.replace(/^contact:\/\//i, '').toLowerCase();
    if (path !== 'return-to-call') return null;
    const target = new URLSearchParams(query).get('target');
    return target === 'home' ? 'home' : 'e911';
  } catch {
    return null;
  }
}

export default function App() {
  const navRef = useRef<NavigationContainerRef<any>>(null);
  const [currentRouteName, setCurrentRouteName] = useState<string | null>(null);

  // ── Retry navigation until navRef is available ────────────────────────
  function navigateWhenReady(route: string, params: any, maxMs = 5_000) {
    const stepMs = 200;
    let elapsed = 0;
    const tryGo = () => {
      if (navRef.current) {
        navRef.current.navigate(route, params);
        return true;
      }
      return false;
    };
    if (tryGo()) return;
    const interval = setInterval(() => {
      elapsed += stepMs;
      if (tryGo() || elapsed >= maxMs) clearInterval(interval);
    }, stepMs);
  }

  // ── Handle both cold-start & warm-launch deep links ───────────────────
  async function handleUrl(url: string) {
    console.log('[App] handleUrl:', url);
    const returnToCall = parseReturnToCallUrl(url);
    if (returnToCall) {
      if (returnToCall === 'home') {
        navigateWhenReady('Home', { initialPage: 'home' });
      } else {
        navigateWhenReady('E911Call', {
          source: 'return_widget',
          callInitiated: true,
          startNewSession: false,
          autoInitiateCall: false,
        });
      }
      return;
    }

    // 1. E911 emergency
    const e911 = parseEmergencyUrl(url);
    if (e911) {
      navigateWhenReady('E911Call', { prefill: e911.prefillMessage });
      return;
    }
    // 2. SMS compose from external smsto: intent
    const sms = parseSmsComposeUrl(url);
    if (sms) {
      navigateWhenReady('ChatWindow', { threadId: sms, address: sms });
      return;
    }
    // 3. Home tab routing from external deep link
    const home = parseHomeUrl(url);
    if (home) {
      navigateWhenReady('Home', {
        initialPage: 'home',
        initialHomeTab: home.initialHomeTab,
        initialHomeTabRequestId: Date.now(),
      });
      return;
    }
    // 4. Share target from other apps (ACTION_SEND)
    const share = parseShareUrl(url);
    if (share) {
      console.log('[App] share URL parsed:', JSON.stringify(share));
      // Native reads the same Context.cacheDir file MainActivity wrote. This
      // avoids native filesystem paths and file:// URI formatting drifting.
      const fromNative = await consumeNativePendingShare();
      if (fromNative?.uris?.length) {
        share.uris = fromNative.uris;
        share.mimeType = fromNative.mimeType || share.mimeType;
      } else if (!share.uris?.length) {
        try {
          const path = `${FileSystem.cacheDirectory}pending_share.json`;
          const info = await FileSystem.getInfoAsync(path);
          if (info.exists) {
            const raw = await FileSystem.readAsStringAsync(path);
            await FileSystem.deleteAsync(path, { idempotent: true });
            const dump = JSON.parse(raw);
            console.log('[App] intent dump (warm):', JSON.stringify(dump).slice(0, 500));
            const fromDump = extractShareFromDump(dump);
            if (fromDump?.uris?.length) {
              share.uris = fromDump.uris;
              share.mimeType = fromDump.mimeType || share.mimeType;
              console.log('[App] loaded URIs from dump:', share.uris.length);
            }
          }
        } catch (e) {
          console.warn('[App] dump read failed:', e);
        }
      }
      (globalThis as any).__pendingShare = share;
      navigateWhenReady('Home', {
        initialPage: 'home',
        initialHomeTab: 'chat',
        initialHomeTabRequestId: Date.now(),
      });
    }
  }

  // Cold-start: read pending_share.json (full intent dump from native)
  useEffect(() => {
    const checkFile = async () => {
      try {
        let share = await consumeNativePendingShare();
        if (!share) {
          const path = `${FileSystem.cacheDirectory}pending_share.json`;
          const info = await FileSystem.getInfoAsync(path);
          if (!info.exists) return;
          const raw = await FileSystem.readAsStringAsync(path);
          await FileSystem.deleteAsync(path, { idempotent: true });
          const dump = JSON.parse(raw);
          console.log('[App] fallback intent dump:', JSON.stringify(dump).slice(0, 500));
          share = extractShareFromDump(dump);
        }
        if (share) {
          console.log('[App] extracted share:', JSON.stringify(share));
          (globalThis as any).__pendingShare = share;
        }
        navigateWhenReady('Home', {
          initialPage: 'home',
          initialHomeTab: 'chat',
          initialHomeTabRequestId: Date.now(),
        });
      } catch (e) {
        console.warn('[App] failed to read pending_share.json:', e);
      }
    };
    checkFile();
  }, []);

  // Cold-start deep link
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      handleUrl(url);
    });
  }, []);

  // Foreground deep link
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleUrl(url);
    });
    return () => sub.remove();
  }, []);

  // ── App launch: cleanup old data + start location history ────────────
  useEffect(() => {
    // #12 — Purge old records on app launch
    emergencyHistoryService.performCleanupIfNeeded().then((purged) => {
      if (purged > 0) console.log(`[App] Cleanup: purged ${purged} old emergency records`);
    });
    emergencyHistoryService.purgeOldAsyncStorageData();

    // #27 — Feed location history from the enhanced location service
    // We attach a listener that records each new location to the history buffer.
    const unsubInterval = setInterval(async () => {
      try {
        const loc = await emergencyLocationService.getBestLocation();
        if (loc) {
          locationHistoryService.recordLocation(loc).catch(() => {});
        }
      } catch {
        // Silent — location polling should never crash the app
      }
    }, 30_000); // every 30 seconds

    return () => clearInterval(unsubInterval);
  }, []);

  return (
    <Provider store={store}>
      <ThemeProvider>
        <TextScaleProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
              <View style={{ flex: 1 }}>
                <NavigationContainer
                  ref={navRef}
                  onReady={() => setCurrentRouteName(navRef.current?.getCurrentRoute()?.name ?? null)}
                  onStateChange={() => setCurrentRouteName(navRef.current?.getCurrentRoute()?.name ?? null)}
                >
                  <AppNavigator />
                </NavigationContainer>
                <ReturnToCallWidget navigationRef={navRef} currentRouteName={currentRouteName} />
              </View>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </TextScaleProvider>
      </ThemeProvider>
    </Provider>
  );
}
