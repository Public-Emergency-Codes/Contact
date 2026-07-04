import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

type ToggleSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  loading?: boolean;
  error?: boolean;
  disabled?: boolean;
};

export default function ToggleSwitch({
  value,
  onValueChange,
  loading = false,
  error = false,
  disabled = false,
}: ToggleSwitchProps) {
  if (loading) {
    return <ActivityIndicator size="small" color="#3b82f6" style={styles.control} />;
  }

  return (
    <TouchableOpacity
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      activeOpacity={0.8}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.track,
        value ? styles.trackEnabled : styles.trackDisabled,
        error && styles.trackError,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.thumb, value ? styles.thumbEnabled : styles.thumbDisabled]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  control: { width: 50, height: 28 },
  track: {
    width: 50,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  trackEnabled: { backgroundColor: 'rgba(59,130,246,0.9)', alignItems: 'flex-end' },
  trackDisabled: { backgroundColor: 'rgba(80,80,80,0.55)', alignItems: 'flex-start' },
  trackError: { borderColor: '#ef4444' },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 2,
    borderColor: '#fff',
  },
  thumbEnabled: { alignSelf: 'flex-end' },
  thumbDisabled: { alignSelf: 'flex-start' },
  disabled: { opacity: 0.5 },
});
