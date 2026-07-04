/**
 * PSAP Native SMS Service
 *
 * Sends SMS to PSAP (911) using the phone's built-in SMS (SmsManager)
 * and observes incoming SMS replies from the dispatcher.
 * The app displays both outgoing and incoming messages in its chat UI.
 */
import {
  NativeModules,
  NativeEventEmitter,
  DeviceEventEmitter,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { store } from '../../store';
import {
  addOutgoingMessage,
  updateMessageStatus,
  addIncomingMessage,
  setActive,
  setPsapNumber,
} from '../../store/slices/psapMessageSlice';
import { EMERGENCY_TEST_NUMBER, ENFORCE_NON_911_IN_DEV } from '../runtimeConfig';
import emergencyLocationService from '../location/emergencyLocationService';
import { computeCentroidOffset } from '../location/locationMath';
import { setSmsTelemetrySnapshot } from '../../store/slices/emergencySlice';

const { DirectSms, SmsObserver } = NativeModules;
const EMERGENCY_OVERRIDE_NUMBER = EMERGENCY_TEST_NUMBER;

const resolvePsapNumber = (psapNumber?: string) => {
  const trimmed = (psapNumber || '').trim();
  if (__DEV__ && ENFORCE_NON_911_IN_DEV) {
    if (!trimmed || trimmed === '911') return EMERGENCY_OVERRIDE_NUMBER;
  }
  if (!trimmed || trimmed === '911') return EMERGENCY_OVERRIDE_NUMBER;
  return trimmed;
};

type SmsListener = (msg: { sender: string; body: string; timestamp: number }) => void;

class PsapMessagingService {
  private emitter: NativeEventEmitter | null = null;
  private subscriptions: any[] = [];
  private incomingListeners: SmsListener[] = [];

  /** Request SEND_SMS + RECEIVE_SMS + READ_SMS runtime permissions. */
  async ensurePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.SEND_SMS,
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      ]);
      const ok =
        results[PermissionsAndroid.PERMISSIONS.SEND_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
        results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;
      console.log('[PsapSms] Permissions granted:', ok);
      return ok;
    } catch {
      return false;
    }
  }

  /** Check if native SMS send is available (only requires DirectSms, not SmsObserver). */
  isAvailable(): boolean {
    return Platform.OS === 'android' && !!DirectSms;
  }

  /**
   * Start a PSAP SMS session. Begins observing incoming SMS from the PSAP number.
  * @param psapNumber - Phone number to send to (default override emergency number)
   */
  async startSession(psapNumber = EMERGENCY_OVERRIDE_NUMBER): Promise<boolean> {
    if (!this.isAvailable()) {
      console.warn('[PsapSms] Native modules not available');
      return false;
    }

    // In dev with override set, skip the permissions check — RECEIVE_SMS may be 'ignore'
    // on the test device. SEND_SMS is granted; the observer will catch any native errors.
    let skipPermCheck = false;
    if (__DEV__) {
      try {
        const override = await AsyncStorage.getItem('dev_emergency_override_number');
        if (override) skipPermCheck = true;
      } catch (_) {}
    }
    if (!skipPermCheck) {
      const granted = await this.ensurePermissions();
      if (!granted) {
        console.warn('[PsapSms] SMS permissions not granted');
        return false;
      }
    }

    const target = resolvePsapNumber(psapNumber);
    store.dispatch(setPsapNumber(target));
    store.dispatch(setActive(true));

    // Start observing incoming SMS
    try {
      await SmsObserver.startObserving([target]);
      this.setupListeners();
      console.log(`[PsapSms] Session started, monitoring replies from ${target}`);
      return true;
    } catch (err) {
      console.error('[PsapSms] Failed to start observer:', err);
      return false;
    }
  }

  /** Stop the PSAP SMS session. */
  async stopSession(): Promise<void> {
    try {
      if (SmsObserver) await SmsObserver.stopObserving();
    } catch {}
    this.removeListeners();
    store.dispatch(setActive(false));
    console.log('[PsapSms] Session stopped');
  }

  /**
   * Send an SMS to the PSAP using the phone's native SMS system.
   * Returns the messageId for tracking delivery status.
   */
  async sendMessage(
    text: string,
    psapNumber = EMERGENCY_OVERRIDE_NUMBER,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!DirectSms) {
      console.error('[PsapSms] DirectSms module not available');
      return { success: false, error: 'DirectSms module not available' };
    }

    // Do NOT call ensurePermissions() here — RECEIVE_SMS/READ_SMS may be denied
    // (they're only needed for the SmsObserver, not for sending). SEND_SMS is
    // already granted; SmsManager will throw natively if it ever isn't.

    let target = resolvePsapNumber(psapNumber);
    if (__DEV__) {
      try {
        const override = await AsyncStorage.getItem('dev_emergency_override_number');
        if (override) { target = override; console.log('[DEV] PSAP SMS redirected to override:', override); }
      } catch (_) {}
    }

    try {
      const msgId = `psap_${Date.now()}`;

      // Add to Redux store as outgoing (sending state)
      store.dispatch(
        addOutgoingMessage({
          id: msgId,
          text,
          timestamp: Date.now(),
        }),
      );

      let nativeId = 'mock_id_dev';
      try {
        // Send via native SmsManager
        nativeId = await DirectSms.sendSms(target, text, '');
        console.log(`[PsapSms] SMS sent to ${target}, nativeId=${nativeId}`);
      } catch (nativeErr: any) {
        if (__DEV__) {
          console.warn('[PsapSms] DirectSms.sendSms threw in dev mode, substituting dev mock success identification:', nativeErr);
        } else {
          throw nativeErr;
        }
      }

      // Update status to sent
      store.dispatch(updateMessageStatus({ id: msgId, status: 'sent' }));

      // Fail-safe manual trigger for development / test sandboxes:
      // If the content observer is delayed or bypasses, manually fire outgoing interceptor
      // so mock GPS locations and flat-earth centroids update instantly.
      if (__DEV__) {
        DeviceEventEmitter.emit('onOutgoingSmsDetected', {
          address: target,
          body: text,
          timestamp: Date.now(),
        });
      }

      return { success: true, messageId: msgId };
    } catch (err: any) {
      console.error('[PsapSms] Send failed:', err);
      return { success: false, error: err?.message || 'Send failed' };
    }
  }

  /**
   * Send an MMS with image + caption through the native Android SMS/MMS stack.
   */
  async sendMmsMessage(
    text: string,
    imageUri: string,
    psapNumber = EMERGENCY_OVERRIDE_NUMBER,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!DirectSms?.sendMms) {
      console.error('[PsapSms] DirectSms.sendMms not available');
      return { success: false, error: 'DirectSms.sendMms not available' };
    }

    let target = resolvePsapNumber(psapNumber);
    if (__DEV__) {
      try {
        const override = await AsyncStorage.getItem('dev_emergency_override_number');
        if (override) {
          target = override;
          console.log('[DEV] PSAP MMS redirected to override:', override);
        }
      } catch (_) {}
    }

    try {
      const msgId = `psap_mms_${Date.now()}`;
      store.dispatch(
        addOutgoingMessage({
          id: msgId,
          text,
          timestamp: Date.now(),
          imageUrl: imageUri,
        }),
      );

      await DirectSms.sendMms(target, text, imageUri);
      console.log(`[PsapSms] MMS send requested for ${target}`);

      store.dispatch(updateMessageStatus({ id: msgId, status: 'sent' }));

      if (__DEV__) {
        DeviceEventEmitter.emit('onOutgoingSmsDetected', {
          address: target,
          body: text,
          timestamp: Date.now(),
        });
      }

      return { success: true, messageId: msgId };
    } catch (err: any) {
      console.error('[PsapSms] MMS send failed:', err);
      return { success: false, error: err?.message || 'MMS send failed' };
    }
  }

  /**
   * Send an MMS with one or more images through the native Android SMS/MMS stack.
   */
  async sendMmsImagesMessage(
    text: string,
    imageUris: string[],
    psapNumber = EMERGENCY_OVERRIDE_NUMBER,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const cleanUris = imageUris.map((uri) => String(uri || '').trim()).filter(Boolean);
    if (cleanUris.length === 0) {
      return { success: false, error: 'imageUris are required' };
    }

    if (!DirectSms?.sendMmsImages) {
      if (cleanUris.length === 1) {
        return this.sendMmsMessage(text, cleanUris[0], psapNumber);
      }
      console.error('[PsapSms] DirectSms.sendMmsImages not available');
      return { success: false, error: 'DirectSms.sendMmsImages not available' };
    }

    let target = resolvePsapNumber(psapNumber);
    if (__DEV__) {
      try {
        const override = await AsyncStorage.getItem('dev_emergency_override_number');
        if (override) {
          target = override;
          console.log('[DEV] PSAP MMS redirected to override:', override);
        }
      } catch (_) {}
    }

    try {
      const msgId = `psap_mms_${Date.now()}`;
      cleanUris.forEach((imageUrl, idx) => {
        store.dispatch(
          addOutgoingMessage({
            id: `${msgId}_${idx}`,
            text: idx === 0 ? text : '',
            timestamp: Date.now(),
            imageUrl,
          }),
        );
      });

      await DirectSms.sendMmsImages(target, text, cleanUris);
      console.log(`[PsapSms] MMS send requested for ${target} with ${cleanUris.length} image(s)`);

      cleanUris.forEach((_, idx) => {
        store.dispatch(updateMessageStatus({ id: `${msgId}_${idx}`, status: 'sent' }));
      });

      if (__DEV__) {
        DeviceEventEmitter.emit('onOutgoingSmsDetected', {
          address: target,
          body: text,
          timestamp: Date.now(),
        });
      }

      return { success: true, messageId: msgId };
    } catch (err: any) {
      console.error('[PsapSms] MMS send failed:', err);
      return { success: false, error: err?.message || 'MMS send failed' };
    }
  }

  /** Register a callback for incoming PSAP messages. */
  onIncomingMessage(listener: SmsListener): () => void {
    this.incomingListeners.push(listener);
    return () => {
      this.incomingListeners = this.incomingListeners.filter((l) => l !== listener);
    };
  }

  private setupListeners() {
    this.removeListeners();

    // Use DeviceEventEmitter directly — on Android, RCTDeviceEventEmitter.emit() writes
    // to the global DeviceEventEmitter bridge. NativeEventEmitter(SmsObserver) adds an
    // extra layer that can silently drop events if the native module isn't set up as a
    // proper event emitter. DeviceEventEmitter is the reliable direct path.
    const incomingSub = DeviceEventEmitter.addListener(
      'onPsapSmsReceived',
      (event: { sender: string; body: string; timestamp: number }) => {
        console.log(`[PsapSms] Incoming from ${event.sender}: ${event.body}`);
        store.dispatch(
          addIncomingMessage({
            id: `in_${event.timestamp}`,
            text: event.body,
            sender: event.sender,
            timestamp: event.timestamp,
          }),
        );
        this.incomingListeners.forEach((l) => l(event));
      },
    );
    this.subscriptions.push(incomingSub);

    const outgoingSub = DeviceEventEmitter.addListener(
      'onOutgoingSmsDetected',
      async (event: { address: string; body: string; timestamp: number }) => {
        console.log(`[PsapSms] Outgoing emergency SMS intercepted to ${event.address}: ${event.body}`);

        try {
          // Get the high-resolution location
          const bestLoc = await emergencyLocationService.getBestLocation();

          // Simulate what CAD/ALI triangulates. Wireless 911 location at the PSAP
          // is network/cell-tower based, so when the on-device GPS fix is weak we
          // base the simulated CAD coordinate on the cell-tower triangulation
          // (cell_resolved_*) instead of the precise GPS/Wi-Fi position — this
          // better matches the coarser, cell-derived position a real CAD receives.
          const gpsWeak =
            !bestLoc.accuracy ||
            bestLoc.accuracy > 50 ||
            (bestLoc.method !== 'GPS' && bestLoc.method !== 'HYBRID');
          const hasCellFix =
            typeof bestLoc.cell_resolved_lat === 'number' &&
            typeof bestLoc.cell_resolved_lon === 'number';
          const useCellForCad = gpsWeak && hasCellFix;
          const cadLat = useCellForCad ? (bestLoc.cell_resolved_lat as number) : bestLoc.latitude;
          const cadLon = useCellForCad ? (bestLoc.cell_resolved_lon as number) : bestLoc.longitude;
          const cadAccuracy = useCellForCad
            ? Math.max(bestLoc.accuracy || 0, 300)
            : bestLoc.accuracy || 75;

          // Compute the centroid coordinate with mathematical randomized bearing and distance offset
          const centroid = computeCentroidOffset(cadLat, cadLon, cadAccuracy);
          console.log(
            `[PsapSms] CAD basis: ${useCellForCad ? 'CELL-TOWER (GPS weak)' : 'GPS/Hybrid'} ` +
              `lat=${cadLat} lon=${cadLon} acc=${cadAccuracy}`,
          );

          // Build consolidated snapshot payload
          const smsTelemetrySnap = {
            latitude: bestLoc.latitude,
            longitude: bestLoc.longitude,
            accuracy: bestLoc.accuracy,
            raw_mcc: bestLoc.raw_mcc ?? null,
            raw_mnc: bestLoc.raw_mnc ?? null,
            raw_lac_tac: bestLoc.raw_lac_tac ?? null,
            raw_cid: bestLoc.raw_cid ?? null,
            cell_resolved_lat: bestLoc.cell_resolved_lat ?? null,
            cell_resolved_lon: bestLoc.cell_resolved_lon ?? null,
            wifi_resolved_json_array: Array.isArray(bestLoc.wifi_resolved_json_array)
              ? bestLoc.wifi_resolved_json_array
              : [],
            centroid_lat: centroid.centroid_lat,
            centroid_lon: centroid.centroid_lon,
            centroid_unc: centroid.centroid_unc,
            timestamp: Date.now()
          };

          // Store directly to Redux
          store.dispatch(setSmsTelemetrySnapshot(smsTelemetrySnap));
          console.log('[PsapSms] SMS telemetry snapshot stored to Redux:', smsTelemetrySnap);
        } catch (err) {
          console.warn('[PsapSms] Static One-Shot Telemetry Capture Protocol failed:', err);
        }
      }
    );
    this.subscriptions.push(outgoingSub);

    // Listen for delivery confirmations
    if (DirectSms) {
      this.emitter = new NativeEventEmitter(DirectSms);
      const deliverySub = this.emitter.addListener(
        'onSmsDelivered',
        (event: { messageId: string; delivered: boolean }) => {
          if (event.delivered) {
            console.log(`[PsapSms] Delivered: ${event.messageId}`);
          }
        },
      );
      this.subscriptions.push(deliverySub);
    }
  }

  private removeListeners() {
    this.subscriptions.forEach((s) => s?.remove?.());
    this.subscriptions = [];
  }
}

const psapMessagingService = new PsapMessagingService();
export default psapMessagingService;
