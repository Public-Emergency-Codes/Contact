/**
 * SilentCallBanner
 * Displays a prominent but compact banner when the device is muted/low-volume
 * during an active E911 call. Informs the user that silent mode is active
 * and the dispatcher has been notified.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import AppText from '../../components/AppText';
const Text = AppText; // global text scale

interface SilentCallBannerProps {
  isMuted: boolean;
  volumePercent: number;
  dispatcherNotified: boolean;
  onDismiss?: () => void;
  textScale?: number;
}

const SilentCallBanner: React.FC<SilentCallBannerProps> = ({
  isMuted,
  volumePercent,
  dispatcherNotified,
  onDismiss,
  textScale = 1,
}) => {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fs = (size: number) => size * textScale;

  // Slide in on mount
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  }, []);

  // Pulse the indicator dot
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const volumeLabel = isMuted
    ? 'DEVICE MUTED'
    : `VOLUME LOW (${Math.round(volumePercent * 100)}%)`;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.header}>
        <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
        <Text style={[styles.title, { fontSize: fs(13) }]}>
          🔇 SILENT MODE ACTIVE — {volumeLabel}
        </Text>
      </View>

      <Text style={[styles.body, { fontSize: fs(11) }]}>
        {dispatcherNotified
          ? 'Dispatcher has been notified. Type messages below — they will be sent to the dispatcher as text (Text-to-911).'
          : 'Notifying dispatcher of silent mode...'}
      </Text>

      <Text style={[styles.hint, { fontSize: fs(10) }]}>
        Call stays open so dispatcher can hear background sounds.
      </Text>

      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
          <Text style={[styles.dismissText, { fontSize: fs(10) }]}>Got it</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#7C2D12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9A3412',
    padding: 12,
    marginHorizontal: 10,
    marginVertical: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FCA5A5',
    marginRight: 8,
  },
  title: {
    color: '#FEF2F2',
    fontWeight: '700',
    flex: 1,
  },
  body: {
    color: '#FECACA',
    lineHeight: 16,
    marginBottom: 4,
  },
  hint: {
    color: '#FCA5A5',
    fontStyle: 'italic',
    opacity: 0.8,
  },
  dismissBtn: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
  },
  dismissText: {
    color: '#FECACA',
    fontWeight: '600',
  },
});

export default SilentCallBanner;
