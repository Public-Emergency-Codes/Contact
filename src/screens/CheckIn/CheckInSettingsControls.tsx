import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import AppText from '../../components/AppText';
import AppTextInput from '../../components/AppTextInput';
import { CheckInSettingsStyles, Meridiem, TimeUnit, TranslateFn } from './checkInSettingsTypes';

const Text = AppText;
const TextInput = AppTextInput;

interface IntervalValueControlProps {
  styles: CheckInSettingsStyles;
  value: string;
  unit: TimeUnit;
  onFocus: () => void;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  onToggleUnit: () => void;
  t: TranslateFn;
}

interface TimeValueControlProps {
  styles: CheckInSettingsStyles;
  hourValue: string;
  minuteValue: string;
  amPm: Meridiem;
  onHourFocus: () => void;
  onHourChangeText: (value: string) => void;
  onHourBlur: () => void;
  onMinuteFocus: () => void;
  onMinuteChangeText: (value: string) => void;
  onMinuteBlur: () => void;
  onToggleAmPm: () => void;
}

export function IntervalValueControl({
  styles,
  value,
  unit,
  onFocus,
  onChangeText,
  onBlur,
  onToggleUnit,
  t,
}: IntervalValueControlProps) {
  return (
    <View style={styles.intervalControl}>
      <TextInput
        style={styles.intervalInput}
        keyboardType="numeric"
        value={value}
        onFocus={onFocus}
        onChangeText={onChangeText}
        onBlur={onBlur}
      />
      <TouchableOpacity onPress={onToggleUnit}>
        <Text style={styles.unitLabel}>{t(unit)}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function TimeValueControl({
  styles,
  hourValue,
  minuteValue,
  amPm,
  onHourFocus,
  onHourChangeText,
  onHourBlur,
  onMinuteFocus,
  onMinuteChangeText,
  onMinuteBlur,
  onToggleAmPm,
}: TimeValueControlProps) {
  return (
    <View style={styles.intervalControl}>
      <TextInput
        style={styles.intervalInput}
        keyboardType="numeric"
        value={hourValue}
        onFocus={onHourFocus}
        onChangeText={onHourChangeText}
        onBlur={onHourBlur}
      />
      <Text style={[styles.unitLabel, { marginLeft: 0 }]}>:</Text>
      <TextInput
        style={styles.intervalInput}
        keyboardType="numeric"
        value={minuteValue}
        onFocus={onMinuteFocus}
        onChangeText={onMinuteChangeText}
        onBlur={onMinuteBlur}
      />
      <TouchableOpacity onPress={onToggleAmPm}>
        <Text style={styles.unitLabel}>{amPm}</Text>
      </TouchableOpacity>
    </View>
  );
}
