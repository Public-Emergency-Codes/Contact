import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Animated, SafeAreaView, NativeModules, Platform, Vibration,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AppText from '../../components/AppText';
const Text = AppText; // global text scale
import { useAppSelector } from '../../store/hooks';
import checkInService from '../../services/checkInService';
import checkInAlarmService from '../../services/checkInAlarmService';

/**
 * Full-screen alarm overlay shown when a check-in is due.
 * The user must press "I'm OK" to dismiss. A countdown shows
 * remaining grace-period time before auto-escalation.
 */
export default function CheckInAlarmScreen({ navigation }: any) {
  const config = useAppSelector((s) => s.checkIn.config);
  const alarmStartTime = useAppSelector((s) => s.checkIn.alarmStartTime);
  const isAlarmActive = useAppSelector((s) => s.checkIn.isAlarmActive);

  const schedule = config.schedule;
  const isNight = (() => {
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const { dayStartHour, dayStartMinute, nightStartHour, nightStartMinute } = schedule;
    const dayStart = dayStartHour * 60 + (dayStartMinute ?? 0);
    const nightStart = nightStartHour * 60 + (nightStartMinute ?? 0);
    return nightStart > dayStart
      ? current >= nightStart || current < dayStart
      : current >= nightStart && current < dayStart;
  })();
  const gracePeriodSeconds = (isNight
    ? (schedule.nightGracePeriodMinutes ?? 5)
    : (schedule.dayGracePeriodMinutes ?? 5)) * 60;

  const [secondsLeft, setSecondsLeft] = useState(gracePeriodSeconds);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Safety cleanup on focus: stop any stale vibration/ringer from previous
  // alarm cycles. Does NOT start new vibration — fireAlarm() owns that.
  // Cleanup (return) runs when the user navigates away (confirms OK).
  useFocusEffect(
    useCallback(() => {
      checkInAlarmService.stop();
      if (Platform.OS === 'android') {
        NativeModules.ScreenLock?.stopAlarmRinger?.();
      }
      return () => {
        Vibration.cancel(); // stop JS vibration when leaving alarm screen
      };
    }, [])
  );

  // Countdown timer
  useEffect(() => {
    if (!isAlarmActive) {
      if (navigation.canGoBack()) { navigation.goBack(); } else { navigation.navigate('Home' as never); }
      return;
    }
    const interval = setInterval(() => {
      if (!alarmStartTime) return;
      const elapsed = (Date.now() - new Date(alarmStartTime).getTime()) / 1000;
      const remaining = Math.max(0, gracePeriodSeconds - elapsed);
      setSecondsLeft(Math.ceil(remaining));
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [isAlarmActive, alarmStartTime]);

  // Pulsing animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const handleDismiss = async () => {
    await checkInService.confirmCheckIn();
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home' as never);
    }
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const urgency = secondsLeft < 60 ? '#EF4444' : secondsLeft < 120 ? '#F59E0B' : '#2563EB';

  return (
    <SafeAreaView style={[st.container, { backgroundColor: secondsLeft < 60 ? '#1a0000' : '#121212' }]}>
      <View style={st.content}>
        <Text style={st.icon}>⏰</Text>
        <Text style={st.title}>Check-In Required</Text>
        <Text style={st.subtitle}>
          Are you OK? Dismiss this alarm to confirm.
        </Text>

        <View style={[st.timerBox, { borderColor: urgency }]}>
          <Text style={[st.timer, { color: urgency }]}>{fmtTime(secondsLeft)}</Text>
          <Text style={st.timerLabel}>until emergency escalation</Text>
        </View>

        {config.silentCheckIn ? (
          <Text style={st.warning}>
            Your emergency contacts will be notified silently — no 911 call
          </Text>
        ) : config.alertEmergencyContacts ? (
          <Text style={st.warning}>
            Your emergency contacts will be notified via SMS — no 911 call
          </Text>
        ) : (
          <Text style={st.warning}>
            911 will be called automatically if you don't respond
          </Text>
        )}

        <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
          <TouchableOpacity style={st.dismissBtn} onPress={handleDismiss} activeOpacity={0.7}>
            <Text style={st.dismissText}>I'm OK — Dismiss Alarm</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { color: '#FFF', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: '#CCC', fontSize: 16, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  timerBox: {
    borderWidth: 3, borderRadius: 16, padding: 24,
    marginBottom: 24, alignItems: 'center', minWidth: 200,
  },
  timer: { fontSize: 48, fontWeight: 'bold', fontVariant: ['tabular-nums'] },
  timerLabel: { color: '#AAA', fontSize: 13, marginTop: 4 },
  warning: { color: '#F59E0B', fontSize: 14, textAlign: 'center', marginBottom: 8 },
  dismissBtn: {
    backgroundColor: '#22C55E', paddingVertical: 20, paddingHorizontal: 40,
    borderRadius: 16, alignItems: 'center', marginTop: 24, width: '100%',
  },
  dismissText: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  info: { color: '#777', fontSize: 12, textAlign: 'center', marginTop: 24 },
});
