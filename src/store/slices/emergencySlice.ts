import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface VolumeStatus {
  isMuted: boolean;
  isLow: boolean;
  volumePercentage: number;
}

export interface SmsTelemetrySnapshot {
  latitude: number;
  longitude: number;
  accuracy: number;
  raw_mcc: number | null;
  raw_mnc: number | null;
  raw_lac_tac: number | null;
  raw_cid: number | null;
  cell_resolved_lat: number | null;
  cell_resolved_lon: number | null;
  wifi_resolved_json_array: Array<{ bssid: string; signalStrength: number }>;
  centroid_lat: number | null;
  centroid_lon: number | null;
  centroid_unc: number | null;
  timestamp: number;
}

interface EmergencyTelemetrySnapshot {
  raw_mcc: number | null;
  raw_mnc: number | null;
  raw_lac_tac: number | null;
  raw_cid: number | null;
  cell_resolved_lat: number | null;
  cell_resolved_lon: number | null;
  wifi_resolved_json_array: Array<{ bssid: string; signalStrength: number }>;
}

interface EmergencyState {
  isActive: boolean;
  currentEvent: any | null;
  countdown: number;
  countdownActive: boolean;
  countdownTimer: any;
  isRecording: boolean;
  callInProgress: boolean;
  silentCallActive: boolean;
  volumeStatus: VolumeStatus | null;
  telemetrySnapshot: EmergencyTelemetrySnapshot | null;
  smsTelemetrySnapshot: SmsTelemetrySnapshot | null;
}

const initialState: EmergencyState = {
  isActive: false,
  currentEvent: null,
  countdown: 4,
  countdownActive: false,
  countdownTimer: null,
  isRecording: false,
  callInProgress: false,
  silentCallActive: false,
  volumeStatus: null,
  telemetrySnapshot: null,
  smsTelemetrySnapshot: null,
};

const emergencySlice = createSlice({
  name: 'emergency',
  initialState,
  reducers: {
    startCountdown: (state, action: PayloadAction<number>) => {
      state.countdown = action.payload;
      state.countdownActive = true;
    },
    decrementCountdown: (state) => {
      if (state.countdown > 0) {
        state.countdown -= 1;
      }
    },
    cancelCountdown: (state) => {
      state.countdownActive = false;
      state.countdown = 4;
    },
    activateEmergency: (state, action: PayloadAction<any>) => {
      state.isActive = true;
      state.currentEvent = action.payload;
      state.countdownActive = false;
      state.telemetrySnapshot = action.payload?.telemetrySnapshot || null;
    },
    deactivateEmergency: (state) => {
      state.isActive = false;
      state.currentEvent = null;
      state.isRecording = false;
      state.callInProgress = false;
      state.silentCallActive = false;
      state.volumeStatus = null;
      state.telemetrySnapshot = null;
      state.smsTelemetrySnapshot = null;
    },
    setCountdownTimer: (state, action: PayloadAction<any>) => {
      state.countdownTimer = action.payload;
    },
    setRecording: (state, action: PayloadAction<boolean>) => {
      state.isRecording = action.payload;
    },
    setCallInProgress: (state, action: PayloadAction<boolean>) => {
      state.callInProgress = action.payload;
    },
    setSilentCallActive: (state, action: PayloadAction<boolean>) => {
      state.silentCallActive = action.payload;
    },
    setVolumeStatus: (state, action: PayloadAction<VolumeStatus | null>) => {
      state.volumeStatus = action.payload;
    },
    setTelemetrySnapshot: (state, action: PayloadAction<EmergencyTelemetrySnapshot | null>) => {
      state.telemetrySnapshot = action.payload;
    },
    setSmsTelemetrySnapshot: (state, action: PayloadAction<SmsTelemetrySnapshot | null>) => {
      state.smsTelemetrySnapshot = action.payload;
    },
  },
});

export const {
  startCountdown,
  decrementCountdown,
  cancelCountdown,
  activateEmergency,
  deactivateEmergency,
  setCountdownTimer,
  setRecording,
  setCallInProgress,
  setSilentCallActive,
  setVolumeStatus,
  setTelemetrySnapshot,
  setSmsTelemetrySnapshot,
} = emergencySlice.actions;

export default emergencySlice.reducer;
