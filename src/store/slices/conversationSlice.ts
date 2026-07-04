import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ConversationState {
  archivedThreadIds: string[];
  starredThreadIds: string[];
  starredMessageIds: string[];
  readThreadIds: string[];
}

const initialState: ConversationState = {
  archivedThreadIds: [],
  starredThreadIds: [],
  starredMessageIds: [],
  readThreadIds: [],
};

const conversationSlice = createSlice({
  name: 'conversation',
  initialState,
  reducers: {
    archiveThread(state, action: PayloadAction<string>) {
      if (!state.archivedThreadIds.includes(action.payload)) {
        state.archivedThreadIds.push(action.payload);
      }
    },
    unarchiveThread(state, action: PayloadAction<string>) {
      state.archivedThreadIds = state.archivedThreadIds.filter(
        (id) => id !== action.payload,
      );
    },
    starThread(state, action: PayloadAction<string>) {
      if (!state.starredThreadIds.includes(action.payload)) {
        state.starredThreadIds.push(action.payload);
      }
    },
    unstarThread(state, action: PayloadAction<string>) {
      state.starredThreadIds = state.starredThreadIds.filter(
        (id) => id !== action.payload,
      );
    },
    starMessage(state, action: PayloadAction<string>) {
      if (!state.starredMessageIds.includes(action.payload)) {
        state.starredMessageIds.push(action.payload);
      }
    },
    unstarMessage(state, action: PayloadAction<string>) {
      state.starredMessageIds = state.starredMessageIds.filter(
        (id) => id !== action.payload,
      );
    },
    markThreadRead(state, action: PayloadAction<string>) {
      if (!state.readThreadIds.includes(action.payload)) {
        state.readThreadIds.push(action.payload);
      }
    },
  },
});

export const {
  archiveThread,
  unarchiveThread,
  starThread,
  unstarThread,
  starMessage,
  unstarMessage,
  markThreadRead,
} = conversationSlice.actions;
export default conversationSlice.reducer;
