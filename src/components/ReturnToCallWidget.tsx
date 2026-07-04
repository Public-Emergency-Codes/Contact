import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from './AppText';
import { inCallService } from '../services/inCallService';
import videoRecordingService from '../services/videoRecordingService';

const NOTIFICATION_DATA = { action: 'return_to_e911_call' };

type Props = {
  navigationRef: React.RefObject<NavigationContainerRef<any> | null>;
  currentRouteName?: string | null;
};

export default function ReturnToCallWidget({ navigationRef, currentRouteName }: Props) {
  const insets = useSafeAreaInsets();
  const [recording, setRecording] = useState(videoRecordingService.getSnapshot());
  const [callActive, setCallActive] = useState(false);
  const [e911CallSessionActive, setE911CallSessionActive] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const notificationIdRef = useRef<string | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  const hasActiveSession = callActive || recording.isActive;
  const isOnCallScreen = currentRouteName === 'E911Call';
  const emergencySession = recording.isActive || e911CallSessionActive || isOnCallScreen;
  const regularCallSession = callActive && !emergencySession;
  const isRecorderTabSession = currentRouteName === 'Home' && recording.origin === 'record-screen' && !callActive;
  const showWidget = hasActiveSession && !isOnCallScreen && !isRecorderTabSession;

  const label = useMemo(() => {
    if (regularCallSession) return 'Return to call';
    if (callActive && recording.isActive) return 'Return to call';
    if (callActive) return 'Return to call';
    return 'Return to recording';
  }, [callActive, recording.isActive, regularCallSession]);

  const navigateToCall = useCallback(async () => {
    if (regularCallSession) {
      const opened = await inCallService.openInCallUI();
      if (!opened) navigationRef.current?.navigate('Home', { initialPage: 'home' });
      return;
    }

    navigationRef.current?.navigate('E911Call', {
      source: 'return_widget',
      callInitiated: callActive,
      startNewSession: false,
      autoInitiateCall: false,
      withVideo: recording.isActive,
      fromHomeRecording: recording.isActive,
    });
  }, [callActive, navigationRef, recording.isActive, regularCallSession]);

  const dismissReturnNotification = useCallback(async () => {
    const id = notificationIdRef.current;
    notificationIdRef.current = null;
    if (!id) return;
    try { await Notifications.dismissNotificationAsync(id); } catch {}
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
  }, []);

  const hideExternalReturnTargets = useCallback(async () => {
    await inCallService.hideReturnWidget();
    await dismissReturnNotification();
  }, [dismissReturnNotification]);

  const ensureReturnNotification = useCallback(async () => {
    if (!hasActiveSession || notificationIdRef.current) return;
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('active-call', {
          name: 'Active call',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0],
          sound: undefined,
        });
      }
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: regularCallSession ? 'Active call' : callActive ? 'Active emergency call' : 'Recording in progress',
          body: 'Tap to return to Contact.',
          data: NOTIFICATION_DATA,
          sticky: true,
          autoDismiss: false,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
      notificationIdRef.current = id;
    } catch (error) {
      console.warn('[ReturnToCallWidget] notification failed:', error);
    }
  }, [callActive, hasActiveSession, regularCallSession]);

  const ensureExternalReturnTarget = useCallback(async () => {
    if (!hasActiveSession) return;
    const subtitle = callActive && recording.isActive
      ? 'Call and recording active'
      : callActive
        ? regularCallSession ? 'Call active' : 'Emergency call active'
        : 'Recording active';
    const shown = await inCallService.showReturnWidget(
      label,
      subtitle,
      callActive,
      !regularCallSession,
      null,
    );
    if (!shown) {
      await ensureReturnNotification();
    } else {
      await dismissReturnNotification();
    }
  }, [callActive, dismissReturnNotification, ensureReturnNotification, hasActiveSession, label, recording.isActive, regularCallSession]);

  useEffect(() => {
    const unsubscribe = videoRecordingService.subscribe(() => {
      setRecording(videoRecordingService.getSnapshot());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (currentRouteName === 'E911Call' && callActive) {
      setE911CallSessionActive(true);
    }
  }, [callActive, currentRouteName]);

  useEffect(() => {
    let cancelled = false;
    inCallService.hasActiveCall()
      .then((active) => { if (!cancelled) setCallActive(active); })
      .catch(() => {});

    const unsubAdded = inCallService.onCallAdded(() => setCallActive(true));
    const unsubState = inCallService.onCallStateChanged((e) => {
      if (e.state === 'DISCONNECTED' || e.state === 'DISCONNECTING') {
        setCallActive(false);
        setE911CallSessionActive(false);
      } else if (e.state !== 'UNKNOWN') {
        setCallActive(true);
      }
    });
    const unsubRemoved = inCallService.onCallRemoved(() => {
      setCallActive(false);
      setE911CallSessionActive(false);
    });
    return () => {
      cancelled = true;
      unsubAdded();
      unsubState();
      unsubRemoved();
    };
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 850, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        void hideExternalReturnTargets();
      } else if (hasActiveSession) {
        void ensureExternalReturnTarget();
      }
    });
    return () => sub.remove();
  }, [ensureExternalReturnTarget, hasActiveSession, hideExternalReturnTargets]);

  useEffect(() => {
    if (!hasActiveSession) {
      void hideExternalReturnTargets();
    } else if (appStateRef.current !== 'active') {
      void ensureExternalReturnTarget();
    }
  }, [ensureExternalReturnTarget, hasActiveSession, hideExternalReturnTargets]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const action = response.notification.request.content.data?.action;
      if (action === NOTIFICATION_DATA.action) void navigateToCall();
    });
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const action = response?.notification.request.content.data?.action;
        if (action === NOTIFICATION_DATA.action) void navigateToCall();
      })
      .catch(() => {});
    return () => sub.remove();
  }, [navigateToCall]);

  if (!showWidget) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={navigateToCall}
        style={[styles.widget, regularCallSession && styles.widgetRegular, { top: insets.top + 10 }]}
      >
        <View style={styles.iconWrap}>
          {!regularCallSession && callActive ? (
            <AppText style={styles.emergencyBadgeText}>911</AppText>
          ) : (
            <Ionicons name={regularCallSession ? 'person' : 'videocam'} size={18} color="#FFFFFF" />
          )}
          <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
        </View>
        <View style={styles.textWrap}>
          <AppText style={styles.title}>{label}</AppText>
          <AppText style={styles.subtitle}>
            {callActive && recording.isActive ? 'Call and recording active' : callActive ? regularCallSession ? 'Call active' : 'Emergency call active' : 'Recording active'}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  widget: {
    position: 'absolute',
    left: 12,
    right: 12,
    minHeight: 54,
    zIndex: 1000,
    elevation: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: '#B91C1C',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  widgetRegular: {
    backgroundColor: '#16A34A',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.22)',
    marginRight: 10,
  },
  liveDot: {
    position: 'absolute',
    right: 3,
    top: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  emergencyBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});
