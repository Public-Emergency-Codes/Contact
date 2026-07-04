import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { inCallService } from './inCallService';

const toDialable = (value: string) => value.replace(/[^\d+*#,;]/g, '');

function queueRegularCallReturnWidget() {
  if (Platform.OS !== 'android') return;
  setTimeout(async () => {
    // Only show the return widget if a call is still active.  The call
    // may have ended during the 1.2 s delay (short call, immediate
    // hang-up, etc.).
    if (await inCallService.hasActiveCall()) {
      await inCallService.showReturnWidget('Return to call', 'Call active', true, false, null);
    }
  }, 1200);
}

/**
 * Ensure the app has the necessary permissions to place calls in-app
 * via TelecomManager.  Requests CALL_PHONE if needed; prompts for the
 * default-dialer role as a last resort.  Returns true when in-app
 * calling should work.
 */
async function ensureInAppCallCapability(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  // Already capable — nothing to do.
  if (await inCallService.canPlaceCallInApp()) return true;

  // Request CALL_PHONE (needed for TelecomManager.placeCall).
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CALL_PHONE,
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      // Permission just granted — give Android a moment to register it.
      return await inCallService.canPlaceCallInApp();
    }
  } catch { /* continue to default-dialer prompt */ }

  // Last resort: ask the user to set this app as the default phone app.
  // This gives us the DIALER role which lets TelecomManager route calls
  // through our InCallService without CALL_PHONE.
  try {
    await inCallService.requestDefaultDialer();
    // The user may or may not have accepted — check again.
    return await inCallService.canPlaceCallInApp();
  } catch { return false; }
}

export async function placeContactCall(phoneNumber: string, onStarted?: () => void): Promise<boolean> {
  const dialable = toDialable(phoneNumber);
  if (!dialable) {
    Alert.alert('Cannot start call', 'This contact does not have a valid phone number.');
    return false;
  }

  if (Platform.OS === 'android') {
    // Make sure we can place the call in-app before trying.  Without
    // this the native module falls back to ACTION_DIAL which sends the
    // user to the system dialer.
    const canCallInApp = await ensureInAppCallCapability();

    const launched = await inCallService.placeCall(dialable);
    if (launched) {
      // If we just acquired the capability, TelecomManager.placeCall
      // keeps the call inside the app.  If we still lack permission
      // the native module's own fallback (ACTION_DIAL) ran instead.
      if (!canCallInApp) {
        // Native module already opened the system dialer — nothing
        // more to do here.
      }
      queueRegularCallReturnWidget();
      onStarted?.();
      return true;
    }

    // placeCall returned false — extremely rare (no Activity, etc.).
    // Use Android's built-in call action before falling back to a dial pad.
    const telUrl = `tel:${dialable}`;
    for (const action of [
      'android.intent.action.CALL',
      'android.intent.action.DIAL',
      'android.intent.action.VIEW',
    ]) {
      try {
        await IntentLauncher.startActivityAsync(action, { data: telUrl });
        queueRegularCallReturnWidget();
        onStarted?.();
        return true;
      } catch { /* try next */ }
    }
  }

  // iOS / final fallback
  const telUrl = `tel:${dialable}`;
  try {
    const canOpen = await Linking.canOpenURL(telUrl);
    if (canOpen) {
      await Linking.openURL(telUrl);
      queueRegularCallReturnWidget();
      onStarted?.();
      return true;
    }
  } catch { }

  Alert.alert('Cannot start call', 'No calling app is available on this device.');
  return false;
}

export async function placeContactVideoCall(phoneNumber: string, onStarted?: () => void): Promise<boolean> {
  const dialable = toDialable(phoneNumber);
  if (!dialable) {
    Alert.alert('Cannot start call', 'This contact does not have a valid phone number.');
    return false;
  }

  if (Platform.OS === 'android') {
    await ensureInAppCallCapability();

    const launched = await inCallService.placeVideoCall(dialable);
    if (launched) {
      queueRegularCallReturnWidget();
      onStarted?.();
      return true;
    }

    // Video call not supported — fall back to voice.
    const regularLaunched = await inCallService.placeCall(dialable);
    if (regularLaunched) {
      queueRegularCallReturnWidget();
      onStarted?.();
      return true;
    }

    Alert.alert('Cannot start call', 'No calling app is available on this device.');
    return false;
  }

  const telUrl = `tel:${dialable}`;
  for (const target of [`facetime:${dialable}`, telUrl]) {
    try {
      const canOpen = await Linking.canOpenURL(target);
      if (canOpen) {
        await Linking.openURL(target);
        queueRegularCallReturnWidget();
        onStarted?.();
        return true;
      }
    } catch {
      // Try next iOS fallback.
    }
  }

  Alert.alert('Cannot start call', 'No calling app is available on this device.');
  return false;
}

export async function placeContactSms(phoneNumber: string): Promise<boolean> {
  const dialable = toDialable(phoneNumber);
  if (!dialable) {
    Alert.alert('Cannot send SMS', 'This contact does not have a valid phone number.');
    return false;
  }

  const smsUrl = `sms:${dialable}`;
  try {
    const canOpen = await Linking.canOpenURL(smsUrl);
    if (canOpen) {
      await Linking.openURL(smsUrl);
      return true;
    }
  } catch {}

  Alert.alert('Cannot send SMS', 'No messaging app is available on this device.');
  return false;
}
