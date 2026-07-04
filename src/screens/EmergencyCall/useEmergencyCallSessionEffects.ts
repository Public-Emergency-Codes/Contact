import { useCallback, useEffect, useRef } from 'react';
import { Animated, Keyboard, Platform, DeviceEventEmitter, NativeModules } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import psapMessagingService from '../../services/psap/psapMessagingService';
import { extractPsapVideoUrl } from '../../services/psap/videoLinkService';
import emergencyLocationService from '../../services/location/emergencyLocationService';
import { haversineMeters, geocodeAddressesToCoords, buildDispatcherInfo } from '../../services/savedAddressService';
import { calculateDistance } from './emergencyMap';
import { calculateHeading } from './emergencyMap';
import { EMERGENCY_TEST_NUMBER } from '../../services/runtimeConfig';
import emergencyCallTraceService from '../../services/emergencyCallTraceService';
import { HIDE_CURRENT_AFTER_MS } from './emergencyCallSessionStore';

export const useEmergencyCallSessionEffects = ({
  psapSmsSessionActive, setChatMessages, scrollToBottom, camera,
  emergencyTypeSelection, showLocationConfirm, detectedLocation,
  sendPsapMessage, setKeyboardHeight, detectedAddresses, initialAddressIndex,
  svHtml, setSvHtml, coneHeading, setConeHeading, locationScanTimerRef, lastScannedLocationRef,
  savedAddresses, prevAddrTimestamps, savedAddrSentRef, setExactMatchAddress, setNearbyAddress,
  setNearbyAddressConfirmed, detectedAddress, recordingDotOpacity, chatMessages,
  lastChatLengthRef, identityPhotosAtTopRef, scrollViewRef, actions,
  streetViewPosition, mapCenter, mapZoom, baseMapUrl, mapType, showStreetNames,
  showBusinessNames, mapPin, setMapCenter, setBaseMapUrl,
  initialState, lastPanoId, skipRecenterUntil, activeE911EventId,
}: any) => {
  const actionsRef = useRef(actions);
  const firstTrackingTickTracedRef = useRef(false);
  actionsRef.current = actions;

  const loadIncomingMmsImages = useCallback(async () => {
    const SmsReader = NativeModules?.SmsReader;
    if (typeof SmsReader?.getCachedIncomingMms !== 'function') return;

    let psapNumber = EMERGENCY_TEST_NUMBER;
    if (__DEV__) {
      try {
        const override = await AsyncStorage.getItem('dev_emergency_override_number');
        if (override?.trim()) psapNumber = override.trim();
      } catch (_) {}
    }

    try {
      const cached = await SmsReader.getCachedIncomingMms(psapNumber, 50);
      const cutoff = Date.now() - HIDE_CURRENT_AFTER_MS;
      const incomingImages = (Array.isArray(cached) ? cached : [])
        .filter((m: any) => {
          const timestamp = Number(m?.date || 0);
          return !!m?.imageUri && timestamp > 0 && timestamp >= cutoff;
        })
        .map((m: any) => ({
          id: m.id || `incoming_mms_${m.date}`,
          text: m.body || '',
          type: 'chat',
          incoming: true,
          timestamp: Number(m.date),
          imageUrl: m.imageUri,
          mediaMime: m.mediaMime,
        }));
      if (incomingImages.length === 0) return;

      setChatMessages((prev: any[]) => {
        const next = [...prev];
        for (const msg of incomingImages) {
          const already = next.some((m: any) =>
            (msg.id && m.id === msg.id) ||
            (m.incoming && m.imageUrl === msg.imageUrl) ||
            (m.incoming && m.imageUrl && Math.abs((m.timestamp || 0) - msg.timestamp) < 5000)
          );
          if (!already) next.push(msg);
        }
        return next;
      });
      scrollToBottom(500);
    } catch (err) {
      console.warn('[E911] Failed to load incoming MMS images:', err);
    }
  }, [scrollToBottom, setChatMessages]);

  // Listen for outgoing SMS to run screen-level location detection calibration on the first message sent.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'onOutgoingSmsDetected',
      async (_event: { address: string; body: string; timestamp: number }) => {
        console.log(`[E911 UI] Outgoing SMS detected natively. checking if calibration needed...`);
        try {
          if (!detectedLocation && actionsRef.current?.runLocationDetection) {
            console.log(`[E911 UI] Location not yet resolved. Running screen-level location detection calibration...`);
            await actionsRef.current.runLocationDetection();
          }
        } catch (err) {
          console.error('[E911 UI] Failed to run location detection on outgoing SMS:', err);
        }
      }
    );
    return () => sub.remove();
  }, [detectedLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start the SMS observer session as soon as the E911 screen mounts (not waiting for psapSmsCapable).
  // In dev with override we need it up immediately so replies populate in the chat.
  // In prod, psapSmsCapable drives whether we actually send, but we can safely observe from the start.
  useEffect(() => {
    if (psapSmsSessionActive.current) return; // already started
    (async () => {
      let psapNumber = EMERGENCY_TEST_NUMBER;
      if (__DEV__) {
        try {
          const override = await AsyncStorage.getItem('dev_emergency_override_number');
          if (override) { psapNumber = override; console.log('[DEV] PSAP SMS session using override number:', override); }
        } catch (_) {}
      }
      psapMessagingService.startSession(psapNumber).then((ok: boolean) => {
        psapSmsSessionActive.current = ok;
        console.log('[PsapSms] startSession result:', ok, 'number:', psapNumber);
      });
    })();
    return () => {
      if (psapSmsSessionActive.current) { psapMessagingService.stopSession(); psapSmsSessionActive.current = false; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadIncomingMmsImages();
    const sub = DeviceEventEmitter.addListener('onMmsReceived', () => {
      setTimeout(() => loadIncomingMmsImages(), 1500);
    });
    return () => sub.remove();
  }, [loadIncomingMmsImages]);

  // Single listener via DeviceEventEmitter — deduplicates by timestamp.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'onPsapSmsReceived',
      (event: { sender: string; body: string; timestamp: number }) => {
        console.log(`[E911] Direct DeviceEventEmitter — SMS from ${event.sender}: ${event.body}`);

        // Push the raw SMS chat bubble (deduped by timestamp).
        setChatMessages((prev: any[]) => {
          const already = prev.some((m: any) => m.timestamp === event.timestamp && m.incoming);
          if (already) return prev;
          return [...prev, { text: event.body, type: 'chat', incoming: true, timestamp: event.timestamp }];
        });

        // If the SMS contains a PSAP video invite URL, push a native WebView
        // bubble immediately below it so the video session opens in-app with
        // no extra taps needed from the user.
        const videoUrl = extractPsapVideoUrl(event.body);
        if (videoUrl) {
          console.log('[E911] PSAP video invite URL detected:', videoUrl);
          setChatMessages((prev: any[]) => {
            // Only insert one psap-video bubble per URL.
            if (prev.some((m: any) => m.type === 'psap-video' && m.url === videoUrl)) return prev;
            return [...prev, { type: 'psap-video', url: videoUrl, timestamp: event.timestamp + 1 }];
          });
        }

        scrollToBottom(400);
      },
    );
    return () => sub.remove();
  }, [scrollToBottom, setChatMessages]);

  useEffect(() => {
    const hasVideoBubble = chatMessages.some((m: any) => m.type === 'video');
    if (camera.videoStreamingActive && (!camera.videoBubblePushedRef.current || !hasVideoBubble)) {
      camera.videoBubblePushedRef.current = true;
      setChatMessages((prev: any[]) => (
        prev.some((m: any) => m.type === 'video') ? prev : [...prev, { type: 'video', timestamp: Date.now() }]
      ));
      scrollToBottom(400);
    }
  }, [camera.videoStreamingActive, camera.videoBubblePushedRef, chatMessages, scrollToBottom, setChatMessages]);

  useEffect(() => {
    if (!camera.videoStreamingActive) {
      camera.videoBubblePushedRef.current = false;
      setChatMessages((prev: any[]) => (
        prev.some((m: any) => m.type === 'video-connecting')
          ? prev.filter((m: any) => m.type !== 'video-connecting')
          : prev
      ));
    }
  }, [camera.videoStreamingActive, camera.videoBubblePushedRef, setChatMessages]);

  useEffect(() => { if (emergencyTypeSelection) scrollToBottom(); }, [emergencyTypeSelection, scrollToBottom]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e: any) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [setKeyboardHeight]);

  useEffect(() => {
    if (!showLocationConfirm || !detectedAddresses.length || svHtml) return;
    const addr = detectedAddresses[initialAddressIndex] || detectedAddresses[0];
    const heading = calculateHeading(addr.panoLat ?? addr.roadLat ?? addr.latitude, addr.panoLng ?? addr.roadLng ?? addr.longitude, addr.latitude, addr.longitude);
    if (coneHeading === 0 && Number.isFinite(heading)) setConeHeading(heading);
  }, [showLocationConfirm, detectedAddresses, initialAddressIndex, svHtml, coneHeading, setConeHeading, setSvHtml]);

  useEffect(() => {
    if (!showLocationConfirm || !detectedLocation || !streetViewPosition || !!baseMapUrl || !!mapPin) return;
    const midLat = (streetViewPosition.lat + detectedLocation.latitude) / 2;
    const midLng = (streetViewPosition.lng + detectedLocation.longitude) / 2;
    const nextUrl = actionsRef.current.buildMapUrl(midLat, midLng, mapZoom);
    if (!mapCenter || mapCenter.lat !== midLat || mapCenter.lng !== midLng) setMapCenter({ lat: midLat, lng: midLng });
    if (nextUrl !== baseMapUrl) setBaseMapUrl(nextUrl);
  }, [showLocationConfirm, detectedLocation, streetViewPosition, mapCenter, mapZoom, baseMapUrl, mapPin]);

  useEffect(() => {
    if (!mapCenter || !baseMapUrl) return;
    const nextUrl = actionsRef.current.buildMapUrl(mapCenter.lat, mapCenter.lng, mapZoom);
    if (nextUrl !== baseMapUrl) setBaseMapUrl(nextUrl);
  }, [mapCenter, mapZoom, baseMapUrl, mapType, showStreetNames, showBusinessNames]);

  useEffect(() => {
    if (!showLocationConfirm || Date.now() < skipRecenterUntil.current) return;
    if (!streetViewPosition || !mapCenter || !baseMapUrl) return;
    const metersPerTilePixel = 156543.03392 * Math.cos(mapCenter.lat * Math.PI / 180) / Math.pow(2, mapZoom);
    const metersPerDIP = metersPerTilePixel / 2;
    const latDiff = streetViewPosition.lat - mapCenter.lat;
    const lngDiff = streetViewPosition.lng - mapCenter.lng;
    const pixelDist = Math.sqrt(
      Math.pow(lngDiff * 111320 * Math.cos(mapCenter.lat * Math.PI / 180) / metersPerDIP, 2) +
      Math.pow(latDiff * 111320 / metersPerDIP, 2)
    );
    if (pixelDist > (mapPin ? 50 : 200)) {
      setMapCenter({ lat: streetViewPosition.lat, lng: streetViewPosition.lng });
      setBaseMapUrl(actionsRef.current.buildMapUrl(streetViewPosition.lat, streetViewPosition.lng, mapZoom, !!mapPin));
    }
  }, [showLocationConfirm, streetViewPosition, mapCenter, baseMapUrl, mapZoom, mapPin, skipRecenterUntil]);

  useEffect(() => {
    if (initialState.current || !baseMapUrl || !mapCenter || !streetViewPosition || coneHeading === 0) return;
    initialState.current = {
      mapCenter: { ...mapCenter },
      mapZoom,
      baseMapUrl,
      svLat: streetViewPosition.lat,
      svLng: streetViewPosition.lng,
      svHeading: coneHeading,
      coneHeading,
      panoId: lastPanoId.current,
    };
  }, [initialState, baseMapUrl, mapCenter, streetViewPosition, coneHeading, mapZoom, lastPanoId]);

  useEffect(() => {
    if (!showLocationConfirm || !detectedLocation) {
      if (locationScanTimerRef.current) clearInterval(locationScanTimerRef.current);
      locationScanTimerRef.current = null;
      lastScannedLocationRef.current = null;
      return;
    }
    let stopNativeTracking: (() => void) | null = null;
    if (!lastScannedLocationRef.current) lastScannedLocationRef.current = { latitude: detectedLocation.latitude, longitude: detectedLocation.longitude };
    const monitorPosition = (lat: number, lng: number) => {
      if (activeE911EventId && !firstTrackingTickTracedRef.current) {
        firstTrackingTickTracedRef.current = true;
        emergencyCallTraceService.trace('first_tracking_tick_1s', {
          latitude: lat,
          longitude: lng,
        }, activeE911EventId).catch(() => {});
      }
      const base = lastScannedLocationRef.current;
      if (base && calculateDistance(base.latitude, base.longitude, lat, lng) >= 100) {
        actionsRef.current.handleRelocationDetected(lat, lng);
      }
    };

    (async () => {
      try {
        stopNativeTracking = await emergencyLocationService.startLocationMonitoring((pos: any) => {
          monitorPosition(pos.latitude, pos.longitude);
        });
      } catch {
        locationScanTimerRef.current = setInterval(async () => {
          try {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            monitorPosition(pos.coords.latitude, pos.coords.longitude);
          } catch {}
        }, 1000);
      }
    })();

    return () => {
      if (locationScanTimerRef.current) clearInterval(locationScanTimerRef.current);
      locationScanTimerRef.current = null;
      if (stopNativeTracking) stopNativeTracking();
      firstTrackingTickTracedRef.current = false;
    };
  }, [activeE911EventId, detectedLocation, lastScannedLocationRef, locationScanTimerRef, showLocationConfirm]); // 'actions' intentionally omitted – actionsRef kept current above

  useEffect(() => {
    const next = new Map(savedAddresses.map((a: any) => [a.id, a.updatedAt]));
    const prev = prevAddrTimestamps.current;
    let changed = next.size !== prev.size;
    if (!changed) for (const [id, ts] of next as Map<string, string>) if (prev.get(id) !== ts) { changed = true; break; }
    prevAddrTimestamps.current = next as Map<string, string>;
    if (changed) { savedAddrSentRef.current = false; setExactMatchAddress(null); setNearbyAddress(null); setNearbyAddressConfirmed(false); }
  }, [savedAddresses]);

  useEffect(() => {
    if (!showLocationConfirm || !detectedAddress || !detectedLocation || savedAddrSentRef.current || !savedAddresses.length) return;
    // Expand common abbreviations so "221 E 4th St" matches "221 East 4th
    // Street". Without this, normalize() would leave directional letters
    // ("E"/"W"/"N"/"S") and street-type suffixes ("St"/"Ave"/...) in their
    // short form on one side and long form on the other, causing the
    // exact-match check to fail and the UI to fall through to the
    // less-accurate "near your Home" wording.
    const ABBREV: Record<string, string> = {
      n: 'north', s: 'south', e: 'east', w: 'west',
      ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
      st: 'street', str: 'street', ave: 'avenue', av: 'avenue',
      blvd: 'boulevard', rd: 'road', dr: 'drive', ln: 'lane',
      ct: 'court', pl: 'place', plz: 'plaza', pkwy: 'parkway',
      hwy: 'highway', ter: 'terrace', trl: 'trail', cir: 'circle',
      sq: 'square', way: 'way',
    };
    const expand = (s: string) => s.split(' ').map(tok => ABBREV[tok] ?? tok).join(' ');
    const norm = (s: string) => expand(s.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' '));
    const streetPart = (s: string) => norm(s.split(',')[0]);
    const zipPart = (s: string) => { const match = s.match(/\b\d{5}\b/); return match ? match[0] : ''; };
    const detectedStreet = streetPart(detectedAddress);
    const detectedZip = zipPart(detectedAddress);
    const exact = savedAddresses.find((a: any) => {
      const savedStreet = streetPart(a.address); const savedZip = zipPart(a.address);
      return savedStreet === detectedStreet && (savedZip === '' || detectedZip === '' || savedZip === detectedZip);
    });
    if (exact) {
      savedAddrSentRef.current = true; setExactMatchAddress(exact);
      sendPsapMessage(`SAVED ADDRESS INFO:\n${buildDispatcherInfo(exact)}`, detectedLocation.latitude, detectedLocation.longitude).catch(() => {});
      return;
    }
    geocodeAddressesToCoords(savedAddresses).then((resolved: any[]) => {
      let best: any = null; let bestDist = Infinity;
      for (const addr of resolved) {
        const dist = haversineMeters(detectedLocation.latitude, detectedLocation.longitude, addr.latitude, addr.longitude);
        if (dist < 100 && dist < bestDist) { best = addr; bestDist = dist; }
      }
      if (best) setNearbyAddress({ type: 'nearby', address: best });
    }).catch(() => {});
  }, [detectedAddress, detectedLocation, savedAddresses, savedAddrSentRef, sendPsapMessage, setExactMatchAddress, setNearbyAddress, showLocationConfirm]);

  useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(recordingDotOpacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
      Animated.timing(recordingDotOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [recordingDotOpacity]);

  useEffect(() => {
    if (chatMessages.length > lastChatLengthRef.current) {
      const first = chatMessages[0];
      if (first?.imageUrl && !first.text) {
        identityPhotosAtTopRef.current = true;
        [50, 150, 300, 600].forEach((delay) => setTimeout(() => scrollViewRef.current?.scrollTo?.({ y: 0, animated: true }), delay));
      } else if (first && !first.imageUrl) {
        identityPhotosAtTopRef.current = false;
      }
    }
    lastChatLengthRef.current = chatMessages.length;
  }, [chatMessages, identityPhotosAtTopRef, lastChatLengthRef, scrollViewRef]);
};
