import React from 'react';
import type { EmergencyMessageStateSetter } from './emergencyCallMessageTypes';
import { View, TouchableOpacity, Image, Animated } from 'react-native';
import { WebView } from 'react-native-webview';
import AppText from '../../components/AppText';
import { buildLeafletMapHtml, toStreetAddress } from './emergencyMap';
import { MessageDeliveryMetadata } from './EmergencyCallMessageList';

const Text = AppText;

interface IdentityImage { uri: string; caption: string; }

interface Props {
  loading: boolean; showLocationConfirm: boolean; detectedLocation: any;
  loadingDots: string; mapExpanded: boolean;
  exactMatchAddress: any; nearbyAddress: any; nearbyAddressConfirmed: boolean;
  setNearbyAddressConfirmed: (v: boolean) => void; savedAddrSentRef: React.MutableRefObject<boolean>;
  buildDispatcherInfo: (addr: any) => string; sendPsapMessage: (m: string, lat?: number, lng?: number) => Promise<boolean>;
  setChatMessages: EmergencyMessageStateSetter; previewAddressText: string;
  detectedAddresses: any[]; initialAddressIndex: number; currentAddressIndex: number;
  streetViewPosition: any; streetViewUrl: string | null; lastPanoId: React.MutableRefObject<string | null>;
  lastLocationMsgIdx: number; openLocationNavigator: () => void;
  baseMapUrl?: string | null;
  // Collapse anim props for thumb
  locationCollapseAnim: Animated.Value; locationThumbRef: React.RefObject<any>;
  expandedAnims: Set<Animated.Value>; expandOne: (anim: Animated.Value, ref?: any) => void;
  collapseH: number;
  // Identity photos
  pinnedIdentityImages: IdentityImage[];
  identityThumbRefs: React.MutableRefObject<Record<number, any>>;
  getIdentityAnim: (idx: number) => Animated.Value;
  // Styles
  colors: any; styles: any; fs: (n: number) => number; t: (k: string) => string;
  btnLabel: any;
}

export const EmergencyLocationPreview: React.FC<Props> = ({
  loading, showLocationConfirm, detectedLocation, loadingDots, mapExpanded,
  exactMatchAddress, nearbyAddress, nearbyAddressConfirmed, setNearbyAddressConfirmed,
  savedAddrSentRef, buildDispatcherInfo, sendPsapMessage, setChatMessages, previewAddressText,
  detectedAddresses, initialAddressIndex, streetViewPosition, streetViewUrl,
  lastLocationMsgIdx, openLocationNavigator, locationCollapseAnim, locationThumbRef,
  expandedAnims, expandOne, collapseH, pinnedIdentityImages, identityThumbRefs,
  getIdentityAnim, colors, styles, fs, t, btnLabel,
}) => (
  <>
    {/* Identity photos pinned at top */}
    {pinnedIdentityImages.map(({ uri, caption }, idx) => (
      <View key={`identity-${idx}`} style={[styles.previewCard, { marginBottom: 12 }]}>
        <View style={styles.chatSection}><View style={styles.chatRowRight}><View style={styles.chatBubbleRight}>
          <Text style={[styles.chatText, { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0, fontSize: fs(13), lineHeight: fs(18) }]}>{caption}</Text>
          <Animated.View ref={(el: any) => { identityThumbRefs.current[idx] = el; }} style={{ maxHeight: getIdentityAnim(idx).interpolate({ inputRange: [0, 1], outputRange: [0, 500] }), overflow: 'hidden' }}>
            <View style={{ marginTop: 10, marginHorizontal: 12, marginBottom: 10 }}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => expandOne(getIdentityAnim(idx), { current: identityThumbRefs.current[idx] })} style={{ borderRadius: 8, overflow: 'hidden' }}>
                <Image source={{ uri }} style={{ width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.background }} resizeMode="cover" />
              </TouchableOpacity>
            </View>
          </Animated.View>
          <Animated.View style={{ maxHeight: getIdentityAnim(idx).interpolate({ inputRange: [0, 0.15, 1], outputRange: [collapseH, 0, 0] }), opacity: getIdentityAnim(idx).interpolate({ inputRange: [0, 0.15, 1], outputRange: [1, 0, 0] }), overflow: 'hidden' }}>
            <TouchableOpacity onPress={() => expandOne(getIdentityAnim(idx), { current: identityThumbRefs.current[idx] })} activeOpacity={0.7} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10, marginHorizontal: 12, marginBottom: 10, alignSelf: 'stretch', alignItems: 'center' }}>
              <Text style={btnLabel}>View sent photo</Text>
            </TouchableOpacity>
          </Animated.View>
        </View></View></View>
      </View>
    ))}

    {/* Loading dots (before location confirmed) */}
    {loading && !showLocationConfirm && (
      <View style={{ marginTop: 0, marginBottom: 12 }}>
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: 14, borderTopLeftRadius: 4, paddingTop: 0, paddingBottom: 0, paddingHorizontal: 0, alignSelf: 'flex-start', maxWidth: '80%', overflow: 'hidden' }}>
          <Text style={[styles.chatText, { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0, fontSize: fs(13), lineHeight: fs(18) }]}>{t('Determining your location')}{loadingDots}</Text>
          <MessageDeliveryMetadata msg={{ type: 'location', timestamp: Date.now() } as any} fs={fs} colors={colors} topInset={6} bottomInset={3} />
        </View>
      </View>
    )}

    {/* Location preview card */}
    {showLocationConfirm && detectedLocation && (
      <View style={styles.previewCard}>
        <View style={styles.chatSection}><View style={styles.chatRowLeft}><View style={styles.chatBubbleLeft}>
          <Text style={[styles.chatText, { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 0, fontSize: fs(13), lineHeight: fs(18) }]}>
            {exactMatchAddress
              ? <>{t('We detect you are located at')}{' '}<Text style={styles.chatHighlight}>{toStreetAddress(exactMatchAddress.address)}</Text> (your <Text style={styles.chatHighlight}>{exactMatchAddress.label}</Text>), if this is inaccurate please use the "Change Location" button.</>
              : nearbyAddress
                ? <>We detect you are near your <Text style={styles.chatHighlight}>{nearbyAddress.address?.label}</Text> at <Text style={styles.chatHighlight}>{previewAddressText}</Text>, if inaccurate use "Change Location".</>
                : <>{t('We detect you are located at')}{' '}<Text style={styles.chatHighlight}>{previewAddressText}</Text>, if this is inaccurate use "Change Location".</>
            }
          </Text>
          {nearbyAddress && !nearbyAddressConfirmed && (
            <View style={{ marginTop: 8, marginHorizontal: 12 }}>
              <TouchableOpacity style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' }} activeOpacity={0.7}
                onPress={() => {
                  const addr = nearbyAddress.address;
                  savedAddrSentRef.current = true; setNearbyAddressConfirmed(true);
                  sendPsapMessage(`SAVED ADDRESS INFO:\n${buildDispatcherInfo(addr)}`, detectedLocation?.latitude, detectedLocation?.longitude).catch(() => {});
                  const bubbleText = addr?.accessInstructions
                    ? `I'm at ${addr.label}, ${addr.address}. ${addr.accessInstructions}`
                    : `I'm at ${addr?.label}, ${addr?.address}`;
                  // Append a normal right-aligned user SMS bubble to the
                  // chat. In the SMS-first layout EmergencyCallScreen splits the
                  // chat around the preview card (using previewSplitIdxRef)
                  // so this bubble lands BELOW the preview, in correct
                  // chronological order.
                  setChatMessages(prev => [...prev, { type: 'user', text: bubbleText }]);
                }}>
                <Text style={btnLabel}>{`I'm at ${nearbyAddress.address?.label}`}</Text>
              </TouchableOpacity>
            </View>
          )}
          {!mapExpanded && (streetViewPosition || streetViewUrl || detectedAddresses.length > 0) && (() => {
            const addr = detectedAddresses[initialAddressIndex] || detectedAddresses[0];
            // Prefer the heading settled by the actual Street View pano (either
            // the visible Update Location WebView or the offscreen
            // StreetViewHeadingResolver). That value comes from the same
            // road-perpendicular getRoadPerpHeading() routine used by the
            // Update Location panel, so the thumbnail matches it head-on.
            // Fall back to a pano→building bearing when the pano hasn't settled
            // yet.
            // When the pano has settled, anchor the Street View at that pano's
            // position so the API picks the same camera the Update Location
            // panel uses (which already walked to the building's frontage).
            const thumbLat = streetViewPosition?.lat
              ?? exactMatchAddress?.latitude
              ?? addr?.latitude
              ?? detectedLocation?.latitude;
            const thumbLng = streetViewPosition?.lng
              ?? exactMatchAddress?.longitude
              ?? addr?.longitude
              ?? detectedLocation?.longitude;
            const mapPinLat = exactMatchAddress?.latitude ?? addr?.latitude ?? detectedLocation?.latitude;
            const mapPinLng = exactMatchAddress?.longitude ?? addr?.longitude ?? detectedLocation?.longitude;
            const pinLat = mapPinLat ?? thumbLat;
            const pinLng = mapPinLng ?? thumbLng;
            if (pinLat == null || pinLng == null) return null;
            const TOTAL_THUMB_HEIGHT = 360;
            return (
              <>
                <Animated.View ref={locationThumbRef} style={{ maxHeight: locationCollapseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, TOTAL_THUMB_HEIGHT + 40] }), overflow: 'hidden' }}>
                  <TouchableOpacity onPress={() => { if (!expandedAnims.has(locationCollapseAnim)) expandOne(locationCollapseAnim, locationThumbRef); else openLocationNavigator(); }} activeOpacity={0.8} style={{ borderRadius: 8, overflow: 'hidden', marginHorizontal: 12, marginTop: 10, backgroundColor: colors.background }}>
                    <View style={{ width: '100%', height: TOTAL_THUMB_HEIGHT }} pointerEvents="none">
                      <WebView source={{ html: buildLeafletMapHtml(pinLat, pinLng, 17, false, pinLat, pinLng) }} style={{ flex: 1 }} javaScriptEnabled domStorageEnabled originWhitelist={['*']} scrollEnabled={false} />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
                <Animated.View style={{ maxHeight: locationCollapseAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [collapseH, 0, 0] }), opacity: locationCollapseAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [1, 0, 0] }), overflow: 'hidden' }}>
                  <TouchableOpacity onPress={() => expandOne(locationCollapseAnim, locationThumbRef)} activeOpacity={0.7} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10, marginHorizontal: 12, marginBottom: lastLocationMsgIdx === -1 ? 0 : 10, alignSelf: 'stretch', alignItems: 'center' }}>
                    <Text style={btnLabel}>View image of your location</Text>
                  </TouchableOpacity>
                </Animated.View>
              </>
            );
          })()}
          {lastLocationMsgIdx === -1 && (
            <TouchableOpacity onPress={openLocationNavigator} activeOpacity={0.7} style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 10, marginHorizontal: 12, marginBottom: 10, alignSelf: 'stretch', alignItems: 'center' }}>
              <Text style={btnLabel}>Change location</Text>
            </TouchableOpacity>
          )}
          <MessageDeliveryMetadata msg={{ type: 'location', timestamp: detectedLocation?.timestamp || Date.now() } as any} fs={fs} colors={colors} />
        </View>
      </View></View>
      </View>
    )}
  </>
);
