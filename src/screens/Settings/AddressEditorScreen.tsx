import React, { useState, useMemo } from 'react';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Modal, Switch,
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
import AppTextInput from '../../components/AppTextInput';
const Text = AppText;
const TextInput = AppTextInput;
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { addAddress, updateAddress, SavedAddress, AddressLayoutInfo } from '../../store/slices/savedAddressesSlice';
import AddressLayoutForm from './AddressLayoutForm';
import { useTheme } from '../../context/ThemeContext';
import { US_STATES } from '../../constants/usStates';

const LABEL_PRESETS = ['Home', 'Work', 'School', 'Other'];

const DEFAULT_LAYOUT: AddressLayoutInfo = {
  buildingType: 'unsure', totalFloors: '', hasElevator: 'unsure', hasGate: 'unsure',
  gateCode: '', parkingLocation: 'unsure', nearestCrossStreet: '', entranceSide: 'unsure',
  hasStairs: 'unsure', additionalInfo: '',
};

function parseExistingAddress(addr: string) {
  const parts = addr.split(', ');
  if (parts.length >= 3) {
    return { street: parts.slice(0, -2).join(', '), city: parts[parts.length - 2], state: parts[parts.length - 1] };
  }
  return { street: addr, city: '', state: '' };
}
export default function AddressEditorScreen({ navigation, route }: any) {
  const dispatch = useAppDispatch();
  const addressId = route?.params?.addressId;
  const existing = useAppSelector((s) =>
    s.savedAddresses.addresses.find((a) => a.id === addressId),
  );
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);

  const parsed = useMemo(() => parseExistingAddress(existing?.address || ''), [existing?.address]);
  const [label, setLabel] = useState(existing?.label || '');
  const [customLabel, setCustomLabel] = useState(
    existing && !LABEL_PRESETS.includes(existing.label) ? existing.label : '',
  );
  const [street, setStreet] = useState(parsed.street);
  const [apt, setApt] = useState('');
  const [city, setCity] = useState(parsed.city);
  const [selectedState, setSelectedState] = useState(parsed.state);
  const [statePickerVisible, setStatePickerVisible] = useState(false);
  const [zip, setZip] = useState('');
  const [layoutExpanded, setLayoutExpanded] = useState(false);
  const [layout, setLayout] = useState<AddressLayoutInfo>(existing?.layout || { ...DEFAULT_LAYOUT });

  const resolvedLabel = label === 'Other' ? customLabel : label;

  const handleSave = () => {
    if (!resolvedLabel.trim()) return Alert.alert('Missing', 'Please choose a label.');
    if (!street.trim()) return Alert.alert('Missing', 'Please enter a street address.');
    if (!city.trim()) return Alert.alert('Missing', 'Please enter a city.');
    if (!selectedState) return Alert.alert('Missing', 'Please select a state.');
    const aptSuffix = apt.trim() ? `, ${apt.trim()}` : '';
    const zipSuffix = zip.trim() ? ` ${zip.trim()}` : '';
    const combinedAddress = `${street.trim()}${aptSuffix}, ${city.trim()}, ${selectedState}${zipSuffix}`;
    const now = new Date().toISOString();
    const saved: SavedAddress = {
      id: existing?.id || `addr_${Date.now()}`,
      label: resolvedLabel.trim(),
      address: combinedAddress,
      accessInstructions: '',
      layout, includeInSms: true,
      createdAt: existing?.createdAt || now, updatedAt: now,
    };
    dispatch(existing ? updateAddress(saved) : addAddress(saved));
    navigation.goBack();
  };

  return (
    <SafeAreaView style={s.container} edges={['bottom', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backButton} onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 30, lineHeight: 30, color: colors.textPrimary }}>{'\u2039'}</Text>
        </TouchableOpacity>
        <Text style={s.title}>{existing ? 'Edit Address' : 'Add Address'}</Text>
        <View style={s.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.sectionTitle}>Label</Text>
        <View style={s.labelRow}>
          {LABEL_PRESETS.map((l) => (
            <TouchableOpacity key={l} style={[s.chip, label === l && s.chipActive]} onPress={() => setLabel(l)}>
              <Text style={[s.chipText, label === l && s.chipTextActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {label === 'Other' && (
          <TextInput style={s.input} placeholder="Custom label..."
            placeholderTextColor={colors.inputPlaceholder} value={customLabel} onChangeText={setCustomLabel} />
        )}

        {/* Address */}
        <Text style={s.sectionTitle}>Address</Text>
        <TextInput style={s.input} placeholder="123 Main St"
          placeholderTextColor={colors.inputPlaceholder} value={street} onChangeText={setStreet} />
        <TextInput style={s.input} placeholder="Apt, Suite, Unit, Building, Floor, etc."
          placeholderTextColor={colors.inputPlaceholder} value={apt} onChangeText={setApt} />
        <TextInput style={s.input} placeholder="City"
          placeholderTextColor={colors.inputPlaceholder} value={city} onChangeText={setCity} />
        <View style={s.stateZipRow}>
          <TouchableOpacity style={s.statePicker} onPress={() => setStatePickerVisible(true)}>
            <Text style={selectedState ? s.stateText : s.statePlaceholder} numberOfLines={1}>
              {selectedState || 'State'}
            </Text>
          </TouchableOpacity>
          <View style={{ width: 8 }} />
          <TextInput style={[s.input, s.zipInput]} placeholder="Zip"
            placeholderTextColor={colors.inputPlaceholder} keyboardType="numeric"
            value={zip} onChangeText={setZip} />
        </View>

        {/* Building Layout */}
        <View style={s.sectionHeaderRow}>
          <Text style={[s.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Building Layout</Text>
          <Switch
            value={layoutExpanded}
            onValueChange={setLayoutExpanded}
            trackColor={{ true: colors.accent, false: colors.switchTrackOff }}
            ios_backgroundColor={colors.switchTrackOff}
            thumbColor={layoutExpanded ? colors.accent : colors.switchThumbOff}
          />
        </View>
        {!layoutExpanded ? (
          <Text style={s.hint}>Add building details to help emergency responders navigate to you.</Text>
        ) : (
          <>
            <Text style={s.hint}>Anything left as "Unsure" will NOT be sent to the dispatcher.</Text>
            <AddressLayoutForm layout={layout} onChange={setLayout} />
          </>
        )}

        <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
          <Text style={s.saveText}>{existing ? 'Save Changes' : 'Save Address'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* State Picker Modal */}
      <Modal visible={statePickerVisible} transparent animationType="slide" onRequestClose={() => setStatePickerVisible(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setStatePickerVisible(false)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Select State</Text>
            <FlatList
              data={US_STATES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.stateOption, selectedState === item && s.stateOptionActive]}
                  onPress={() => { setSelectedState(item); setStatePickerVisible(false); }}
                >
                  <Text style={[s.stateOptionText, selectedState === item && s.stateOptionTextActive]}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors'], topInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: topInset + 8,
      paddingBottom: 12,
      backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.textPrimary, fontSize: 18, fontWeight: 'bold' },
    scroll: { padding: 16, paddingBottom: 60 },
    sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 20, marginBottom: 6 },
    hint: { color: colors.textMuted, fontSize: 12, marginBottom: 8, fontStyle: 'italic' },
    input: {
      backgroundColor: colors.inputBackground, color: colors.inputText, fontSize: 15,
      paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8,
      borderWidth: 1, borderColor: colors.inputBorder, marginBottom: 8,
    },
    labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { color: colors.textSecondary, fontSize: 14 },
    chipTextActive: { color: '#FFF', fontWeight: '600' },
    stateZipRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'stretch' },
    zipInput: { flex: 1, marginBottom: 0 },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 6 },
    statePicker: {
      flex: 3, backgroundColor: colors.inputBackground, borderRadius: 8,
      borderWidth: 1, borderColor: colors.inputBorder, justifyContent: 'center', alignItems: 'center',
      paddingHorizontal: 8, paddingVertical: 12,
    },
    stateText: { color: colors.inputText, fontSize: 15, fontWeight: '600' },
    statePlaceholder: { color: colors.inputPlaceholder, fontSize: 15 },
    saveBtn: { backgroundColor: colors.borderLight, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 28 },
    saveText: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
    headerSpacer: { width: 40, height: 40 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 36, maxHeight: '60%' },
    modalTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
    stateOption: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, marginBottom: 2 },
    stateOptionActive: { backgroundColor: colors.accent },
    stateOptionText: { color: colors.textSecondary, fontSize: 15 },
    stateOptionTextActive: { color: '#FFF', fontWeight: '700' },
  });
