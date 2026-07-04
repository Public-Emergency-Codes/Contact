import { NativeModules, Platform } from 'react-native';

const { CustomContactModule } = NativeModules;

/**
 * Adds a contact using the custom native module that resolves the account
 * from existing RawContacts (avoiding expo-contacts' null-account crash
 * on Android 14+ devices with cloud accounts).
 *
 * Returns true on success, false if the module is unavailable or fails.
 */
export async function addContactViaCustomModule(
  name: string,
  phoneNumber: string,
): Promise<boolean> {
  if (Platform.OS !== 'android' || !CustomContactModule) {
    return false;
  }
  try {
    await CustomContactModule.addContact({ name, phoneNumber });
    return true;
  } catch (e: any) {
    console.warn('[CustomContactModule] addContact failed:', e?.message);
    return false;
  }
}
