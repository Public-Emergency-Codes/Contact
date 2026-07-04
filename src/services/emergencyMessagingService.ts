/**
 * Native SMS Service — Background Silent Send
 *
 * Uses a custom native Android module (DirectSms) that calls
 * SmsManager.sendTextMessage() to send SMS completely in the background.
 * No UI is shown. Messages appear in the user's sent SMS history.
 *
 * Features:
 *  - Parallel sending via Promise.allSettled()
 *  - Automatic single retry on per-contact failure
 *  - Emergency alert + resolved notification messages
 */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { DirectSms } = NativeModules;

export interface SmsRecipient {
  name: string;
  phone: string;
  include_address_in_sms?: boolean;
}

export interface EmergencySmsOptions {
  contacts: SmsRecipient[];
  userName: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string | null;
  };
  customMessage?: string;
  /** Extra address/building info from saved addresses (only when includeInSms is true). */
  savedAddressInfo?: string | null;
}

export interface SmsSendResult {
  success: boolean;
  method: 'direct' | 'failed';
  sentCount: number;
  failedCount: number;
  error?: string;
}

class EmergencyMessagingService {
  private static MAX_RETRIES = 1;

  /** Request SEND_SMS + READ_PHONE_STATE runtime permissions. */
  private async ensurePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const perms = [
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      ];
      const results = await PermissionsAndroid.requestMultiple(perms);
      const smsOk =
        results[PermissionsAndroid.PERMISSIONS.SEND_SMS] === PermissionsAndroid.RESULTS.GRANTED;
      const phoneOk =
        results[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === PermissionsAndroid.RESULTS.GRANTED;
      console.log(`[EmergencyMessagingService] Permissions — SEND_SMS: ${smsOk}, READ_PHONE_STATE: ${phoneOk}`);
      return smsOk && phoneOk;
    } catch {
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    return Platform.OS === 'android' && !!DirectSms;
  }

  /** Send a single SMS with up to MAX_RETRIES automatic retries. */
  private async sendWithRetry(phone: string, message: string): Promise<void> {
    let lastErr: any;
    for (let attempt = 0; attempt <= EmergencyMessagingService.MAX_RETRIES; attempt++) {
      try {
        await DirectSms.sendSms(phone, message, '');
        return;
      } catch (err: any) {
        lastErr = err;
        if (attempt < EmergencyMessagingService.MAX_RETRIES) {
          console.log(`[EmergencyMessagingService] Retry ${attempt + 1} for ${phone}`);
          await new Promise<void>((r) => setTimeout(r, 500));
        }
      }
    }
    throw lastErr;
  }

  buildEmergencyMessage(options: EmergencySmsOptions): string {
    const { userName, location, customMessage, savedAddressInfo } = options;
    if (customMessage) return customMessage;

    let msg = `🚨 EMERGENCY ALERT 🚨\n\n`;
    msg += `${userName} has activated an emergency alert and may need help.\n\n`;
    if (location?.address) {
      msg += `📍 Location: ${location.address}\n`;
    }
    if (location?.latitude && location?.longitude) {
      msg += `📍 Map: https://maps.google.com/?q=${location.latitude},${location.longitude}\n`;
    }
    if (savedAddressInfo) {
      msg += `\n${savedAddressInfo}\n`;
    }

    msg += `\nPlease try to reach ${userName} immediately.`;
    return msg;
  }

  buildResolvedMessage(userName: string): string {
    let msg = `✅ EMERGENCY RESOLVED\n\n`;
    msg += `${userName}'s emergency alert has been deactivated.\n`;
    msg += `No further action is needed at this time.\n\n`;

    return msg;
  }

  /**
   * Send SMS silently in the background to all contacts (parallel + retry).
   * Uses Android SmsManager directly — no UI shown at all.
   */
  async sendEmergencySms(options: EmergencySmsOptions): Promise<SmsSendResult> {
    try {
      if (!DirectSms) {
        console.warn('[EmergencyMessagingService] DirectSms native module not available');
        return { success: false, method: 'failed', sentCount: 0, failedCount: 0, error: 'Native module not built' };
      }

      const phones = options.contacts.map((c) => c.phone).filter(Boolean);
      if (phones.length === 0) {
        return { success: false, method: 'failed', sentCount: 0, failedCount: 0, error: 'No contacts' };
      }

      const granted = await this.ensurePermission();
      if (!granted) {
        console.warn('[EmergencyMessagingService] SEND_SMS permission denied');
        return { success: false, method: 'failed', sentCount: 0, failedCount: 0, error: 'SMS permission denied' };
      }

      const message = this.buildEmergencyMessage(options);
      console.log(`[EmergencyMessagingService] Sending background SMS to ${phones.length} contacts (parallel)...`);

      const results = await Promise.allSettled(
        phones.map((phone) => this.sendWithRetry(phone, message)),
      );

      let sentCount = 0;
      const errors: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          sentCount++;
          console.log(`[EmergencyMessagingService] ✅ Sent to ${phones[i]}`);
        } else {
          errors.push(`${phones[i]}: ${r.reason?.message || 'failed'}`);
          console.error(`[EmergencyMessagingService] ❌ Failed ${phones[i]}:`, r.reason);
        }
      });

      const failedCount = phones.length - sentCount;
      if (sentCount > 0) {
        console.log(`[EmergencyMessagingService] Done: ${sentCount}/${phones.length} sent`);
        return { success: true, method: 'direct', sentCount, failedCount };
      }
      return { success: false, method: 'failed', sentCount: 0, failedCount, error: errors.join('; ') };
    } catch (error: any) {
      console.error('[EmergencyMessagingService] Send failed:', error);
      return { success: false, method: 'failed', sentCount: 0, failedCount: 0, error: error?.message };
    }
  }

  /**
   * Notify emergency contacts that the emergency has been resolved.
   */
  async sendResolvedSms(contacts: SmsRecipient[], userName: string): Promise<SmsSendResult> {
    return this.sendEmergencySms({
      contacts,
      userName,
      customMessage: this.buildResolvedMessage(userName),
    });
  }
}

const emergencyMessagingService = new EmergencyMessagingService();
export default emergencyMessagingService;
