import React from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import AppText from '../../components/AppText';
import AppTextInput from '../../components/AppTextInput';
import { WebView } from 'react-native-webview';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import AddressAutocompleteInput from '../../components/AddressAutocompleteInput';
import { buildLeafletMapHtml } from './emergencyMap';
import { reverseGeocode } from './reverseGeocode';

const Text = AppText;
const TextInput = AppTextInput;

interface Props {
  colors: any; styles: any; fs: (n: number) => number; t: (v: string) => string;
  mapType: string; setMapType: (v: string) => void;
  showStreetNames: boolean; setShowStreetNames: (v: boolean) => void;
  showBusinessNames: boolean; setShowBusinessNames: (v: boolean) => void;
  insideOutside: 'inside' | 'outside'; setInsideOutside: (v: any) => void;
  floorType: 'level' | 'basement'; setFloorType: (v: any) => void;
  floorNumber: string; setFloorNumber: (v: string) => void;
  confirmedFloor: number | null;
  mapSectionHeight: number; setMapSectionHeight: (v: number) => void;
  mapViewRatio: number; setMapViewRatio: (v: number) => void;
  isDraggingDivider: boolean; setIsDraggingDivider: (v: boolean) => void;
  baseMapUrl: string | null; mapContainerSize: { w: number; h: number };
  setMapContainerSize: (v: any) => void;
  streetViewPosition: any; mapCenter: any; mapZoom: number; setMapZoom: (v: number) => void;
  coneHeading: number; mapPin: any; setMapPin: (v: any) => void; setPinFullAddress: (v: string) => void;
  mapPanOffset: { x: number; y: number }; setMapPanOffset: (v: any) => void;
  mapPanOffsetRef: React.MutableRefObject<{ x: number; y: number }>;
  mapModified: boolean; setMapModified: (v: boolean) => void;
  showArrow: boolean; setShowArrow: (v: boolean) => void;
  detectedAddresses: any[]; currentAddressIndex: number;
  detectedLocation: any; svHtml: string | null; webViewRef: React.RefObject<any>;
  webViewKey: number; controlsVisible: boolean;
  pan: any; isRotating: boolean; setIsRotating: (v: boolean) => void;
  joystickSize: number; knobSize: number; maxDistance: number; currentHeading: number;
  setJoystickPosition: (v: any) => void;
  pinchStartRef: React.MutableRefObject<any>; panMidpointRef: React.MutableRefObject<any>;
  lastPanoId: React.MutableRefObject<string | null>; initialState: React.MutableRefObject<any>;
  initialStateSettled: React.MutableRefObject<number>; skipRecenterUntil: React.MutableRefObject<number>;
  tapStartRef: React.MutableRefObject<any>; mapContainerRef: React.RefObject<any>;
  lastResetTime: React.MutableRefObject<number>;
  streetViewUrl: string | null;
  addressSearchText: string; setAddressSearchText: (v: string) => void;
  addressSearching: boolean; addressSearchFocused: boolean;
  setAddressSearchFocused: (v: boolean) => void;
  searchAddress: (q: string) => void;
  buildMapUrl: (lat: number, lng: number, zoom: number, hideCircle?: boolean) => string;
  setConeHeading: (v: number) => void; setStreetViewPosition: (v: any) => void;
  setBaseMapUrl: (v: string) => void; setMapCenter: (v: any) => void;
  setMapExpanded: (v: boolean) => void;
  bottomAreaHeight: number; searchToggleHeight: number; setSearchToggleHeight: (v: number) => void;
  calculateHeading: (lat1: number, lng1: number, lat2: number, lng2: number) => number;
}

export const EmergencyMapNavigator: React.FC<Props> = (props) => {
  const { colors, styles, t, mapType, setMapType,
    insideOutside, setInsideOutside, floorType,
    setFloorType, floorNumber, setFloorNumber, confirmedFloor, setMapSectionHeight,
    setMapContainerSize, streetViewPosition, mapCenter, mapZoom,
    mapPin, setMapPin, setPinFullAddress, setMapPanOffset, mapPanOffsetRef, mapModified,
    setMapModified, setShowArrow, detectedAddresses, currentAddressIndex, detectedLocation,
    addressSearchText, setAddressSearchText,
    addressSearching, setAddressSearchFocused, searchAddress, setMapExpanded,
    bottomAreaHeight, searchToggleHeight, setSearchToggleHeight } = props;

  const leafletMapRef = React.useRef<any>(null);
  const fallbackCenterLat = mapCenter?.lat ?? streetViewPosition?.lat ?? detectedLocation?.latitude ?? 0;
  const fallbackCenterLng = mapCenter?.lng ?? streetViewPosition?.lng ?? detectedLocation?.longitude ?? 0;
  const leafletCenterLat = mapCenter?.lat ?? detectedLocation?.latitude ?? fallbackCenterLat;
  const leafletCenterLng = mapCenter?.lng ?? detectedLocation?.longitude ?? fallbackCenterLng;
  const leafletPinLat = mapPin?.lat ?? detectedAddresses[currentAddressIndex]?.latitude ?? detectedLocation?.latitude ?? leafletCenterLat;
  const leafletPinLng = mapPin?.lng ?? detectedAddresses[currentAddressIndex]?.longitude ?? detectedLocation?.longitude ?? leafletCenterLng;
  const leafletHtml = React.useMemo(
    () => buildLeafletMapHtml(leafletCenterLat, leafletCenterLng, mapZoom, true, leafletPinLat, leafletPinLng),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Math.round(leafletCenterLat * 1000), Math.round(leafletCenterLng * 1000)],
  );
  React.useEffect(() => {
    if (!leafletMapRef.current || (!leafletCenterLat && !leafletCenterLng)) return;
    leafletMapRef.current.injectJavaScript(`if(typeof window.setView==='function')window.setView(${leafletCenterLat},${leafletCenterLng},${mapZoom});true;`);
  }, [mapCenter?.lat, mapCenter?.lng, mapZoom]);
  React.useEffect(() => {
    if (!leafletMapRef.current) return;
    leafletMapRef.current.injectJavaScript(`if(typeof window.setPin==='function')window.setPin(${leafletPinLat},${leafletPinLng});true;`);
  }, [mapPin, currentAddressIndex]);
  React.useEffect(() => {
    if (!leafletMapRef.current) return;
    leafletMapRef.current.injectJavaScript(`if(typeof window.setTileType==='function')window.setTileType('${mapType === 'satellite' ? 'satellite' : 'roadmap'}');true;`);
  }, [mapType]);

  return (
    <>
      <View style={{ position: 'absolute', top: 99, bottom: bottomAreaHeight + 34 + searchToggleHeight, left: '2.5%', right: '2.5%', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden', paddingTop: 12, paddingHorizontal: 12, paddingBottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, zIndex: 50 }}>
        <View style={styles.popupHeader}>
          <Text style={styles.popupTitle}>Update Location</Text>
          <TouchableOpacity onPress={() => setMapExpanded(false)} style={styles.popupCloseBtn}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', marginBottom: 8 }}>
          <View style={styles.mapTypeToggle}>
            <TouchableOpacity style={[styles.mapTypeToggleBtn, mapType !== 'satellite' && styles.mapTypeToggleBtnActive]} onPress={() => setMapType('roadmap')}>
              <Ionicons name="map-outline" size={16} color={mapType !== 'satellite' ? colors.textPrimary : colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.mapTypeToggleBtn, mapType === 'satellite' && styles.mapTypeToggleBtnActive]} onPress={() => setMapType('satellite')}>
              <Ionicons name="earth" size={16} color={mapType === 'satellite' ? colors.textPrimary : colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flex: 1, overflow: 'hidden', borderRadius: 10, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 }} onLayout={(e) => { setMapSectionHeight(e.nativeEvent.layout.height); const { width, height } = e.nativeEvent.layout; setMapContainerSize({ w: width, h: height }); }}>
          {(leafletCenterLat || leafletCenterLng) ? (
            <WebView ref={leafletMapRef} source={{ html: leafletHtml }} style={{ flex: 1 }} javaScriptEnabled domStorageEnabled originWhitelist={['*']} onLoadEnd={() => { if (leafletMapRef.current) leafletMapRef.current.injectJavaScript(`if(typeof window.setTileType==='function')window.setTileType('${mapType === 'satellite' ? 'satellite' : 'roadmap'}');true;`); }} onMessage={async (event) => { try { const data = JSON.parse(event.nativeEvent.data); if (data.type === 'map_click') { setMapPin({ lat: data.lat, lng: data.lng }); setMapModified(true); setAddressSearchText('Resolving address...'); setPinFullAddress(''); const geo = await reverseGeocode(data.lat, data.lng); const address = geo?.address || `${Number(data.lat).toFixed(6)}, ${Number(data.lng).toFixed(6)}`; setPinFullAddress(address); setAddressSearchText(address); } } catch {} }} />
          ) : (
            <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted }}>Loading map...</Text>
            </View>
          )}
          {(mapPin || mapModified) && (
            <TouchableOpacity onPress={() => { setMapPanOffset({ x: 0, y: 0 }); mapPanOffsetRef.current = { x: 0, y: 0 }; setShowArrow(false); setMapModified(false); setMapPin(null); if (leafletMapRef.current) leafletMapRef.current.injectJavaScript(`if(typeof window.setView==='function')window.setView(${fallbackCenterLat},${fallbackCenterLng},${mapZoom});if(typeof window.setPin==='function')window.setPin(${fallbackCenterLat},${fallbackCenterLng});true;`); }} style={{ position: 'absolute', top: 8, left: 0, backgroundColor: 'rgba(0,0,0,0.5)', borderTopRightRadius: 12, borderBottomRightRadius: 12, borderWidth: 1.5, borderLeftWidth: 0, borderColor: 'rgba(255,255,255,0.3)', paddingVertical: 6, paddingHorizontal: 12 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View onLayout={(e) => setSearchToggleHeight(e.nativeEvent.layout.height)} style={{ position: 'absolute', bottom: bottomAreaHeight + 34, left: '2.5%', right: '2.5%', backgroundColor: colors.surface, zIndex: 51, paddingHorizontal: 12, paddingBottom: 12, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={[styles.mapSearchBox, { zIndex: 200 }]}>
          <AddressAutocompleteInput containerStyle={{ flex: 1 }} rowStyle={styles.mapSearchRow} inputStyle={styles.mapSearchAddressInput} rightElement={<View style={{ flexDirection: 'row', alignItems: 'center' }}>{addressSearching && <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginRight: 4 }} />}<TouchableOpacity onPress={() => searchAddress(addressSearchText)} style={{ marginLeft: 6, padding: 4 }}><Ionicons name="search" size={15} color={colors.textSecondary} /></TouchableOpacity></View>} value={addressSearchText} onChangeText={(v: string) => setAddressSearchText(v)} onSubmitEditing={() => searchAddress(addressSearchText)} onSelectAddress={(parts: any) => { setAddressSearchText(parts.displayName); searchAddress(parts.displayName); }} onFocus={() => setAddressSearchFocused(true)} onBlur={() => setAddressSearchFocused(false)} placeholder={t('address...')} placeholderTextColor={colors.inputPlaceholder} returnKeyType="search" selectTextOnFocus />
        </View>
        <View style={styles.mapLocationBar}>
          <View style={styles.mapTypeToggle}>
            <TouchableOpacity style={[styles.mapTypeToggleBtn, insideOutside === 'inside' && styles.mapTypeToggleBtnActive]} onPress={() => setInsideOutside('inside')}>
              <Text style={[styles.mapTypeToggleBtnText, insideOutside === 'inside' && styles.mapTypeToggleBtnTextActive]}>{t('Indoor')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.mapTypeToggleBtn, insideOutside === 'outside' && styles.mapTypeToggleBtnActive]} onPress={() => setInsideOutside('outside')}>
              <Text style={[styles.mapTypeToggleBtnText, insideOutside === 'outside' && styles.mapTypeToggleBtnTextActive]}>{t('Outdoor')}</Text>
            </TouchableOpacity>
          </View>
          {insideOutside === 'inside' && (
            <View style={styles.mapTypeToggle}>
              <TouchableOpacity style={[styles.mapTypeToggleBtn, floorType === 'basement' && styles.mapTypeToggleBtnActive]} onPress={() => setFloorType('basement')}>
                <Text style={[styles.mapTypeToggleBtnText, floorType === 'basement' && styles.mapTypeToggleBtnTextActive]}>{t('Sublevel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.mapTypeToggleBtn, floorType === 'level' && styles.mapTypeToggleBtnActive]} onPress={() => setFloorType('level')}>
                <Text style={[styles.mapTypeToggleBtnText, floorType === 'level' && styles.mapTypeToggleBtnTextActive]}>{t('Level')}</Text>
              </TouchableOpacity>
              <View style={styles.mapFloorPillDivider} />
              <TextInput style={styles.mapFloorPillInput} value={floorNumber} onChangeText={setFloorNumber} keyboardType="number-pad" placeholder={confirmedFloor != null ? String(Math.abs(confirmedFloor)) : '1'} placeholderTextColor={colors.inputPlaceholder} maxLength={3} />
            </View>
          )}
        </View>
      </View>
    </>
  );
};
