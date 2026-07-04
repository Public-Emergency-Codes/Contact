import { useEffect, useRef } from 'react';
import type { EmergencyCallMessage, EmergencyMessageStateSetter } from './emergencyCallMessageTypes';

/**
 * Video-calling entry flow.
 *
 * When the user taps the video-call button (CommunicationHubScreen → E911Call with
 * `withVideo: true`) we jump straight into the calling/SMS process with the
 * camera already recording, then quietly tell the PSAP a live video stream has
 * been requested — alongside the initial caller-info SMS.
 *
 * A "Trying to connect to your video stream..." bubble is shown while we wait,
 * and is removed automatically as soon as the dispatcher sends any text reply.
 */
interface UseEmergencyVideoCallParams {
  withVideo: boolean;
  camera: any;
  collapseAnims: any;
  chatMessages: EmergencyCallMessage[];
  setChatMessages: EmergencyMessageStateSetter;
  scrollToBottom: (delay?: number) => void;
  sendPsapMessage: (msg: string, lat?: number, lng?: number) => Promise<boolean>;
  detectedLocation: any;
  videoRequestId?: string | number | null;
}

const VIDEO_REQUEST_MSG =
  'Can we connect through video so i can show you live feed of the emergency';

export const useEmergencyVideoCall = ({
  withVideo, camera, collapseAnims, chatMessages, setChatMessages, scrollToBottom, sendPsapMessage, detectedLocation, videoRequestId,
}: UseEmergencyVideoCallParams) => {
  const startedRequestRef = useRef<string | number | null>(null);
  const startingRequestRef = useRef<string | number | null>(null);
  const connectingInsertedRef = useRef(false);
  const connectingResolvedRef = useRef(false);
  // Use refs so the async closure always sees the latest camera state
  const hasCamRef = useRef(camera.hasCamPermission);
  const deviceRef = useRef(camera.activeCamDevice);
  const requestPermRef = useRef(camera.requestCamPermission);
  const startRecRef = useRef(camera.startCameraRecording);
  const setStreamActiveRef = useRef(camera.setVideoStreamingActive);
  const sessionCountRef = useRef(camera.videoSessionCount);
  const isRecordingRef = useRef(camera.isRecordingRef);
  const recordingRequestedRef = useRef(camera.recordingRequestedRef);
  hasCamRef.current = camera.hasCamPermission;
  deviceRef.current = camera.activeCamDevice;
  requestPermRef.current = camera.requestCamPermission;
  startRecRef.current = camera.startCameraRecording;
  setStreamActiveRef.current = camera.setVideoStreamingActive;
  sessionCountRef.current = camera.videoSessionCount;
  isRecordingRef.current = camera.isRecordingRef;
  recordingRequestedRef.current = camera.recordingRequestedRef;

  // Start the stream + quietly notify the PSAP a live video stream is requested.
  useEffect(() => {
    if (!withVideo) return;
    const requestKey = videoRequestId ?? 'initial-video';
    if (startedRequestRef.current === requestKey) return;
    if (startingRequestRef.current === requestKey) return;
    let cancelled = false;
    startingRequestRef.current = requestKey;
    connectingInsertedRef.current = false;
    connectingResolvedRef.current = false;

    (async () => {
      let granted = hasCamRef.current;
      if (!granted) {
        try { granted = await requestPermRef.current(); } catch { granted = false; }
      }
      if (cancelled) return;

      // Poll for a usable camera device — may not be available immediately
      // after granting permission (device hook needs a render cycle).
      for (let attempt = 0; attempt < 30; attempt++) {
        if (granted && deviceRef.current) break;
        await new Promise<void>(r => setTimeout(r, 200));
      }
      if (cancelled) return;
      if (!granted || !deviceRef.current) {
        if (startingRequestRef.current === requestKey) startingRequestRef.current = null;
        return;
      }

      if (sessionCountRef.current.current === 0) {
        sessionCountRef.current.current += 1;
      }
      setStreamActiveRef.current(true);
      collapseAnims.videoCollapseAnim.setValue(0);

      const startedBy = Date.now() + 12_000;
      // Retry loop: keep trying until recording starts or the effect is
      // cancelled.  The 12 s floor gives slow devices enough time to bring
      // the camera up; after that we yield to the interval-based fallback in
      // useEmergencyCallCamera but continue our own retries at a slower pace so the
      // PSAP notification is still sent when recording eventually starts.
      let fastRetry = true;
      while (!cancelled) {
        const started = await startRecRef.current();
        if (started || isRecordingRef.current.current) {
          startedRequestRef.current = requestKey;
          startingRequestRef.current = null;
          break;
        }
        recordingRequestedRef.current.current = true;
        if (fastRetry && Date.now() > startedBy) {
          fastRetry = false;
        }
        await new Promise<void>(r => setTimeout(r, fastRetry ? 300 : 2000));
      }

      if (cancelled) return;
      if (startedRequestRef.current !== requestKey) {
        startingRequestRef.current = null;
        // Recording never started — don't tell the PSAP about a video stream
        // that isn't actually being recorded.
        return;
      }

      // Quietly notify the PSAP that a live video stream has been requested.
      const lat = detectedLocation?.latitude;
      const lng = detectedLocation?.longitude;
      sendPsapMessage(VIDEO_REQUEST_MSG, lat, lng).catch(() => {});
    })();

    return () => {
      cancelled = true;
      if (startingRequestRef.current === requestKey) startingRequestRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withVideo, videoRequestId, camera.hasCamPermission, camera.activeCamDevice]);

  // Place the "trying to connect" bubble directly below the "Here's a live feed
  // of the emergency" video bubble, then remove it once the dispatcher replies.
  useEffect(() => {
    const requestKey = videoRequestId ?? 'initial-video';
    if (!withVideo || startedRequestRef.current !== requestKey) return;

    // Remove once the dispatcher sends any text reply.
    if (!connectingResolvedRef.current) {
      const dispatcherReplied = chatMessages.some((m: any) => m.incoming === true && m.type === 'chat');
      if (dispatcherReplied && chatMessages.some((m: any) => m.type === 'video-connecting')) {
        connectingResolvedRef.current = true;
        setChatMessages((prev) => prev.filter((m: any) => m.type !== 'video-connecting'));
        return;
      }
    }
    if (connectingResolvedRef.current || connectingInsertedRef.current) return;

    // Wait until the video bubble exists, then insert the connecting bubble right after it.
    if (!chatMessages.some((m: any) => m.type === 'video')) return;
    connectingInsertedRef.current = true;
    setChatMessages((prev) => {
      const i = prev.findIndex((m: any) => m.type === 'video');
      if (i === -1 || prev.some((m: any) => m.type === 'video-connecting')) return prev;
      const next = [...prev];
      next.splice(i + 1, 0, { type: 'video-connecting', timestamp: Date.now() });
      return next;
    });
    scrollToBottom(600);
  }, [withVideo, videoRequestId, chatMessages, setChatMessages, scrollToBottom]);
};
