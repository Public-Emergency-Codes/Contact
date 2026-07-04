import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
}

interface LocationState {
  currentLocation: Location | null;
  tracking: boolean;
  error: string | null;
}

const initialState: LocationState = {
  currentLocation: null,
  tracking: false,
  error: null,
};

const locationSlice = createSlice({
  name: 'location',
  initialState,
  reducers: {
    setLocation: (state, action: PayloadAction<Location>) => {
      state.currentLocation = action.payload;
      state.error = null;
    },
    startTracking: (state) => {
      state.tracking = true;
    },
    stopTracking: (state) => {
      state.tracking = false;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
  },
});

export const { setLocation, startTracking, stopTracking, setError } = locationSlice.actions;
export default locationSlice.reducer;
