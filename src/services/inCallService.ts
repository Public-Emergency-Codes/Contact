/**
 * inCallService.ts
 *
 * JavaScript bridge for the Android InCallService integration.
 * Wraps InCallModule (Kotlin) to provide:
 *  - Programmatic call termination (endCall)
 *  - Mute / hold controls
 *  - Default-dialer role request (needed for InCallService to activate)
 *  - Preferred call placement via TelecomManager
 *  - Real-time call state events via NativeEventEmitter
 *
 * Usage:
 *   import { inCallService } from '../services/inCallService';
 *   await inCallService.requestDefaultDialer(); // ask once on first launch
 *   await inCallService.endCall();              // hang up from E911 screen
 *   const unsub = inCallService.onCallStateChanged(e => console.log(e.state));
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { InCallModule } = NativeModules;

export type CallState =
  | 'ACTIVE'
  | 'DIALING'
  | 'RINGING'
  | 'DISCONNECTED'
  | 'DISCONNECTING'
  | 'HOLDING'
  | 'CONNECTING'
  | 'UNKNOWN';

export type CallAddedEvent = { state: CallState; number: string };
export type CallStateEvent  = { state: CallState };

// Lazily created so the module works in Expo Go (where InCallModule is absent).
let _emitter: NativeEventEmitter | null = null;
function getEmitter(): NativeEventEmitter | null {
  if (!InCallModule) return null;
  if (!_emitter) _emitter = new NativeEventEmitter(InCallModule);
  return _emitter;
}

const isAndroid = Platform.OS === 'android';

export const inCallService = {
  // ── Call control ─────────────────────────────────────────────

  /**
   * Disconnect the active call via the Android InCallService.
   * Returns true if a call existed and was disconnected, false otherwise.
   * Safe to call even when no call is active.
   */
  async endCall(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.endCall(); } catch { return false; }
  },

  async muteCall(muted: boolean): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.muteCall(muted); } catch { return false; }
  },

  async holdCall(hold: boolean): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.holdCall(hold); } catch { return false; }
  },

  async hasActiveCall(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.hasActiveCall(); } catch { return false; }
  },

  // ── Dialer role ───────────────────────────────────────────────

  /**
   * Check whether this app is currently the Android default phone app.
   * InCallService only activates when the app holds the DIALER role.
   */
  async isDefaultDialer(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.isDefaultDialer(); } catch { return false; }
  },

  /**
   * Show the Android system dialog that lets the user set this app as the
   * default phone app.  Call this once after onboarding completes.
   */
  async requestDefaultDialer(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.requestDefaultDialer(); } catch { return false; }
  },

  // ── Call placement ───────────────────────────────────────────

  /**
   * Place a call through TelecomManager (preferred).  When the app is the
   * default dialer this keeps the call fully inside the app — no switcher
   * animation.  Falls back to ACTION_CALL intent if permission is missing.
   */
  async placeCall(number: string): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.placeCall(number); } catch { return false; }
  },

  /**
   * Place the E911 voice call while keeping the mounted E911 screen in front.
   * This never falls back to an external dialer activity.
   */
  async placeE911Call(number: string): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.placeE911Call(number); } catch { return false; }
  },

  /**
   * Tell the native InCallService whether to suppress InCallUiActivity.
   * Set to true while the E911 screen is active so calls stay inside the app.
   */
  async setSuppressInCallUi(suppress: boolean): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.setSuppressInCallUi(suppress); } catch { return false; }
  },

  /**
   * Ask Android to start the call with bidirectional video requested.
   * Falls back to false when the native module is unavailable.
   */
  async placeVideoCall(number: string): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.placeVideoCall(number); } catch { return false; }
  },

  /**
   * Open the native Android ongoing-call screen, where call controls such as
   * mute, keypad, speaker, and hang-up are available.
   */
  async openInCallUI(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.openInCallUI(); } catch { return false; }
  },

  // ── In-app call capability ───────────────────────────────────

  /**
   * Returns true if the app can place calls in-app via TelecomManager
   * (i.e. the app is the default dialer or has MANAGE_OWN_CALLS granted).
   * When false, placeCall() falls back to opening the external dialer.
   */
  async canPlaceCallInApp(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.canPlaceCallInApp(); } catch { return false; }
  },

  /**
   * Opens the system Settings page for MANAGE_OWN_CALLS permission.
   * When granted, TelecomManager.placeCall() works without the app
   * being the default dialer.  Only meaningful on Android 10+.
   */
  async requestManageOwnCalls(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.requestManageOwnCalls(); } catch { return false; }
  },

  // ── Event subscriptions ──────────────────────────────────────

  async canShowReturnWidget(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.canShowReturnWidget(); } catch { return false; }
  },

  async requestReturnWidgetPermission(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.requestReturnWidgetPermission(); } catch { return false; }
  },

  async showReturnWidget(
    title: string,
    subtitle: string,
    callActive: boolean,
    emergency: boolean,
    profilePhotoUri?: string | null,
  ): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.showReturnWidget(title, subtitle, callActive, emergency, profilePhotoUri || null); } catch { return false; }
  },

  async hideReturnWidget(): Promise<boolean> {
    if (!isAndroid || !InCallModule) return false;
    try { return await InCallModule.hideReturnWidget(); } catch { return false; }
  },

  /** Fires when a new call is created (dialing or incoming). */
  onCallAdded(cb: (e: CallAddedEvent) => void): () => void {
    const sub = getEmitter()?.addListener('onCallAdded', cb);
    return () => sub?.remove();
  },

  /** Fires when the call ends (disconnected). */
  onCallRemoved(cb: () => void): () => void {
    const sub = getEmitter()?.addListener('onCallRemoved', cb);
    return () => sub?.remove();
  },

  /** Fires on every call state transition (DIALING → ACTIVE → DISCONNECTED …). */
  onCallStateChanged(cb: (e: CallStateEvent) => void): () => void {
    const sub = getEmitter()?.addListener('onCallStateChanged', cb);
    return () => sub?.remove();
  },
};
