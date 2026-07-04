import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

const { AndroidMedicalInfo } = NativeModules;

type PermissionRequestResult = {
  granted: boolean;
  status: 'granted' | 'denied' | 'never_ask_again' | 'unavailable';
};

export type MedicalSyncResult = {
  success: boolean;
  reason?: string;
};

export type MedicalSyncPayload = {
  bloodType: string;
  organDonor: boolean;
  medicalConditions: string;
  allergies: string;
  medications: string;
  address: string;
  notes: string; // maps from psapNotes
  weight?: string;
  height?: string;
  dateOfBirth?: string;
  profilePhotoUri?: string;
};

const androidMedicalInfoService = {
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!AndroidMedicalInfo;
  },

  async hasPermission(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      return await AndroidMedicalInfo.checkPermission();
    } catch {
      return false;
    }
  },

  async requestPermission(): Promise<PermissionRequestResult> {
    if (!this.isAvailable()) return { granted: false, status: 'unavailable' };
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS,
        {
          title: 'Contacts Permission Required',
          message:
            'Emergency Switch needs permission to write your medical ' +
            "information to Android's Safety & Emergency section so " +
            'first responders can see it on your lock screen without ' +
            'unlocking your phone.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      if (result === PermissionsAndroid.RESULTS.GRANTED) return { granted: true, status: 'granted' };
      if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return { granted: false, status: 'never_ask_again' };
      return { granted: false, status: 'denied' };
    } catch {
      return { granted: false, status: 'denied' };
    }
  },

  async sync(payload: MedicalSyncPayload): Promise<MedicalSyncResult> {
    console.log('[AndroidMedicalInfo] sync called, module available:', this.isAvailable());
    if (!this.isAvailable()) {
      console.log('[AndroidMedicalInfo] module not available');
      return { success: false, reason: 'module_unavailable' };
    }
    try {
      console.log('[AndroidMedicalInfo] calling native syncMedicalInfo with payload:', JSON.stringify(payload));
      const result = await AndroidMedicalInfo.syncMedicalInfo(payload);
      console.log('[AndroidMedicalInfo] native result:', JSON.stringify(result));

      if (typeof result === 'boolean') {
        if (!result) {
          console.error('[AndroidMedicalInfo] Sync failed: write_failed');
        }
        return { success: result, reason: result ? 'ok' : 'write_failed' };
      }

      if (!result?.success) {
        console.error('[AndroidMedicalInfo] Sync failed:', result?.reason || 'unknown_error');
      }

      return { success: !!result?.success, reason: result?.reason || (result?.success ? 'ok' : 'write_failed') };
    } catch (e) {
      console.error('[AndroidMedicalInfo] sync failed with exception:', e);
      return { success: false, reason: 'native_exception' };
    }
  },

  async getProfileName(): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      const name = await AndroidMedicalInfo.getProfileName();
      if (typeof name !== 'string') return null;
      const trimmed = name.trim();
      return trimmed.length ? trimmed : null;
    } catch {
      return null;
    }
  },

  async openMedicalInfoSettings(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    const actions = [
      'android.settings.EDIT_EMERGENCY_INFO',
      'android.settings.EMERGENCY_ASSISTANCE',
      'android.settings.SETTINGS',
    ];
    for (const action of actions) {
      try {
        await IntentLauncher.startActivityAsync(action);
        return true;
      } catch {
        // try next fallback action
      }
    }
    return false;
  },
};

export default androidMedicalInfoService;
