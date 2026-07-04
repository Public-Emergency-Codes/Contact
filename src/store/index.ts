import { configureStore } from '@reduxjs/toolkit';
import emergencyReducer from './slices/emergencySlice';
import locationReducer from './slices/locationSlice';
import psapMessageReducer from './slices/psapMessageSlice';
import checkInReducer from './slices/checkInSlice';
import savedAddressesReducer from './slices/savedAddressesSlice';
import themeReducer from './slices/themeSlice';
import conversationReducer from './slices/conversationSlice';

export const store = configureStore({
  reducer: {
    emergency: emergencyReducer,
    location: locationReducer,
    psapMessages: psapMessageReducer,
    checkIn: checkInReducer,
    savedAddresses: savedAddressesReducer,
    theme: themeReducer,
    conversation: conversationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['emergency/setCountdownTimer'],
        ignoredPaths: ['emergency.countdownTimer'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
