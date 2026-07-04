/**
 * Check-In Service
 *
 * Manages the recurring check-in timer, triggers the alarm,
 * and escalates to 911 / emergency contacts when the user
 * fails to dismiss the alarm within the grace period.
 *
 * Timing strategy:
 *  - When screen is ON  → JS setTimeout fires fireAlarm() directly.
 *  - When screen is OFF → Native ScreenLockModule writes the absolute
 *    alarm time to SharedPreferences on ACTION_SCREEN_OFF and schedules
 *    AlarmManager.setExactAndAllowWhileIdle().  On ACTION_USER_PRESENT it
 *    compares wall-clock to the stored time and emits either
 *    "onScreenUnlocked" (still alive) or "onCheckInAlarmFired" (missed).
 *    JS never needs to track scheduledAlarmAt at all.
 */
import { NativeModules, Platform, Vibration } from 'react-native';
import { store } from '../store';
import {
  triggerAlarm,
  dismissAlarm,
  alarmExpired,
  setNextCheckInTime,
  CheckInSchedule,
} from '../store/slices/checkInSlice';
import checkInAlarmService from './checkInAlarmService';
import emergencyMessagingService, { SmsRecipient } from './emergencyMessagingService';
import contactCacheService from './contactCacheService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOCAL_PROFILE_KEY } from '../constants/profileMedical';


async function getLocalUserName(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_PROFILE_KEY);
    const profile = raw ? JSON.parse(raw) : null;
    const name = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();
    return name || 'App User';
  } catch {
    return 'App User';
  }
}

class CheckInService {
  private checkInTimer: ReturnType<typeof setTimeout> | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private graceExpiresAt: number | null = null;

  // ─── Native bridge helpers ──────────────────────────────────────────────────

  private pushIntervalToNative(intervalMs: number): void {
    try {
      if (Platform.OS === 'android' && NativeModules.ScreenLock) {
        NativeModules.ScreenLock.setCheckInIntervalMs(intervalMs);

        // Also push grace period so native GracePeriodReceiver knows when to escalate
        const { config } = store.getState().checkIn;
        const graceMinutes = this.isNightTime(config.schedule)
          ? (config.schedule.nightGracePeriodMinutes ?? 5)
          : (config.schedule.dayGracePeriodMinutes ?? 5);
        NativeModules.ScreenLock.setGracePeriodMs(graceMinutes * 60 * 1000);
      }
    } catch (err) {
      console.warn('[CheckInService] Could not set native interval:', err);
    }
  }

  private cancelNativeAlarm(): void {
    try {
      if (Platform.OS === 'android' && NativeModules.ScreenLock) {
        NativeModules.ScreenLock.cancelCheckInAlarm();
      }
    } catch {}
  }

  /** Push emergency contact numbers + escalation message to native SharedPreferences. */
  async syncNativeEscalation(): Promise<void> {
    if (Platform.OS !== 'android' || !NativeModules.ScreenLock) return;
    try {
      const userName = await getLocalUserName();

      const contacts = await contactCacheService.getContactsWithFallback();
      const numbers = contacts
        .filter((c) => c.contact_phone && c.notify_sms !== false && c.is_check_in_contact === true)
        .map((c) => c.contact_phone);
      NativeModules.ScreenLock.setEmergencyContactNumbers(JSON.stringify(numbers));

      const loc = store.getState().location?.currentLocation;
      let message = `This SMS was triggered by ${userName} failure to checkin, please check-in.`;
      if (loc) message += `\n📍 Map: https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
      NativeModules.ScreenLock.setEscalationMessage(message);
    } catch (err) {
      console.warn('[CheckInService] Could not sync native escalation:', err);
    }
  }

  // ─── Schedule helpers ────────────────────────────────────────────────────────

  private isNightTime(schedule: CheckInSchedule): boolean {
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const dayStart = schedule.dayStartHour * 60 + (schedule.dayStartMinute ?? 0);
    const nightStart = schedule.nightStartHour * 60 + (schedule.nightStartMinute ?? 0);
    if (nightStart > dayStart) {
      return current >= nightStart || current < dayStart;
    }
    return current >= nightStart && current < dayStart;
  }

  private getIntervalMs(schedule: CheckInSchedule): number {
    const mins = this.isNightTime(schedule)
      ? schedule.nightIntervalMinutes
      : schedule.dayIntervalMinutes;
    return mins * 60 * 1000;
  }

  /**
   * Start (or restart) the check-in countdown.
   * Pushes the interval to native so AlarmManager fires while screen is off.
   * Also starts a JS timeout as the primary trigger when the screen is on.
   */
  scheduleNext(): void {
    this.clearTimers();
    const { config } = store.getState().checkIn;
    if (!config.enabled) return;

    const intervalMs = this.getIntervalMs(config.schedule);
    // Store interval in native SharedPreferences so ACTION_SCREEN_OFF can
    // schedule the AlarmManager alarm without depending on JS being awake.
    this.pushIntervalToNative(intervalMs);

    // Sync emergency contacts + grace period to native (fire and forget)
    this.syncNativeEscalation().catch(() => {});

    console.log(`[CheckInService] Interval stored (${intervalMs / 60000}m) — countdown starts on next screen lock`);
  }

  // ─── Alarm lifecycle ─────────────────────────────────────────────────────────

  private async fireAlarm(): Promise<void> {
    const { config } = store.getState().checkIn;

    // Silent check-in: skip alarm entirely — directly escalate via SMS
    if (config.silentCheckIn) {
      console.log('[CheckInService] Silent mode — skipping alarm, escalating directly');
      this.handleMissedCheckIn();
      return;
    }

    store.dispatch(triggerAlarm());

    // start() deletes the old vibrating expo channel then returns.
    // React renders the alarm screen DURING these awaits (useFocusEffect fires here).
    await checkInAlarmService.start();

    // Native handles the FLAG_INSISTENT notification + vibration when the
    // screen is locked (CheckInAlarmReceiver checks isInteractive). When the
    // screen is on, no notification ring or vibration is needed here.

    const graceMinutes = this.isNightTime(config.schedule)
      ? (config.schedule.nightGracePeriodMinutes ?? 5)
      : (config.schedule.dayGracePeriodMinutes ?? 5);

    const graceMs = graceMinutes * 60 * 1000;
    this.graceExpiresAt = Date.now() + graceMs;
    this.graceTimer = setTimeout(() => {
      this.graceExpiresAt = null;
      this.handleMissedCheckIn();
    }, graceMs);
  }

  /** User tapped "I'm OK" */
  async confirmCheckIn(): Promise<void> {
    this.clearTimers();
    this.graceExpiresAt = null;
    this.cancelNativeAlarm();
    await checkInAlarmService.stop();
    store.dispatch(dismissAlarm());
    this.scheduleNext();
    console.log('[CheckInService] User confirmed check-in');
  }

  private async handleMissedCheckIn(): Promise<void> {
    await checkInAlarmService.stop();
    store.dispatch(alarmExpired());

    const { config } = store.getState().checkIn;
    const userName = await getLocalUserName();

    console.log('[CheckInService] Missed check-in — escalating');

    // Always alert emergency contacts
    await this.alertEmergencyContacts(userName);

    // Call 911 unless "Only Alert Contacts" or "Silent Check-In" mode is active
    if (!config.alertEmergencyContacts && !config.silentCheckIn) {
      await this.initiate911(this.buildEscalationMessage(userName));
    }

    this.scheduleNext();
  }

  // ─── Phone state callbacks ────────────────────────────────────────────────────

  /**
   * Handles the native "onScreenUnlocked" event.
   * Native already confirmed the timer had NOT expired — user is alive.
   * Reset the countdown from now.
   */
  onPhoneUnlocked(): void {
    const { isAlarmActive, config } = store.getState().checkIn;
    if (!config.enabled) return;

    if (isAlarmActive) {
      // Stop vibration and repeating notifications immediately on unlock.
      // The alarm SCREEN is now visible — no need for audio/vibration alerts.
      // checkInAlarmService.stop() kills the notifTimer which fires expo-notifications
      // with enableVibrate:true every 12s — those are a separate vibration source
      // that Vibration.cancel() cannot stop.
      Vibration.cancel();
      checkInAlarmService.stop();

      // Resume grace timer if it was paused during lock
      if (this.graceExpiresAt !== null && this.graceTimer === null) {
        const remaining = this.graceExpiresAt - Date.now();
        if (remaining <= 0) {
          this.graceExpiresAt = null;
          this.handleMissedCheckIn();
        } else {
          this.graceTimer = setTimeout(() => {
            this.graceExpiresAt = null;
            this.handleMissedCheckIn();
          }, remaining);
        }
      }
      return;
    }

    // Normal unlock = proof of life — cancel the running native alarm and
    // wait for the next screen lock to start a fresh countdown.
    console.log('[CheckInService] Phone unlocked — alive, waiting for next lock');
    this.clearTimers();
    this.cancelNativeAlarm();
    // scheduleNext() just records the interval; countdown resumes on next lock.
    this.scheduleNext();
  }

  /**
   * Handles the native "onCheckInAlarmFired" event.
   * Native confirmed the alarm time passed while the screen was off.
   * Open the alarm UI so the user can dismiss or let it escalate.
   */
  onCheckInAlarmFiredNative(): void {
    const { isAlarmActive, config } = store.getState().checkIn;
    if (!config.enabled || isAlarmActive) return;

    console.log('[CheckInService] Native alarm fired — showing alarm screen');
    this.clearTimers();
    this.fireAlarm();
  }

  /**
   * Called when the screen locks (onScreenLocked event).
   * Just pauses the JS timer — native AlarmManager already handles the rest.
   */
  onPhoneInactive(): void {
    const { isAlarmActive } = store.getState().checkIn;

    if (isAlarmActive) {
      // Stop JS vibration immediately — native ringer (AlarmRingerService +
      // FLAG_INSISTENT notification) takes over for ring+vibration while locked.
      Vibration.cancel();
      try {
        if (Platform.OS === 'android') NativeModules.ScreenLock?.startAlarmRinger?.();
      } catch {}
    }

    // Pause JS grace timer (native notification handles the lock screen alert)
    if (isAlarmActive && this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
      console.log('[CheckInService] Screen locked during grace — JS grace timer paused');
    }

    // Cancel JS countdown (guard)
    if (this.checkInTimer) {
      clearTimeout(this.checkInTimer);
      this.checkInTimer = null;
    }
    // Native ACTION_SCREEN_OFF handler schedules the AlarmManager alarm — no JS action needed.
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  resetSchedule(): void {
    this.clearTimers();
    this.cancelNativeAlarm();
    store.dispatch(setNextCheckInTime(null));
    // Re-push the new interval immediately so native has it before next lock
    const { config } = store.getState().checkIn;
    if (config.enabled) {
      const intervalMs = this.getIntervalMs(config.schedule);
      this.pushIntervalToNative(intervalMs);
      this.scheduleNext();
    }
    console.log('[CheckInService] Schedule reset');
  }

  async stop(): Promise<void> {
    this.clearTimers();
    this.graceExpiresAt = null;
    this.cancelNativeAlarm();
    await checkInAlarmService.stop();
    store.dispatch(setNextCheckInTime(null));
    console.log('[CheckInService] Stopped');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private clearTimers(): void {
    if (this.checkInTimer) { clearTimeout(this.checkInTimer); this.checkInTimer = null; }
    if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }
  }

  private buildEscalationMessage(userName: string): string {
    return `This call was automatically initiated since ${userName} failed to check in.`;
  }

  private async alertEmergencyContacts(userName: string): Promise<void> {
    try {
      const contacts = await contactCacheService.getContactsWithFallback();
      const smsContacts: SmsRecipient[] = contacts
        .filter((c) => c.contact_phone && c.notify_sms !== false && c.is_check_in_contact === true)
        .map((c) => ({ name: c.contact_name, phone: c.contact_phone }));

      if (smsContacts.length === 0) {
        console.warn('[CheckInService] No check-in contacts configured');
        return;
      }

      const loc = store.getState().location.currentLocation;
      let message = `This SMS was triggered by ${userName} failure to checkin, please check-in.`;
      if (loc) message += `\n📍 Map: https://maps.google.com/?q=${loc.latitude},${loc.longitude}`;

      await emergencyMessagingService.sendEmergencySms({ contacts: smsContacts, userName, customMessage: message });
      console.log(`[CheckInService] Alert SMS sent to ${smsContacts.length} contacts`);
    } catch (err) {
      console.error('[CheckInService] Failed to alert emergency contacts:', err);
    }
  }

  private async initiate911(note: string): Promise<void> {
    try {
      const { activateEmergency } = require('../store/slices/emergencySlice');
      store.dispatch(activateEmergency({
        type: 'checkin_failure', notes: note, autoInitiated: true,
        timestamp: new Date().toISOString(),
      }));
      console.log('[CheckInService] 911 emergency activated');
    } catch (err) {
      console.error('[CheckInService] Failed to initiate 911:', err);
    }
  }
}

const checkInService = new CheckInService();
export default checkInService;
