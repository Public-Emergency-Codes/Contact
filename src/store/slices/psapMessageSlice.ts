import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { EMERGENCY_TEST_NUMBER } from '../../services/runtimeConfig';

export interface PsapMessage {
  id: string;
  text: string;
  direction: 'outgoing' | 'incoming';
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'failed';
  sender?: string; // For incoming messages (PSAP number)
  imageUrl?: string;
}

interface PsapMessageState {
  messages: PsapMessage[];
  psapNumber: string;
  isActive: boolean;
}

const initialState: PsapMessageState = {
  messages: [],
  psapNumber: EMERGENCY_TEST_NUMBER,
  isActive: false,
};

const psapMessageSlice = createSlice({
  name: 'psapMessages',
  initialState,
  reducers: {
    addOutgoingMessage(
      state,
      action: PayloadAction<{ id: string; text: string; timestamp: number; imageUrl?: string }>,
    ) {
      state.messages.push({
        id: action.payload.id,
        text: action.payload.text,
        direction: 'outgoing',
        timestamp: action.payload.timestamp,
        status: 'sending',
        imageUrl: action.payload.imageUrl,
      });
    },

    addIncomingMessage(
      state,
      action: PayloadAction<{ id: string; text: string; sender: string; timestamp: number }>,
    ) {
      // Prevent duplicate messages
      if (state.messages.some((m) => m.id === action.payload.id)) return;
      state.messages.push({
        id: action.payload.id,
        text: action.payload.text,
        direction: 'incoming',
        timestamp: action.payload.timestamp,
        status: 'delivered',
        sender: action.payload.sender,
      });
    },

    updateMessageStatus(
      state,
      action: PayloadAction<{ id: string; status: PsapMessage['status'] }>,
    ) {
      const msg = state.messages.find((m) => m.id === action.payload.id);
      if (msg) msg.status = action.payload.status;
    },

    setActive(state, action: PayloadAction<boolean>) {
      state.isActive = action.payload;
    },

    setPsapNumber(state, action: PayloadAction<string>) {
      state.psapNumber = action.payload;
    },

    clearMessages(state) {
      state.messages = [];
    },
  },
});

export const {
  addOutgoingMessage,
  addIncomingMessage,
  updateMessageStatus,
  setActive,
  setPsapNumber,
  clearMessages,
} = psapMessageSlice.actions;

export default psapMessageSlice.reducer;
