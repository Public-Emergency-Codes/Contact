import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AddressLayoutInfo {
  buildingType: string;       // 'house' | 'apartment' | 'condo' | 'townhouse' | 'office' | 'unsure'
  totalFloors: string;        // free text number e.g. '3'
  hasElevator: string;        // 'yes' | 'no' | 'unsure'
  hasGate: string;            // 'yes' | 'no' | 'unsure'
  gateCode: string;           // free text
  parkingLocation: string;    // 'street' | 'driveway' | 'garage' | 'lot' | 'unsure'
  nearestCrossStreet: string; // free text
  entranceSide: string;       // 'front' | 'side' | 'back' | 'unsure'
  hasStairs: string;          // 'yes' | 'no' | 'unsure'
  additionalInfo?: string;    // free text additional notes
}

export interface SavedAddress {
  id: string;
  label: string;              // 'Home', 'Work', custom text
  address: string;            // full street address
  latitude?: number;
  longitude?: number;
  accessInstructions: string; // free text for any special instructions
  layout: AddressLayoutInfo;
  includeInSms: boolean;      // whether to send this info to emergency contacts
  createdAt: string;
  updatedAt: string;
}

interface SavedAddressesState {
  addresses: SavedAddress[];
  loaded: boolean;
}

const initialState: SavedAddressesState = {
  addresses: [],
  loaded: false,
};

const STORAGE_KEY = '@saved_addresses';

const savedAddressesSlice = createSlice({
  name: 'savedAddresses',
  initialState,
  reducers: {
    setAddresses: (state, action: PayloadAction<SavedAddress[]>) => {
      state.addresses = action.payload;
      state.loaded = true;
    },
    addAddress: (state, action: PayloadAction<SavedAddress>) => {
      state.addresses.push(action.payload);
      persistAddresses(state.addresses);
    },
    updateAddress: (state, action: PayloadAction<SavedAddress>) => {
      const idx = state.addresses.findIndex((a) => a.id === action.payload.id);
      if (idx !== -1) {
        state.addresses[idx] = action.payload;
        persistAddresses(state.addresses);
      }
    },
    removeAddress: (state, action: PayloadAction<string>) => {
      state.addresses = state.addresses.filter((a) => a.id !== action.payload);
      persistAddresses(state.addresses);
    },
  },
});

/** Persist addresses to AsyncStorage (fire-and-forget). */
function persistAddresses(addresses: SavedAddress[]) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(addresses)).catch((e) =>
    console.warn('[SavedAddresses] persist failed:', e),
  );
}

/** Load saved addresses from AsyncStorage into Redux. */
export async function loadSavedAddresses(
  dispatch: (action: any) => void,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const addresses: SavedAddress[] = raw ? JSON.parse(raw) : [];
    dispatch(savedAddressesSlice.actions.setAddresses(addresses));
  } catch (e) {
    console.warn('[SavedAddresses] load failed:', e);
    dispatch(savedAddressesSlice.actions.setAddresses([]));
  }
}

export const { setAddresses, addAddress, updateAddress, removeAddress } =
  savedAddressesSlice.actions;
export default savedAddressesSlice.reducer;
