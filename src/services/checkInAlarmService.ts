/**
 * Check-In Alarm Service
 *
 * Owns JS-side vibration while the alarm screen is visible (screen ON).
 * Native side (AlarmRingerService + FLAG_INSISTENT notification) owns
 * ring + vibration while screen is OFF.
 *
 * NO expo-notification repeating timer — those used a channel with
 * enableVibrate=true cached on the device which couldn't be cancelled
 * from JS and persisted across unlocks.
 */
import * as Notifications from 'expo-notifications';
import { Vibration } from 'react-native';

class CheckInAlarmService {
  private active = false;

  /**
   * Prepare the alarm state. Does NOT start vibration — fireAlarm() does
   * that after all awaits so it can't be lost to the useFocusEffect race.
   * Also deletes the old `checkin_alarm` expo channel which was cached on
   * device with enableVibrate=true and couldn't be updated.
   */
  async start(): Promise<void> {
    this.active = true;
    try {
      // Delete the old expo channel that was cached with enableVibrate=true.
      // Any notification posted on it would vibrate even after Vibration.cancel().
      await Notifications.deleteNotificationChannelAsync('checkin_alarm');
    } catch {}
    console.log('[CheckInAlarm] Alarm started');
  }

  /** Stop JS vibration and clear all expo notifications. */
  async stop(): Promise<void> {
    this.active = false;
    Vibration.cancel();
    try { await Notifications.dismissAllNotificationsAsync(); } catch {}
    console.log('[CheckInAlarm] Alarm stopped');
  }

  isPlaying(): boolean {
    return this.active;
  }
}

const checkInAlarmService = new CheckInAlarmService();
export default checkInAlarmService;
