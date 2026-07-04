import React, { useMemo, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
import { useAppSelector } from '../../store/hooks';
import makeCheckInSettingsStyles from './checkInSettingsStyles';
import { useTheme } from '../../context/ThemeContext';
import { useAppLanguage } from '../../context/AppLanguageContext';
import { translateWithDictionary } from '../../services/uiTranslationService';
import ToggleSwitch from '../../components/ToggleSwitch';
import { CheckInIntroSection, CheckInScheduleSection } from './CheckInScheduleSection';
import { CheckInEscalationSection } from './CheckInEscalationSection';
import { CheckInSettingsInfoModal } from './CheckInSettingsInfoModal';
import { useCheckInSettingsState } from './useCheckInSettingsState';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';

const Text = AppText;

interface CheckInSettingsScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: any) => void;
  };
}

export default function CheckInSettingsScreen({ navigation }: CheckInSettingsScreenProps) {
  const config = useAppSelector((s) => s.checkIn.config);
  const { colors } = useTheme();
  const { languageCode, dictionary } = useAppLanguage();
  const t = useCallback((value: string) => translateWithDictionary(value, languageCode, dictionary), [dictionary, languageCode]);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeCheckInSettingsStyles(colors, insets.top), [colors, insets.top]);
  const {
    localConfig,
    infoVisible,
    setInfoVisible,
    dayUnit,
    nightUnit,
    dayText,
    setDayText,
    nightText,
    setNightText,
    dayGraceText,
    setDayGraceText,
    nightGraceText,
    setNightGraceText,
    dayGraceUnit,
    nightGraceUnit,
    dayStartMinText,
    setDayStartMinText,
    nightStartMinText,
    setNightStartMinText,
    dayAmPm,
    nightAmPm,
    dayStartHourText,
    setDayStartHourText,
    nightStartHourText,
    setNightStartHourText,
    update,
    updateSchedule,
    changeDayUnit,
    changeNightUnit,
    changeDayGraceUnit,
    changeNightGraceUnit,
    toggleDayAmPm,
    toggleNightAmPm,
    to24h,
    batteryExempt,
  } = useCheckInSettingsState(config);

  // When leaving the screen: if check-in is enabled but battery optimization
  // isn't exempt, take the user straight to App Permissions with that toggle highlighted.
  const handleBack = useCallback(() => {
    if (localConfig.enabled && !batteryExempt) {
      navigation.navigate('Permissions', { highlightKey: 'battery_optimization' });
    } else {
      navigation.goBack();
    }
  }, [localConfig.enabled, batteryExempt, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={{ fontSize: 30, lineHeight: 30, color: colors.textPrimary }}>{'\u2039'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('Check-In Settings')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => setInfoVisible(true)}>
          {localConfig.enabled && <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Master toggle */}
        <View style={styles.enableRow}>
          <Text style={styles.enableLabel}>{localConfig.enabled ? t('Check-In Active') : t('Activate Check-In')}</Text>
          <ToggleSwitch value={localConfig.enabled} onValueChange={(v) => update('enabled', v)} />
        </View>

        {!localConfig.enabled && <CheckInIntroSection styles={styles} t={t} />}

        {localConfig.enabled && <>
        <CheckInScheduleSection
          styles={styles}
          t={t}
          title="Day Schedule"
          intervalLabel="Daytime check-in interval"
          intervalHint="Choose the amount of time between each daytime check-in"
          intervalValue={dayText}
          intervalUnit={dayUnit}
          onIntervalFocus={() => setDayText('')}
          onIntervalChangeText={setDayText}
          onIntervalBlur={() => {
            const nextValue = parseInt(dayText) || 1;
            setDayText(String(nextValue));
            updateSchedule('dayIntervalMinutes', dayUnit === 'hr' ? nextValue * 60 : nextValue);
          }}
          onToggleIntervalUnit={() => changeDayUnit(dayUnit === 'hr' ? 'min' : 'hr')}
          startLabel="Day starts"
          startHint="Hour when daytime check-in schedule begins"
          hourValue={dayStartHourText}
          minuteValue={dayStartMinText}
          amPm={dayAmPm}
          onHourFocus={() => setDayStartHourText('')}
          onHourChangeText={setDayStartHourText}
          onHourBlur={() => {
            const hour = Math.min(12, Math.max(1, parseInt(dayStartHourText) || 12));
            setDayStartHourText(String(hour));
            updateSchedule('dayStartHour', to24h(hour, dayAmPm));
          }}
          onMinuteFocus={() => setDayStartMinText('')}
          onMinuteChangeText={setDayStartMinText}
          onMinuteBlur={() => {
            const minute = Math.min(59, Math.max(0, parseInt(dayStartMinText) || 0));
            setDayStartMinText(String(minute).padStart(2, '0'));
            updateSchedule('dayStartMinute', minute);
          }}
          onToggleAmPm={toggleDayAmPm}
          graceLabel="Daytime grace period"
          graceHint="Time to dismiss the alarm before daytime escalation"
          graceValue={dayGraceText}
          graceUnit={dayGraceUnit}
          onGraceFocus={() => setDayGraceText('')}
          onGraceChangeText={setDayGraceText}
          onGraceBlur={() => {
            const nextValue = Math.min(dayGraceUnit === 'hr' ? 24 : 60, Math.max(1, parseInt(dayGraceText) || 1));
            setDayGraceText(String(nextValue));
            updateSchedule('dayGracePeriodMinutes', dayGraceUnit === 'hr' ? nextValue * 60 : nextValue);
          }}
          onToggleGraceUnit={() => changeDayGraceUnit(dayGraceUnit === 'hr' ? 'min' : 'hr')}
        />

        <CheckInScheduleSection
          styles={styles}
          t={t}
          title="Night Schedule"
          intervalLabel="Nighttime check-in interval"
          intervalHint="Choose the amount of time between each nighttime check-in"
          intervalValue={nightText}
          intervalUnit={nightUnit}
          onIntervalFocus={() => setNightText('')}
          onIntervalChangeText={setNightText}
          onIntervalBlur={() => {
            const nextValue = parseInt(nightText) || 1;
            setNightText(String(nextValue));
            updateSchedule('nightIntervalMinutes', nightUnit === 'hr' ? nextValue * 60 : nextValue);
          }}
          onToggleIntervalUnit={() => changeNightUnit(nightUnit === 'hr' ? 'min' : 'hr')}
          startLabel="Night starts"
          startHint="Hour when nighttime check-in schedule begins"
          hourValue={nightStartHourText}
          minuteValue={nightStartMinText}
          amPm={nightAmPm}
          onHourFocus={() => setNightStartHourText('')}
          onHourChangeText={setNightStartHourText}
          onHourBlur={() => {
            const hour = Math.min(12, Math.max(1, parseInt(nightStartHourText) || 12));
            setNightStartHourText(String(hour));
            updateSchedule('nightStartHour', to24h(hour, nightAmPm));
          }}
          onMinuteFocus={() => setNightStartMinText('')}
          onMinuteChangeText={setNightStartMinText}
          onMinuteBlur={() => {
            const minute = Math.min(59, Math.max(0, parseInt(nightStartMinText) || 0));
            setNightStartMinText(String(minute).padStart(2, '0'));
            updateSchedule('nightStartMinute', minute);
          }}
          onToggleAmPm={toggleNightAmPm}
          graceLabel="Nighttime grace period"
          graceHint="Time to dismiss the alarm before nighttime escalation"
          graceValue={nightGraceText}
          graceUnit={nightGraceUnit}
          onGraceFocus={() => setNightGraceText('')}
          onGraceChangeText={setNightGraceText}
          onGraceBlur={() => {
            const nextValue = Math.min(nightGraceUnit === 'hr' ? 24 : 60, Math.max(1, parseInt(nightGraceText) || 1));
            setNightGraceText(String(nextValue));
            updateSchedule('nightGracePeriodMinutes', nightGraceUnit === 'hr' ? nextValue * 60 : nextValue);
          }}
          onToggleGraceUnit={() => changeNightGraceUnit(nightGraceUnit === 'hr' ? 'min' : 'hr')}
        />

        <CheckInEscalationSection
          styles={styles}
          colors={colors}
          localConfig={localConfig}
          update={update}
          t={t}
        />

        </>}

      </ScrollView>
      <CheckInSettingsInfoModal visible={infoVisible} onClose={() => setInfoVisible(false)} styles={styles} colors={colors} t={t} />
    </SafeAreaView>
  );
}
