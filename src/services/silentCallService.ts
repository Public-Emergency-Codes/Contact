/**
 * Silent Call Service (text/SMS-only)
 * Orchestrates silent/low-volume E911 call mode:
 * - Notifies the dispatcher that the caller's device is muted/low volume
 * - Requests the dispatcher to respond via text (Text-to-911)
 * - Keeps the call line open so the dispatcher can hear background sounds
 *
 * Local-device-only: there is NO text-to-speech and NO voice transcription.
 * The caller communicates by typing messages that are delivered to the PSAP via
 * SMS; nothing is spoken into the call and the dispatcher's voice is not
 * transcribed.
 */

import { getUserLanguage } from './languageConfig';

export interface SilentCallState {
  isActive: boolean;
  dispatcherNotified: boolean;
  userLanguage: string;
}

type StatusCallback = (status: string) => void;

class SilentCallService {
  private state: SilentCallState = {
    isActive: false,
    dispatcherNotified: false,
    userLanguage: 'en',
  };

  private statusCallbacks: StatusCallback[] = [];

  /** Build the initial dispatcher notification message */
  buildSilentCallNotification(isMuted: boolean, volumePercent: number): string {
    const volumeStatus = isMuted
      ? 'The caller\'s device is MUTED'
      : `The caller's device volume is very low (${Math.round(volumePercent * 100)}%)`;

    return [
      `SILENT CALL ALERT: ${volumeStatus}.`,
      'The caller may be in a dangerous situation and is intentionally keeping the phone silent.',
      'Please respond by TEXT MESSAGE (Text-to-911).',
      'The caller will communicate by typing messages sent to you as text.',
      'The call line remains open so you can hear any background sounds the caller intends to share.',
    ].join(' ');
  }

  /** Build a shorter follow-up reminder for the dispatcher */
  buildSmsRequestReminder(): string {
    return 'REMINDER: Caller is in silent mode and cannot speak. Please respond via text message.';
  }

  /**
   * Activate silent call mode
   * @param sendPsapMessage - Function to send a message to the PSAP via SMS
   * @param isMuted - Whether the device is fully muted
   * @param volumePercent - Volume percentage (0-1)
   */
  async activate(
    sendPsapMessage: (msg: string) => Promise<boolean>,
    isMuted: boolean,
    volumePercent: number,
  ): Promise<void> {
    if (this.state.isActive) return;

    this.state.userLanguage = await getUserLanguage();
    this.state.isActive = true;
    this.emitStatus('Silent call mode activated');

    const notification = this.buildSilentCallNotification(isMuted, volumePercent);
    try {
      await sendPsapMessage(notification);
      this.state.dispatcherNotified = true;
      this.emitStatus('Dispatcher notified of silent mode');
    } catch (error) {
      console.error('[SilentCall] Failed to notify dispatcher:', error);
      this.emitStatus('Failed to notify dispatcher — retrying...');
      setTimeout(async () => {
        try {
          await sendPsapMessage(notification);
          this.state.dispatcherNotified = true;
        } catch {
          this.emitStatus('Dispatcher notification failed');
        }
      }, 5000);
    }
  }

  /** Deactivate silent call mode */
  async deactivate(): Promise<void> {
    this.state = {
      isActive: false,
      dispatcherNotified: false,
      userLanguage: 'en',
    };
    this.emitStatus('Silent call mode deactivated');
  }

  /** Subscribe to status updates */
  onStatus(cb: StatusCallback): () => void {
    this.statusCallbacks.push(cb);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(c => c !== cb);
    };
  }

  getState(): SilentCallState { return { ...this.state }; }
  isActive(): boolean { return this.state.isActive; }

  private emitStatus(status: string) {
    console.log(`[SilentCall] ${status}`);
    this.statusCallbacks.forEach(cb => cb(status));
  }
}

export default new SilentCallService();
