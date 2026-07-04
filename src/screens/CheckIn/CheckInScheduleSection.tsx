import React from 'react';
import { View } from 'react-native';
import AppText from '../../components/AppText';
import { CheckInSettingsStyles, Meridiem, TimeUnit, TranslateFn } from './checkInSettingsTypes';
import { IntervalValueControl, TimeValueControl } from './CheckInSettingsControls';

const Text = AppText;

interface CheckInIntroSectionProps {
  styles: CheckInSettingsStyles;
  t: TranslateFn;
}

interface CheckInScheduleSectionProps {
  styles: CheckInSettingsStyles;
  t: TranslateFn;
  title: string;
  intervalLabel: string;
  intervalHint: string;
  intervalValue: string;
  intervalUnit: TimeUnit;
  onIntervalFocus: () => void;
  onIntervalChangeText: (value: string) => void;
  onIntervalBlur: () => void;
  onToggleIntervalUnit: () => void;
  startLabel: string;
  startHint: string;
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
  graceLabel: string;
  graceHint: string;
  graceValue: string;
  graceUnit: TimeUnit;
  onGraceFocus: () => void;
  onGraceChangeText: (value: string) => void;
  onGraceBlur: () => void;
  onToggleGraceUnit: () => void;
}

export function CheckInIntroSection({ styles, t }: CheckInIntroSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.desc}>{t('The countdown starts when you lock your screen — and resets every time you unlock your phone.')}</Text>
      <Text style={styles.desc}>{t('If you don\'t check in after being away from your phone for the set interval, the app can call 911 and alert your emergency contacts.')}</Text>
      <Text style={styles.desc}>{t('Configure separate daytime and nighttime intervals, a grace period to dismiss the alarm, and optional notes for dispatchers or contacts.')}</Text>
    </View>
  );
}

export function CheckInScheduleSection({
  styles,
  t,
  title,
  intervalLabel,
  intervalHint,
  intervalValue,
  intervalUnit,
  onIntervalFocus,
  onIntervalChangeText,
  onIntervalBlur,
  onToggleIntervalUnit,
  startLabel,
  startHint,
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
  graceLabel,
  graceHint,
  graceValue,
  graceUnit,
  onGraceFocus,
  onGraceChangeText,
  onGraceBlur,
  onToggleGraceUnit,
}: CheckInScheduleSectionProps) {
  return (
    <View style={styles.scheduleCard}>
      <Text style={styles.scheduleHeader}>{t(title)}</Text>

      <View style={styles.intervalCard}>
        <View style={styles.intervalTextCol}>
          <Text style={styles.intervalLabel}>{t(intervalLabel)}</Text>
          <Text style={styles.intervalHint}>{t(intervalHint)}</Text>
        </View>
        <View style={styles.intervalRow}>
          <IntervalValueControl
            styles={styles}
            value={intervalValue}
            unit={intervalUnit}
            onFocus={onIntervalFocus}
            onChangeText={onIntervalChangeText}
            onBlur={onIntervalBlur}
            onToggleUnit={onToggleIntervalUnit}
            t={t}
          />
        </View>
      </View>

      <View style={styles.intervalCard}>
        <View style={styles.intervalTextCol}>
          <Text style={styles.intervalLabel}>{t(startLabel)}</Text>
          <Text style={styles.intervalHint}>{t(startHint)}</Text>
        </View>
        <View style={styles.intervalRow}>
          <TimeValueControl
            styles={styles}
            hourValue={hourValue}
            minuteValue={minuteValue}
            amPm={amPm}
            onHourFocus={onHourFocus}
            onHourChangeText={onHourChangeText}
            onHourBlur={onHourBlur}
            onMinuteFocus={onMinuteFocus}
            onMinuteChangeText={onMinuteChangeText}
            onMinuteBlur={onMinuteBlur}
            onToggleAmPm={onToggleAmPm}
          />
        </View>
      </View>

      <View style={styles.intervalCard}>
        <View style={styles.intervalTextCol}>
          <Text style={styles.intervalLabel}>{t(graceLabel)}</Text>
          <Text style={styles.intervalHint}>{t(graceHint)}</Text>
        </View>
        <View style={styles.intervalRow}>
          <IntervalValueControl
            styles={styles}
            value={graceValue}
            unit={graceUnit}
            onFocus={onGraceFocus}
            onChangeText={onGraceChangeText}
            onBlur={onGraceBlur}
            onToggleUnit={onToggleGraceUnit}
            t={t}
          />
        </View>
      </View>
    </View>
  );
}
