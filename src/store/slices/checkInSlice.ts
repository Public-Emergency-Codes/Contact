import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface CheckInSchedule {
  dayIntervalMinutes: number;       // e.g. 360 = 6 hours
  nightIntervalMinutes: number;     // e.g. 480 = 8 hours
  dayStartHour: number;             // 0-23, e.g. 7 = 7 AM
  dayStartMinute: number;           // 0-59, e.g. 30 = :30
  nightStartHour: number;           // 0-23, e.g. 22 = 10 PM
  nightStartMinute: number;         // 0-59
  dayGracePeriodMinutes: number;    // grace period during daytime, e.g. 5
  nightGracePeriodMinutes: number;  // grace period during nighttime, e.g. 5
}

export interface CheckInConfig {
  enabled: boolean;
  schedule: CheckInSchedule;
  alertEmergencyContacts: boolean;  // "Only Alert Contacts" — skip 911, SMS only
  silentCheckIn: boolean;           // no alarm sound, just SMS contacts, no 911
}

export interface CheckInState {
  config: CheckInConfig;
  isAlarmActive: boolean;       // alarm is currently sounding
  nextCheckInTime: string | null; // ISO timestamp of next check-in
  lastCheckInTime: string | null; // ISO timestamp of last successful check-in
  alarmStartTime: string | null;  // when current alarm started
  missedCount: number;            // total missed check-ins (historical)
}

const defaultSchedule: CheckInSchedule = {
  dayIntervalMinutes: 360,
  nightIntervalMinutes: 480,
  dayStartHour: 7,
  dayStartMinute: 0,
  nightStartHour: 22,
  nightStartMinute: 0,
  dayGracePeriodMinutes: 5,
  nightGracePeriodMinutes: 5,
};

const initialState: CheckInState = {
  config: {
    enabled: false,
    schedule: defaultSchedule,
    alertEmergencyContacts: false,
    silentCheckIn: false,
  },
  isAlarmActive: false,
  nextCheckInTime: null,
  lastCheckInTime: null,
  alarmStartTime: null,
  missedCount: 0,
};

const checkInSlice = createSlice({
  name: 'checkIn',
  initialState,
  reducers: {
    setCheckInConfig: (state, action: PayloadAction<Partial<CheckInConfig>>) => {
      state.config = { ...state.config, ...action.payload };
    },
    setSchedule: (state, action: PayloadAction<Partial<CheckInSchedule>>) => {
      state.config.schedule = { ...state.config.schedule, ...action.payload };
    },
    setEnabled: (state, action: PayloadAction<boolean>) => {
      state.config.enabled = action.payload;
    },
    triggerAlarm: (state) => {
      state.isAlarmActive = true;
      state.alarmStartTime = new Date().toISOString();
    },
    dismissAlarm: (state) => {
      state.isAlarmActive = false;
      state.alarmStartTime = null;
      state.lastCheckInTime = new Date().toISOString();
    },
    alarmExpired: (state) => {
      state.isAlarmActive = false;
      state.alarmStartTime = null;
      state.missedCount += 1;
    },
    setNextCheckInTime: (state, action: PayloadAction<string | null>) => {
      state.nextCheckInTime = action.payload;
    },
    resetCheckIn: () => initialState,
  },
});

export const {
  setCheckInConfig,
  setSchedule,
  setEnabled,
  triggerAlarm,
  dismissAlarm,
  alarmExpired,
  setNextCheckInTime,
  resetCheckIn,
} = checkInSlice.actions;

export default checkInSlice.reducer;
