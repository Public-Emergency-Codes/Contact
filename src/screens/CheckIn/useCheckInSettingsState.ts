import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { useAppDispatch } from '../../store/hooks';
import { CheckInConfig, setCheckInConfig } from '../../store/slices/checkInSlice';
import checkInService from '../../services/checkInService';
import { Meridiem, TimeUnit } from './checkInSettingsTypes';

const STORAGE_KEY = 'checkin_config';

export function useCheckInSettingsState(config: CheckInConfig) {
  const dispatch = useAppDispatch();
  const [localConfig, setLocal] = useState(config);
  const [infoVisible, setInfoVisible] = useState(false);
  const [medicalInfoFocused, setMedicalInfoFocused] = useState(false);
  const [notesFocused, setNotesFocused] = useState(false);
  const [dayUnit, setDayUnit] = useState<TimeUnit>(() => config.schedule.dayIntervalMinutes < 60 ? 'min' : 'hr');
  const [nightUnit, setNightUnit] = useState<TimeUnit>(() => config.schedule.nightIntervalMinutes < 60 ? 'min' : 'hr');
  const [dayText, setDayText] = useState(() => config.schedule.dayIntervalMinutes < 60 ? String(config.schedule.dayIntervalMinutes) : String(Math.round(config.schedule.dayIntervalMinutes / 60)));
  const [nightText, setNightText] = useState(() => config.schedule.nightIntervalMinutes < 60 ? String(config.schedule.nightIntervalMinutes) : String(Math.round(config.schedule.nightIntervalMinutes / 60)));
  const [dayGraceText, setDayGraceText] = useState(() => String(config.schedule.dayGracePeriodMinutes ?? 5));
  const [nightGraceText, setNightGraceText] = useState(() => String(config.schedule.nightGracePeriodMinutes ?? 5));
  const [dayGraceUnit, setDayGraceUnit] = useState<TimeUnit>('min');
  const [nightGraceUnit, setNightGraceUnit] = useState<TimeUnit>('min');
  const [dayStartMinText, setDayStartMinText] = useState(() => String(config.schedule.dayStartMinute ?? 0).padStart(2, '0'));
  const [nightStartMinText, setNightStartMinText] = useState(() => String(config.schedule.nightStartMinute ?? 0).padStart(2, '0'));
  const [dayAmPm, setDayAmPm] = useState<Meridiem>(() => config.schedule.dayStartHour < 12 ? 'AM' : 'PM');
  const [nightAmPm, setNightAmPm] = useState<Meridiem>(() => config.schedule.nightStartHour < 12 ? 'AM' : 'PM');
  const to12h = (hour: number) => hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const [dayStartHourText, setDayStartHourText] = useState(() => String(to12h(config.schedule.dayStartHour)));
  const [nightStartHourText, setNightStartHourText] = useState(() => String(to12h(config.schedule.nightStartHour)));

  useEffect(() => {
    loadSaved();
  }, []);

  const [batteryExempt, setBatteryExempt] = useState<boolean>(true);

  // Check battery optimization state on mount so the UI can show a button
  // if needed. Never auto-request — that opens a system Activity.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NativeModules.ScreenLock?.isIgnoringBatteryOptimizations?.()
      .then((ignored: boolean) => setBatteryExempt(ignored))
      .catch(() => {});
  }, []);

  // Called only when the user explicitly taps the "Allow background alarms" button.
  const requestBatteryExemption = useCallback(() => {
    if (Platform.OS !== 'android') return;
    NativeModules.ScreenLock?.isIgnoringBatteryOptimizations?.()
      .then((ignored: boolean) => {
        if (ignored) { setBatteryExempt(true); return; }
        NativeModules.ScreenLock?.requestIgnoreBatteryOptimizations?.();
        // Re-check after a short delay so the button hides once the user grants it
        setTimeout(() => {
          NativeModules.ScreenLock?.isIgnoringBatteryOptimizations?.()
            .then((v: boolean) => setBatteryExempt(v))
            .catch(() => {});
        }, 2000);
      })
      .catch(() => {});
  }, []);

  const loadSaved = async () => {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (!json) return;

      const saved = JSON.parse(json) as CheckInConfig;
      const legacySchedule = saved.schedule as any;
      if (legacySchedule.gracePeriodMinutes !== undefined) {
        const gracePeriod = legacySchedule.gracePeriodMinutes;
        if (saved.schedule.dayGracePeriodMinutes === undefined) saved.schedule.dayGracePeriodMinutes = gracePeriod;
        if (saved.schedule.nightGracePeriodMinutes === undefined) saved.schedule.nightGracePeriodMinutes = gracePeriod;
        delete legacySchedule.gracePeriodMinutes;
      }
      if (saved.schedule.dayStartMinute === undefined) saved.schedule.dayStartMinute = 0;
      if (saved.schedule.nightStartMinute === undefined) saved.schedule.nightStartMinute = 0;

      setLocal(saved);
      dispatch(setCheckInConfig(saved));

      const dayMinutes = saved.schedule.dayIntervalMinutes ?? 60;
      const nightMinutes = saved.schedule.nightIntervalMinutes ?? 480;
      if (dayMinutes < 60) { setDayUnit('min'); setDayText(String(dayMinutes)); }
      else { setDayUnit('hr'); setDayText(String(Math.round(dayMinutes / 60))); }
      if (nightMinutes < 60) { setNightUnit('min'); setNightText(String(nightMinutes)); }
      else { setNightUnit('hr'); setNightText(String(Math.round(nightMinutes / 60))); }
    } catch {}
  };

  const localConfigRef = useRef(localConfig);
  useEffect(() => {
    localConfigRef.current = localConfig;
  }, [localConfig]);

  useEffect(() => {
    return () => {
      const latestConfig = localConfigRef.current;
      dispatch(setCheckInConfig(latestConfig));
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(latestConfig)).catch(() => {});
      if (!latestConfig.enabled) checkInService.stop().catch(() => {});
      else checkInService.resetSchedule();
    };
  }, [dispatch]);

  const update = <K extends keyof CheckInConfig,>(key: K, value: CheckInConfig[K]) => {
    setLocal((previous) => ({ ...previous, [key]: value }));
  };

  const updateSchedule = <K extends keyof CheckInConfig['schedule'],>(key: K, value: CheckInConfig['schedule'][K]) => {
    setLocal((previous) => ({ ...previous, schedule: { ...previous.schedule, [key]: value } }));
  };

  const changeDayUnit = (unit: TimeUnit) => {
    const minutes = localConfig.schedule.dayIntervalMinutes;
    setDayText(unit === 'hr' ? String(Math.round(minutes / 60)) : String(minutes));
    setDayUnit(unit);
  };

  const changeNightUnit = (unit: TimeUnit) => {
    const minutes = localConfig.schedule.nightIntervalMinutes;
    setNightText(unit === 'hr' ? String(Math.round(minutes / 60)) : String(minutes));
    setNightUnit(unit);
  };

  const changeDayGraceUnit = (unit: TimeUnit) => {
    const minutes = localConfig.schedule.dayGracePeriodMinutes ?? 5;
    setDayGraceText(unit === 'hr' ? String(Math.round(minutes / 60)) : String(minutes));
    setDayGraceUnit(unit);
  };

  const changeNightGraceUnit = (unit: TimeUnit) => {
    const minutes = localConfig.schedule.nightGracePeriodMinutes ?? 5;
    setNightGraceText(unit === 'hr' ? String(Math.round(minutes / 60)) : String(minutes));
    setNightGraceUnit(unit);
  };

  const to24h = (hour: number, amPm: Meridiem) => amPm === 'AM' ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12);

  const toggleDayAmPm = () => {
    const nextAmPm = dayAmPm === 'AM' ? 'PM' : 'AM';
    setDayAmPm(nextAmPm);
    const hour = Math.min(12, Math.max(1, parseInt(dayStartHourText) || 12));
    updateSchedule('dayStartHour', to24h(hour, nextAmPm));
  };

  const toggleNightAmPm = () => {
    const nextAmPm = nightAmPm === 'AM' ? 'PM' : 'AM';
    setNightAmPm(nextAmPm);
    const hour = Math.min(12, Math.max(1, parseInt(nightStartHourText) || 12));
    updateSchedule('nightStartHour', to24h(hour, nextAmPm));
  };

  return {
    localConfig,
    infoVisible,
    setInfoVisible,
    medicalInfoFocused,
    notesFocused,
    setMedicalInfoFocused,
    setNotesFocused,
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
    requestBatteryExemption,
  };
}
