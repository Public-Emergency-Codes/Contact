import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import ToggleSwitch from '../../components/ToggleSwitch';
import {
  View, StyleSheet, FlatList, ScrollView, TouchableOpacity,
  Alert, Platform, Modal, Pressable, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
import AppTextInput from '../../components/AppTextInput';
const Text = AppText;
const TextInput = AppTextInput;
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { addAddress, removeAddress, updateAddress, loadSavedAddresses, SavedAddress, AddressLayoutInfo } from '../../store/slices/savedAddressesSlice';
import { useTheme } from '../../context/ThemeContext';
import { useAppLanguage } from '../../context/AppLanguageContext';
import { translateWithDictionary } from '../../services/uiTranslationService';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import AddressLayoutForm from './AddressLayoutForm';
import AddressAutocompleteInput from '../../components/AddressAutocompleteInput';
import { US_STATES } from '../../constants/usStates';

const LABELS = ['Home', 'Work', 'School', 'Other'];

const DEF_LAYOUT: AddressLayoutInfo = {
  buildingType: 'unsure', totalFloors: '', hasElevator: 'unsure', hasGate: 'unsure',
  gateCode: '', parkingLocation: 'unsure', nearestCrossStreet: '', entranceSide: 'unsure',
  hasStairs: 'unsure', additionalInfo: '',
};
const parseAddr = (a: string) => {
  const p = a.split(', ').map((part) => part.trim()).filter(Boolean);
  const lastRaw = p[p.length - 1] || '';
  const lastPart = /^(usa|united states|united states of america)$/i.test(lastRaw)
    ? (p[p.length - 2] || '')
    : lastRaw;
  const usable = /^(usa|united states|united states of america)$/i.test(lastRaw) ? p.slice(0, -1) : p;
  if (usable.length < 3) return { street: usable[0] || a, city: usable[1] || '', state: '', zip: '' };
  const stateZip = lastPart.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/);
  const state = stateZip ? stateZip[1] : lastPart;
  const zip = stateZip ? stateZip[2] : '';
  return { street: usable.slice(0, -2).join(', '), city: usable[usable.length - 2], state, zip };
};

export default function SavedAddressesScreen({ navigation }: any) {
  const dispatch = useAppDispatch();
  const { addresses, loaded } = useAppSelector((s) => s.savedAddresses);
  const { colors } = useTheme();
  const { languageCode, dictionary } = useAppLanguage();
  const t = useCallback((v: string) => translateWithDictionary(v, languageCode, dictionary), [dictionary, languageCode]);
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);
  useEffect(() => { if (!loaded) loadSavedAddresses(dispatch); }, [loaded]);

  const [editAddr, setEditAddr] = useState<SavedAddress | null>(null);
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [street, setStreet] = useState('');
  const [apt, setApt] = useState('');
  const [city, setCity] = useState('');
  const [selState, setSelState] = useState('');
  const [zip, setZip] = useState('');
  const [statePicker, setStatePicker] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [layout, setLayout] = useState<AddressLayoutInfo>({ ...DEF_LAYOUT });
  const [infoVisible, setInfoVisible] = useState(false);
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    if (layoutOpen) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [layoutOpen]);

  const openAdd = () => {
    setEditAddr(null); setLabel(''); setCustomLabel(''); setStreet(''); setApt('');
    setCity(''); setSelState(''); setZip(''); setLayoutOpen(false); setLayout({ ...DEF_LAYOUT });
    setVisible(true);
  };
  const openEdit = (a: SavedAddress) => {
    const p = parseAddr(a.address);
    setEditAddr(a); setLabel(LABELS.includes(a.label) ? a.label : 'Other');
    setCustomLabel(LABELS.includes(a.label) ? '' : a.label);
    setStreet(p.street); setApt(''); setCity(p.city); setSelState(p.state); setZip(p.zip);
    setLayoutOpen(false); setLayout(a.layout || { ...DEF_LAYOUT }); setVisible(true);
  };
  const handleSave = async () => {
    const lbl = label === 'Other' ? customLabel : label;
    if (!lbl.trim()) return Alert.alert(t('Missing'), t('Please choose a label.'));
    if (!street.trim()) return Alert.alert(t('Missing'), t('Please enter a street address.'));
    if (!city.trim()) return Alert.alert(t('Missing'), t('Please enter a city.'));
    if (!selState) return Alert.alert(t('Missing'), t('Please select a state.'));
    const now = new Date().toISOString();
    const aptS = apt.trim() ? `, ${apt.trim()}` : '';
    const zipS = zip.trim() ? ` ${zip.trim()}` : '';
    const fullAddress = `${street.trim()}${aptS}, ${city.trim()}, ${selState}${zipS}`;

    // Offline geocoding from typed address — no external API calls
    let lat: number | undefined;
    let lon: number | undefined;
    try {
      const { geocodeAddressOffline } = require('../../utils/offlineGeocoding');
      const coords = geocodeAddressOffline(fullAddress);
      if (coords) {
        lat = coords.lat;
        lon = coords.lng;
      }
    } catch {
      // Offline geocoding failed — address saves without coordinates
    }

    dispatch((editAddr ? updateAddress : addAddress)({
      id: editAddr?.id || `addr_${Date.now()}`, label: lbl.trim(),
      address: fullAddress,
      accessInstructions: '', layout, includeInSms: true,
      createdAt: editAddr?.createdAt || now, updatedAt: now,
      ...(lat != null && lon != null
        ? { latitude: lat, longitude: lon }
        : {}),
    }));
    setVisible(false);
  };
  const handleDelete = (id: string, lbl: string) => Alert.alert(t('Delete Address'), `${t('Remove')} "${lbl}"?`, [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Delete'), style: 'destructive', onPress: () => { dispatch(removeAddress(id)); setVisible(false); } },
  ]);

  return (
    <SafeAreaView style={s.container} edges={['bottom', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 30, lineHeight: 30, color: colors.textPrimary }}>{'\u2039'}</Text>
        </TouchableOpacity>
        <Text style={s.title}>{t('Saved Addresses')}</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => setInfoVisible(true)}>
          {addresses.length > 0 && <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />}
        </TouchableOpacity>
      </View>

      <FlatList data={addresses} keyExtractor={(a) => a.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={addresses.length === 0 ? <View>
          <Text style={s.desc}>{t("Speed up emergency response at places you visit often — add gate codes, building details, and other access information to your saved addresses.\n\nWhen you make an emergency call through this app from a saved address, that address's information is automatically sent to the dispatcher — and to any emergency contacts you've enabled it for.")}</Text>
          <Text style={s.desc}><Text style={{ fontWeight: 'bold' }}>{t('Privacy Notice:')} </Text>{t("This information is stored only on your device and is never shared unless you initiate an emergency call — it is only shared with the dispatcher and the emergency contacts you've enabled to receive this information.")}</Text>
        </View> : null}
        ListEmptyComponent={null}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardInfo}>
              <Text style={s.cardLabel}>{item.label}</Text>
              <Text style={s.cardAddr} numberOfLines={2}>{item.address}</Text>
              {item.latitude != null && (
                <Text style={s.coordHint}>
                  {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </Text>
              )}
            </View>
            <TouchableOpacity style={s.cardEditBtn} onPress={() => openEdit(item)}>
              <Ionicons name="pencil" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={s.fab} onPress={openAdd}>
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* Address Form Modal */}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => {}}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={s.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalTitleRow}>
              <View />
              {editAddr
                ? <TouchableOpacity onPress={() => handleDelete(editAddr.id, editAddr.label)} style={{ padding: 4 }}>
                    <Ionicons name="trash" size={22} color="#DC2626" />
                  </TouchableOpacity>
                : <View />}
            </View>
            <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.sec}>{t('Label')}</Text>
              <View style={s.labelRow}>
                {LABELS.map((l) => (
                  <TouchableOpacity key={l} style={[s.chip, label === l && s.chipOn]} onPress={() => setLabel(l)}>
                    <Text style={[s.chipText, label === l && s.chipTextOn]}>{t(l)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {label === 'Other' && <TextInput style={s.input} placeholder={t('Custom label...')} placeholderTextColor={colors.inputPlaceholder} value={customLabel} onChangeText={setCustomLabel} />}
              <Text style={s.sec}>{t('Address')}</Text>
              <AddressAutocompleteInput
                containerStyle={{ marginBottom: 10, zIndex: 200 }}
                inputStyle={s.input}
                placeholder={t('123 Main St')}
                placeholderTextColor={colors.inputPlaceholder}
                value={street}
                onChangeText={setStreet}
                onSelectAddress={(parts) => {
                  setStreet(parts.street);
                  setCity(parts.city);
                  if (parts.state) setSelState(parts.state);
                  if (parts.zip) setZip(parts.zip);
                }}
              />
              <TextInput style={s.input} placeholder={t('Apt, Suite, Unit, Building, Floor, etc.')} placeholderTextColor={colors.inputPlaceholder} value={apt} onChangeText={setApt} />
              <TextInput style={s.input} placeholder={t('City')} placeholderTextColor={colors.inputPlaceholder} value={city} onChangeText={setCity} />
              <View style={s.stateZipRow}>
                <TouchableOpacity style={s.statePicker} onPress={() => setStatePicker(true)}>
                  <Text style={selState ? s.stateText : s.statePlaceholder} numberOfLines={1}>{selState || t('State')}</Text>
                </TouchableOpacity>
                <View style={{ width: 8 }} />
                <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder={t('Zip')} placeholderTextColor={colors.inputPlaceholder} keyboardType="numeric" value={zip} onChangeText={setZip} />
              </View>
              <View style={s.layoutRow}>
                <Text style={s.sec}>{t('Building Layout')}</Text>
                <ToggleSwitch value={layoutOpen} onValueChange={setLayoutOpen} />
              </View>
              {!layoutOpen
                ? <Text style={s.hint}>{t('Add building details to help emergency responders navigate to you.')}</Text>
                : <><Text style={s.hint}>{t('Anything left as "Unsure" will NOT be sent to the dispatcher.')}</Text><AddressLayoutForm layout={layout} onChange={setLayout} /></>
              }
            </ScrollView>
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnCancel]} onPress={() => setVisible(false)}>
                <Text style={s.modalBtnText}>{t('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnSave]} onPress={handleSave}>
                <Text style={s.modalBtnText}>{t('Save')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={infoVisible} transparent animationType="fade" onRequestClose={() => setInfoVisible(false)}>
        <Pressable style={s.modalOverlay}>
          <Pressable style={s.infoModal} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalTitleRow}>
              <View />
              <TouchableOpacity style={s.modalCloseButton} onPress={() => setInfoVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={s.infoText}>{t("If you make an emergency call from this app while at one of your saved addresses, the information you've added to that address card will be sent to the dispatcher.")}{'\n\n'}<Text style={{ fontWeight: 'bold' }}>{t('Privacy Notice:')} </Text>{t("This information is stored only on your device and is never shared unless you initiate an emergency call — it is only shared with the dispatcher and the emergency contacts you've enabled to receive this information.")}</Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* State Picker */}
      <Modal visible={statePicker} transparent animationType="slide" onRequestClose={() => setStatePicker(false)}>
        <TouchableOpacity style={s.stateOverlay} activeOpacity={1} onPress={() => setStatePicker(false)}>
          <View style={s.stateSheet}>
            <Text style={s.stateTitle}>{t('Select State')}</Text>
            <FlatList data={US_STATES} keyExtractor={(i) => i} renderItem={({ item }) => (
              <TouchableOpacity style={[s.stateOpt, selState === item && s.stateOptOn]} onPress={() => { setSelState(item); setStatePicker(false); }}>
                <Text style={[s.stateOptText, selState === item && s.stateOptTextOn]}>{item}</Text>
              </TouchableOpacity>
            )} />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors'], topInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: topInset + 8, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.textPrimary, fontSize: 18, fontWeight: 'bold' },
    list: { padding: 16, paddingBottom: 100 },
    desc: { color: colors.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 20 },
    empty: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: 40 },
    card: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardInfo: { flex: 1, marginRight: 12 },
    cardLabel: { color: colors.textPrimary, fontSize: 17, fontWeight: '600', marginBottom: 2 },
    cardAddr: { color: colors.textSecondary, fontSize: 14 },
    coordHint: { color: colors.textMuted, fontSize: 11, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    cardEditBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 8 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: colors.surface, borderRadius: 12, padding: 24, width: '92%', maxWidth: 420, borderWidth: 1, borderColor: colors.border, maxHeight: '82%' },
    modalTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -4 },
    sec: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 0, marginBottom: 6 },
    hint: { color: colors.textMuted, fontSize: 12, marginBottom: 8, fontStyle: 'italic' },
    input: { backgroundColor: colors.inputBackground, color: colors.inputText, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.inputBorder, marginBottom: 8 },
    labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
    chipOn: { backgroundColor: colors.accent, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
    chipText: { color: colors.textSecondary, fontSize: 14 },
    chipTextOn: { color: '#FFF', fontWeight: '600' },
    stateZipRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'stretch' },
    statePicker: { flex: 3, backgroundColor: colors.inputBackground, borderRadius: 8, borderWidth: 1, borderColor: colors.inputBorder, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12 },
    stateText: { color: colors.inputText, fontSize: 15, fontWeight: '600' },
    statePlaceholder: { color: colors.inputPlaceholder, fontSize: 15 },
    layoutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 6 },
    modalBtns: { flexDirection: 'row', marginTop: 12, gap: 8 },
    modalBtn: { flex: 1, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
    modalBtnCancel: { backgroundColor: colors.surfaceAlt },
    modalBtnSave: { backgroundColor: colors.accent },
    modalBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    stateOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    stateSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36, maxHeight: '60%' },
    stateTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
    stateOpt: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, marginBottom: 2 },
    stateOptOn: { backgroundColor: colors.accent },
    stateOptText: { color: colors.textSecondary, fontSize: 15 },
    stateOptTextOn: { color: '#FFF', fontWeight: '700' },
    infoModal: { backgroundColor: colors.surface, borderRadius: 12, padding: 24, width: '85%', maxWidth: 380, borderWidth: 1, borderColor: colors.border },
    modalCloseButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    infoText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  });
