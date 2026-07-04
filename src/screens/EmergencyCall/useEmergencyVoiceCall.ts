import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmergencyMessageStateSetter } from './emergencyCallMessageTypes';
import { AppState, PermissionsAndroid } from 'react-native';
import { inCallService } from '../../services/inCallService';

type EmergencyVoiceCallParams = {
  emergencyNumber: string;
  initialCallInitiated: boolean;
  withVideo: boolean;
  autoInitiateCall: boolean;
  actionId?: string | number;
  activeEmergencyEventId: string | null;
  activeE911EventId: string | null;
  setActiveE911EventId: (value: string | null) => void;
  setChatMessages: EmergencyMessageStateSetter;
};

export function useEmergencyVoiceCall({
  emergencyNumber, initialCallInitiated, withVideo, autoInitiateCall, actionId,
  activeEmergencyEventId, activeE911EventId, setActiveE911EventId, setChatMessages,
}: EmergencyVoiceCallParams) {
  const [callInitiated, setCallInitiated] = useState(initialCallInitiated);
  const [callWasEnded, setCallWasEnded] = useState(false);
  const [callElapsed, setCallElapsed] = useState(0);
  const callStartRef = useRef<number | null>(null);
  const pendingDialerRoleCallRef = useRef(false);
  const callVerificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callRetryAttemptedRef = useRef(false);
  const callStartingRef = useRef(false);
  const userEndedCallRef = useRef(false);
  const stopVideoRef = useRef<((v: boolean) => void) | null>(null);
  // ── Call duration timer ────────────────────────────────────────
  useEffect(() => {
    if (!callInitiated || callWasEnded) {
      if (!callInitiated) setCallElapsed(0);
      return;
    }
    if (callStartRef.current === null) callStartRef.current = Date.now();
    const interval = setInterval(() => {
      setCallElapsed(Math.floor((Date.now() - callStartRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [callInitiated, callWasEnded]);

  // Reset start ref when call is re-initiated after being ended
  useEffect(() => {
    if (callInitiated && !callWasEnded) {
      callStartRef.current = Date.now();
      setCallElapsed(0);
    }
  }, [callInitiated]);

  // Default to showing initiate-call button when no call state is known
  const showInitiateUI = !callInitiated || callWasEnded;
  const cancelCallVerification = () => {
    if (callVerificationTimerRef.current) {
      clearTimeout(callVerificationTimerRef.current);
      callVerificationTimerRef.current = null;
    }
  };

  const verifyCallStarted = () => {
    cancelCallVerification();
    callVerificationTimerRef.current = setTimeout(async () => {
      callVerificationTimerRef.current = null;
      if (userEndedCallRef.current) return;
      if (await inCallService.hasActiveCall()) return;

      // TelecomManager.placeCall() can occasionally accept a request without
      // creating a Call. Retry once after the native duplicate-call guard has
      // expired so recording is never left running without the voice call.
      if (!callRetryAttemptedRef.current) {
        callRetryAttemptedRef.current = true;
        const retried = await inCallService.placeE911Call(emergencyNumber);
        if (retried) {
          verifyCallStarted();
          return;
        }
      }

      setCallInitiated(false);
      setCallWasEnded(true);
      // Release the microphone — recording should never be left running
      // without an active voice call.
      stopVideoRef.current?.(false);
      setChatMessages((prev) => [...prev, { type: 'chat', incoming: true, timestamp: Date.now(), text: 'The voice call did not start. Tap the call button to try again.' }]);
    }, 11_000);
  };

  const handleInitiateCallPress = async () => {
    if (callStartingRef.current) return;
    callStartingRef.current = true;
    try {
      // Returning to an already-active E911 call is a resume, not a new dial.
      if (await inCallService.hasActiveCall()) {
        cancelCallVerification();
        setCallInitiated(true);
        setCallWasEnded(false);
        return;
      }

      // Flip UI immediately so the button changes to "end" without navigating away.
      userEndedCallRef.current = false;
      setCallInitiated(true);
      setCallWasEnded(false);
      callRetryAttemptedRef.current = false;

    // Set this before placing the call. The native InCallService can receive
    // onCallAdded immediately, so awaiting suppression prevents its activity
    // from briefly replacing the E911 screen.
      await inCallService.setSuppressInCallUi(true);

    // If not already set up, request CALL_PHONE permission so the native
    // TelecomManager.placeCall() works. When CALL_PHONE is granted (or the
    // app is already the default dialer), TelecomManager routes through our
    // EmergencySwitchInCallService which respects suppressInCallUi — the
    // call connects silently and the user stays in the E911 screen.
      let canCall = await inCallService.canPlaceCallInApp();
      if (!canCall) {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.CALL_PHONE,
          );
          canCall = granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch {}
      }

    // Prefer the default-dialer role for the full in-app call UI, but do not
    // block call initiation when Android still allows us to place the call
    // with CALL_PHONE/MANAGE_OWN_CALLS.
      if (!canCall && !(await inCallService.isDefaultDialer())) {
        pendingDialerRoleCallRef.current = true;
        setCallInitiated(false);
        await inCallService.requestDefaultDialer();
        return;
      }

    // Never use placeCall's external-dialer fallback from this screen. Leaving
    // the app would pause the camera and violate the combined E911 call flow.
      if (!canCall) {
        setCallInitiated(false);
        setCallWasEnded(true);
        stopVideoRef.current?.(false);
        setChatMessages((prev) => [...prev, { type: 'chat', incoming: true, timestamp: Date.now(), text: 'Phone permission is required to start the voice call without leaving E911.' }]);
        return;
      }

    // Start the voice call while the E911 screen and video recorder remain active.
      const started = await inCallService.placeE911Call(emergencyNumber);
      if (!started) {
        setCallInitiated(false);
        setCallWasEnded(true);
        stopVideoRef.current?.(false);
        setChatMessages((prev) => [...prev, { type: 'chat', incoming: true, text: 'Unable to initiate call from E911 on this device.' }]);
      } else {
        verifyCallStarted();
      }
    } catch (error) {
      console.warn('[E911] Failed to initiate call:', error);
      setCallInitiated(false);
      setCallWasEnded(true);
      stopVideoRef.current?.(false);
      setChatMessages((prev) => [...prev, { type: 'chat', incoming: true, text: 'Unable to initiate call from E911 on this device.' }]);
    } finally {
      callStartingRef.current = false;
    }
  };

  // While the E911 screen is active, prevent InCallUiActivity from launching
  // on top of it — the E911 screen is the call UI.
  useEffect(() => {
    inCallService.setSuppressInCallUi(true);
    return () => { inCallService.setSuppressInCallUi(false); };
  }, []);

  // Resume the pending E911 voice call as soon as the Android default-dialer
  // role prompt closes successfully.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      try {
        if (state !== 'active' || !pendingDialerRoleCallRef.current) return;
        if (userEndedCallRef.current) {
          pendingDialerRoleCallRef.current = false;
          return;
        }
        if (!(await inCallService.isDefaultDialer())) return;
        pendingDialerRoleCallRef.current = false;
        userEndedCallRef.current = false;
        setCallInitiated(true);
        setCallWasEnded(false);
        await inCallService.setSuppressInCallUi(true);
        const started = await inCallService.placeE911Call(emergencyNumber);
        if (!started) {
          setCallInitiated(false);
          setCallWasEnded(true);
          stopVideoRef.current?.(false);
          setChatMessages((prev) => [...prev, { type: 'chat', incoming: true, text: 'Unable to initiate call from E911 on this device.' }]);
        } else {
          callRetryAttemptedRef.current = false;
          verifyCallStarted();
        }
      } catch (error) {
        console.warn('[E911] Failed to resume pending call:', error);
        pendingDialerRoleCallRef.current = false;
        setCallInitiated(false);
        setCallWasEnded(true);
        stopVideoRef.current?.(false);
        setChatMessages((prev) => [...prev, { type: 'chat', incoming: true, text: 'Unable to initiate call from E911 on this device.' }]);
      }
    });
    return () => sub.remove();
  }, [emergencyNumber, setChatMessages]);

  // Ensure there is always an active emergency event id for this session.
  // Entry paths other than native-dialer detection (e.g. the Home 911 card)
  // don't populate the Redux emergency event, which left location/SMS sends
  // failing with "No active emergency event". Mint a local id when none exists.
  useEffect(() => {
    if (!activeEmergencyEventId && !activeE911EventId) {
      setActiveE911EventId(`e911-local-${Date.now()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the PSAP/dispatcher cancels (disconnects) the call, flip the end-call
  // button back to a call button so the user can re-initiate the call.
  useEffect(() => {
    const handleEnded = () => {
      cancelCallVerification();
      callRetryAttemptedRef.current = true;
      callStartingRef.current = false;
      pendingDialerRoleCallRef.current = false;
      userEndedCallRef.current = true;
      setCallInitiated(false);
      setCallWasEnded(true);
      stopVideoRef.current?.(false);
    };
    const unsubAdded = inCallService.onCallAdded(() => {
      cancelCallVerification();
      if (userEndedCallRef.current) {
        inCallService.endCall();
      }
    });
    const unsubState = inCallService.onCallStateChanged((e) => {
      if (e.state === 'DISCONNECTED') handleEnded();
    });
    const unsubRemoved = inCallService.onCallRemoved(handleEnded);
    return () => { cancelCallVerification(); unsubAdded(); unsubState(); unsubRemoved(); };
  }, []);

  // Video-call entry auto-initiates the phone call alongside video recording.
  const autoCallRequestRef = useRef<string | number | null>(null);
  useEffect(() => {
    if (!(withVideo || autoInitiateCall === true) || callInitiated || userEndedCallRef.current) return;
    const requestKey = actionId ?? 'initial-auto-call';
    if (autoCallRequestRef.current === requestKey) return;
    autoCallRequestRef.current = requestKey;
    const delayMs = withVideo ? 900 : 0;
    const timer = setTimeout(() => {
      if (userEndedCallRef.current) return;
      inCallService.hasActiveCall()
        .then((active) => {
          if (userEndedCallRef.current) return;
          if (active) {
            setCallInitiated(true);
            setCallWasEnded(false);
            return;
          }
          handleInitiateCallPress();
        })
        .catch((error) => {
          console.warn('[E911] Failed to check active call:', error);
          if (userEndedCallRef.current) return;
          handleInitiateCallPress();
        });
    }, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withVideo, autoInitiateCall, actionId, callInitiated]);

  const resumeActiveCallIfPresent = useCallback(async () => {
    if (!(await inCallService.hasActiveCall())) return;
    setCallInitiated(true);
    setCallWasEnded(false);
  }, []);

  const openOngoingCall = useCallback(() => inCallService.openInCallUI(), []);

  return {
    callInitiated, callWasEnded, callElapsed, showInitiateUI,
    handleInitiateCallPress, stopVideoRef, resumeActiveCallIfPresent, openOngoingCall,
  };
}
