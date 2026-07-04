import { check, request, openSettings, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { NativeModules, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { inCallService } from '../services/inCallService';

const { DirectSms, E911DetectorModule } = NativeModules;

// Opens the Android location permission settings page for this app directly
// (the screen showing "Allow all the time / While using app / Don't allow").
const openLocationPermissionSettings = async () => {
  try {
    await IntentLauncher.startActivityAsync(
      'android.intent.action.MANAGE_APP_PERMISSION' as any,
      {
        extra: {
          'android.intent.extra.PACKAGE_NAME': 'com.contact.app',
          'android.intent.extra.PERMISSION_GROUP_NAME': 'android.permission-group.LOCATION',
        },
      }
    );
  } catch {
    await openSettings().catch(() => {});
  }
};

// POST_NOTIFICATIONS was added in Android 13 (API 33) but is missing from this
// version of react-native-permissions — use the raw string directly.
const POST_NOTIFICATIONS_PERM = 'android.permission.POST_NOTIFICATIONS' as any;

export type PermState = 'granted' | 'denied' | 'blocked' | 'unavailable' | 'limited' | 'loading';

export type PermDef = {
  key: string;
  label: string;
  description: string;
  critical: boolean;
  checkPerm: () => Promise<PermState>;
  requestPerm: () => Promise<PermState>;
};

const androidCheck = async (perm: any): Promise<PermState> => {
  if (Platform.OS !== 'android') return 'unavailable';
  const r = await check(perm);
  return r as PermState;
};

const androidRequest = async (perm: any): Promise<PermState> => {
  if (Platform.OS !== 'android') return 'unavailable';
  // request() returns the committed new state directly from Android —
  // this is more reliable than calling check() afterwards which can be stale.
  const result = await request(perm);
  if (result === RESULTS.BLOCKED) {
    await openSettings().catch(() => {});
    // After returning from Settings, re-check for the actual current state.
    const current = await check(perm);
    return current as PermState;
  }
  return result as PermState;
};

export const PERMISSIONS_LIST: PermDef[] = [
  {
    key: 'background_location',
    label: 'Location',
    description: 'Required for emergency response. Tap "Allow all the time" on the next screen so 911 can locate you even if the app is in the background.',
    critical: true,
    // Requires BOTH foreground and background to be granted.
    checkPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      const [fg, bg] = await Promise.all([
        check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION),
        check(PERMISSIONS.ANDROID.ACCESS_BACKGROUND_LOCATION),
      ]);
      if ((fg === RESULTS.GRANTED || fg === RESULTS.LIMITED) &&
          (bg === RESULTS.GRANTED || bg === RESULTS.LIMITED)) {
        return 'granted';
      }
      if (fg === RESULTS.BLOCKED || bg === RESULTS.BLOCKED) return 'blocked';
      return 'denied';
    },
    requestPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      await openLocationPermissionSettings();
      const [fg, bg] = await Promise.all([
        check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION),
        check(PERMISSIONS.ANDROID.ACCESS_BACKGROUND_LOCATION),
      ]);
      if ((fg === RESULTS.GRANTED || fg === RESULTS.LIMITED) &&
          (bg === RESULTS.GRANTED || bg === RESULTS.LIMITED)) {
        return 'granted';
      }
      if (fg === RESULTS.BLOCKED || bg === RESULTS.BLOCKED) return 'blocked';
      return 'denied';
    },
  },
  {
    key: 'camera',
    label: 'Camera',
    description: 'Lets you share a live video feed with dispatchers so they can see exactly what is happening.',
    critical: true,
    checkPerm: () => androidCheck(PERMISSIONS.ANDROID.CAMERA),
    requestPerm: () => androidRequest(PERMISSIONS.ANDROID.CAMERA),
  },
  {
    key: 'microphone',
    label: 'Microphone',
    description: 'Required for voice communication through the emergency call interface.',
    critical: true,
    checkPerm: () => androidCheck(PERMISSIONS.ANDROID.RECORD_AUDIO),
    requestPerm: () => androidRequest(PERMISSIONS.ANDROID.RECORD_AUDIO),
  },
  {
    key: 'send_sms',
    label: 'Send SMS',
    description: 'Sends your location and emergency details to the 911 dispatcher as a text message.',
    critical: true,
    checkPerm: () => androidCheck(PERMISSIONS.ANDROID.SEND_SMS),
    requestPerm: () => androidRequest(PERMISSIONS.ANDROID.SEND_SMS),
  },
  {
    key: 'receive_sms',
    label: 'Receive SMS',
    description: 'Receives text replies from the 911 dispatcher directly in the chat.',
    critical: true,
    checkPerm: () => androidCheck(PERMISSIONS.ANDROID.RECEIVE_SMS),
    requestPerm: () => androidRequest(PERMISSIONS.ANDROID.RECEIVE_SMS),
  },
  {
    key: 'phone_access',
    label: 'Phone Access',
    description: 'Allows the app to place 911 calls directly as the default phone app.',
    critical: true,
    checkPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      // Both must be granted — show OFF if either is missing.
      const [call, state] = await Promise.all([
        check(PERMISSIONS.ANDROID.CALL_PHONE),
        check(PERMISSIONS.ANDROID.READ_PHONE_STATE),
      ]);
      // If both are granted/limited treat as granted; otherwise return the worse state.
      if ((call === RESULTS.GRANTED || call === RESULTS.LIMITED) &&
          (state === RESULTS.GRANTED || state === RESULTS.LIMITED)) {
        return 'granted';
      }
      // Return the worse of the two
      const priority: PermState[] = ['denied', 'blocked', 'unavailable', 'limited', 'granted'];
      const callIdx = priority.indexOf(call as PermState);
      const stateIdx = priority.indexOf(state as PermState);
      return priority[Math.min(callIdx, stateIdx)] as PermState;
    },
    requestPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      // Android grants the whole PHONE group at once — requesting CALL_PHONE
      // typically grants READ_PHONE_STATE too. Request both to be sure.
      const call = await request(PERMISSIONS.ANDROID.CALL_PHONE);
      if (call === RESULTS.BLOCKED) {
        await openSettings().catch(() => {});
        const current = await check(PERMISSIONS.ANDROID.CALL_PHONE);
        return current as PermState;
      }
      // Request READ_PHONE_STATE in case it wasn't auto-granted
      const state = await request(PERMISSIONS.ANDROID.READ_PHONE_STATE);
      if (
        call === RESULTS.GRANTED || call === RESULTS.LIMITED ||
        state === RESULTS.GRANTED || state === RESULTS.LIMITED
      ) return 'granted';
      return call as PermState;
    },
  },
  {
    key: 'contacts',
    label: 'Contacts',
    description: 'Allows this app to read your contacts so you can quickly reach them during an emergency.',
    critical: false,
    checkPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      const [read, write] = await Promise.all([
        check(PERMISSIONS.ANDROID.READ_CONTACTS),
        check(PERMISSIONS.ANDROID.WRITE_CONTACTS),
      ]);
      if ((read === RESULTS.GRANTED || read === RESULTS.LIMITED) &&
          (write === RESULTS.GRANTED || write === RESULTS.LIMITED)) {
        return 'granted';
      }
      if (read === RESULTS.BLOCKED || write === RESULTS.BLOCKED) return 'blocked';
      return 'denied';
    },
    requestPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      const write = await request(PERMISSIONS.ANDROID.WRITE_CONTACTS);
      if (write === RESULTS.BLOCKED) {
        await openSettings().catch(() => {});
        const current = await check(PERMISSIONS.ANDROID.WRITE_CONTACTS);
        return current as PermState;
      }
      const read = await request(PERMISSIONS.ANDROID.READ_CONTACTS);
      if ((write === RESULTS.GRANTED || write === RESULTS.LIMITED) &&
          (read === RESULTS.GRANTED || read === RESULTS.LIMITED)) {
        return 'granted';
      }
      return 'denied';
    },
  },
  {
    key: 'notifications',
    label: 'Notifications',
    description: 'Delivers check-in alarms, certified responder alerts, and critical emergency reminders.',
    critical: true,
    checkPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      // POST_NOTIFICATIONS only applies on Android 13+ (API 33).
      // On older versions the permission is effectively auto-granted.
      const { Version } = Platform;
      if (typeof Version === 'number' && Version < 33) return 'granted';
      const r = await check(POST_NOTIFICATIONS_PERM);
      return r as PermState;
    },
    requestPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      const { Version } = Platform;
      if (typeof Version === 'number' && Version < 33) return 'granted';
      const result = await request(POST_NOTIFICATIONS_PERM);
      if (result === RESULTS.BLOCKED) {
        await openSettings().catch(() => {});
        const current = await check(POST_NOTIFICATIONS_PERM);
        return current as PermState;
      }
      return result as PermState;
    },
  },
  {
    key: 'overlay',
    label: 'Display Over Other Apps',
    description: 'Brings the emergency interface to the front over any screen — critical so you are never locked out during a crisis.',
    critical: true,
    checkPerm: async (): Promise<PermState> => {
      if (!E911DetectorModule) return 'unavailable';
      try {
        const granted: boolean = await E911DetectorModule.checkOverlayPermission();
        return granted ? 'granted' : 'denied';
      } catch { return 'unavailable'; }
    },
    requestPerm: async (): Promise<PermState> => {
      if (!E911DetectorModule) return 'unavailable';
      await E911DetectorModule.requestOverlayPermission().catch(() => {});
      try {
        const granted: boolean = await E911DetectorModule.checkOverlayPermission();
        return granted ? 'granted' : 'denied';
      } catch { return 'unavailable'; }
    },
  },
  {
    key: 'battery_optimization',
    label: 'Background Alarms',
    description: 'Exempts the app from battery optimization so check-in alarms fire reliably even when the screen is off or the phone is in Doze mode.',
    critical: false,
    checkPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      try {
        if (!E911DetectorModule?.isIgnoringBatteryOptimizations) return 'unavailable';
        const ignored: boolean = await E911DetectorModule.isIgnoringBatteryOptimizations();
        if (ignored) return 'granted';
        return 'denied';
      } catch { return 'unavailable'; }
    },
    requestPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      try {
        if (!E911DetectorModule?.requestIgnoreBatteryOptimizations) return 'unavailable';
        await E911DetectorModule.requestIgnoreBatteryOptimizations();
        const ignored: boolean = await E911DetectorModule.isIgnoringBatteryOptimizations();
        return ignored ? 'granted' : 'denied';
      } catch { return 'unavailable'; }
    },
  },
  {
    key: 'dnd',
    label: 'Do Not Disturb Access',
    description: 'Suppresses other app notifications while you are in an active emergency call so nothing interrupts you.',
    critical: false,
    checkPerm: async (): Promise<PermState> => {
      if (!E911DetectorModule) return 'unavailable';
      try {
        const granted: boolean = await E911DetectorModule.isDndPermissionGranted();
        return granted ? 'granted' : 'denied';
      } catch { return 'unavailable'; }
    },
    requestPerm: async (): Promise<PermState> => {
      if (!E911DetectorModule) return 'unavailable';
      await E911DetectorModule.requestDndPermission().catch(() => {});
      try {
        const granted: boolean = await E911DetectorModule.isDndPermissionGranted();
        return granted ? 'granted' : 'denied';
      } catch { return 'unavailable'; }
    },
  },
  {
    key: 'default_dialer',
    label: 'Default phone app',
    description: 'Makes and manages calls in this app, including the in-app emergency call controls.',
    critical: false,
    checkPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      try {
        const isDefault = await inCallService.isDefaultDialer();
        return isDefault ? 'granted' : 'denied';
      } catch { return 'unavailable'; }
    },
    requestPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android') return 'unavailable';
      try {
        await inCallService.requestDefaultDialer();
        return (await inCallService.isDefaultDialer()) ? 'granted' : 'denied';
      } catch { return 'unavailable'; }
    },
  },
  {
    key: 'default_sms',
    label: 'Default texting app',
    description: 'Sends, receives, and manages your text conversations in this app.',
    critical: false,
    checkPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android' || !DirectSms?.isDefaultSmsApp) return 'unavailable';
      try {
        return (await DirectSms.isDefaultSmsApp()) ? 'granted' : 'denied';
      } catch { return 'unavailable'; }
    },
    requestPerm: async (): Promise<PermState> => {
      if (Platform.OS !== 'android' || !DirectSms?.requestDefaultSmsApp) return 'unavailable';
      try {
        await DirectSms.requestDefaultSmsApp();
        return (await DirectSms.isDefaultSmsApp()) ? 'granted' : 'denied';
      } catch { return 'unavailable'; }
    },
  },
];

export const CRITICAL_KEYS = PERMISSIONS_LIST.filter(p => p.critical).map(p => p.key);

export const isGranted = (state: PermState) => state === 'granted' || state === 'limited';
