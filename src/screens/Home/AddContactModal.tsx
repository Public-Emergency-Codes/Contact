import React, { useEffect, useRef, useState } from 'react';
import ToggleSwitch from '../../components/ToggleSwitch';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView,
  Modal, Platform, Pressable, ScrollView,
  StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import * as ImagePicker from 'expo-image-picker';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import ContactAccountPickerSheet from './ContactAccountPickerSheet';
import { localContacts } from '../../services/localContactsService';
import { addContactViaCustomModule } from '../../services/customContactService';
import { formatPhoneInput, formatPhoneNumber, isValidE164, normalizePhoneE164 } from '../../utils/phoneFormat';

const Text = AppText;


interface ExistingContactPrefill { id: string; name: string; number: string; }
interface Props { visible: boolean; onClose: () => void; onSaved: () => void; initialContact?: ExistingContactPrefill | null; helperText?: string; }

const defaultForm = {
  firstName: '', lastName: '', middleName: '',
  phone: '', company: '', jobTitle: '',
  email: '', street: '', city: '', state: '', postalCode: '', country: '',
  birthday: '', website: '', relationship: '', notes: '',
  photoUri: '',
  addAsEmergencyContact: false,
  includeAddressInSms: true,
  isCheckInContact: false,
};

type SectionKey = 'name' | 'work' | 'address';
const PHONE_CONTAINER = [{ id: '__phone__', name: 'Phone', type: 'Local' as Contacts.ContainerType }];

function Section({ icon, label, summary, colors, open, onOpen, children }: {
  icon: string; label: string; summary?: string; colors: any;
  open: boolean; onOpen: () => void; children: React.ReactNode;
}) {
  if (!open) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onOpen}
        style={[s.sectionClosed, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
      >
        <Ionicons name={icon as any} size={18} color={colors.inputPlaceholder} style={s.sectionIcon} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[s.sectionLabel, { color: colors.inputPlaceholder }]}>{label}</Text>
          {summary ? (
            <Text style={[s.sectionSummary, { color: colors.inputText }]} numberOfLines={1}>
              &nbsp;&nbsp;{summary}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <View style={[s.sectionOpen, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
      <Ionicons name={icon as any} size={18} color={colors.textSecondary} style={s.sectionIconOpen} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export default function AddContactModal({ visible, onClose, onSaved, initialContact = null, helperText }: Props) {
  const { colors } = useTheme();
  const [form, setForm] = useState(defaultForm);
  const [containers, setContainers] = useState<any[]>(PHONE_CONTAINER);
  const [selectedContainerId, setSelectedContainerId] = useState('__phone__');
  const [showSaveTo, setShowSaveTo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [activeInfoModal, setActiveInfoModal] = useState<null | 'emergency' | 'address' | 'checkin'>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Collapse any open section
  const closeSection = () => setOpenSection(null);

  const pickProfileImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow photo library access to choose a profile image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) setForm(f => ({ ...f, photoUri: result.assets[0].uri }));
  };

  useEffect(() => {
    if (!visible) return;
    const prefilled = (() => {
      if (!initialContact) return defaultForm;
      const nameStr = (initialContact.name || '').trim();
      let firstName = nameStr;
      let lastName = '';
      if (nameStr.includes(' ')) {
        const spaceIdx = nameStr.indexOf(' ');
        firstName = nameStr.slice(0, spaceIdx).trim();
        lastName = nameStr.slice(spaceIdx + 1).trim();
      }
      return { ...defaultForm, firstName, lastName, phone: initialContact.number || '' };
    })();
    setForm(prefilled);
    setOpenSection(null);
    setSaving(false);
    setActiveInfoModal(null);
    setContainers(PHONE_CONTAINER);
    setSelectedContainerId('__phone__');
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
    if (Platform.OS !== 'ios') return;
    (async () => {
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== 'granted') return;
        const result = await Contacts.getContainersAsync({});
        if (result?.length) {
          setContainers(result);
          const def = result.find(c => (c.type as string) === 'CardDAV') ?? result[0];
          setSelectedContainerId(def.id);
        }
      } catch { /* iOS only */ }
    })();
  }, [visible, initialContact]);

  const set = (k: keyof typeof defaultForm) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const ph = colors.inputPlaceholder;
  const inp = [s.input, { color: colors.inputText }];
  const row = [s.row, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }];
  const div = [s.divider, { backgroundColor: colors.border }];
  const selectedName = containers.find(c => c.id === selectedContainerId)?.name ?? 'Phone';

  const handleSave = async () => {
    if (![form.firstName, form.lastName].some(v => v.trim())) {
      Alert.alert('Required', 'Please enter a name.'); return;
    }
    if (!form.phone.trim()) { Alert.alert('Required', 'Please enter a phone number.'); return; }
    const emergencyPhone = normalizePhoneE164(form.phone);
    if (form.addAsEmergencyContact && !isValidE164(emergencyPhone)) {
      Alert.alert('Invalid Number', 'Emergency contacts require a valid phone number (E.164 format).');
      return;
    }
    setSaving(true);
    try {
      const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ') || form.phone.trim();
      const contact: Parameters<typeof Contacts.addContactAsync>[0] = {
        contactType: Contacts.ContactTypes.Person,
        name: fullName,
      };
      if (form.firstName.trim()) contact.firstName = form.firstName.trim();
      if (form.lastName.trim()) contact.lastName = form.lastName.trim();
      if (form.middleName.trim()) contact.middleName = form.middleName.trim();
      const formattedPhone = formatPhoneNumber(form.phone);
      contact.phoneNumbers = [{ number: formattedPhone, label: 'mobile' }];
      if (form.company.trim()) contact.company = form.company.trim();
      if (form.jobTitle.trim()) contact.jobTitle = form.jobTitle.trim();
      if (form.email.trim()) contact.emails = [{ email: form.email.trim(), label: 'home' }];
      if (form.street.trim() || form.city.trim())
        contact.addresses = [{ street: form.street.trim(), city: form.city.trim(), region: form.state.trim(), postalCode: form.postalCode.trim(), country: form.country.trim(), label: 'home' }];
      if (form.website.trim()) contact.urlAddresses = [{ url: form.website.trim(), label: 'homepage' }];
      if (form.relationship.trim()) contact.relationships = [{ name: form.relationship.trim(), label: 'friend' }];
      if (form.notes.trim()) contact.note = form.notes.trim();
      if (form.photoUri) contact.image = { uri: form.photoUri };
      if (initialContact?.id) {
        const existing = await Contacts.getContactByIdAsync(initialContact.id);
        if (!existing) throw new Error('Contact not found.');
        await Contacts.updateContactAsync({ ...existing, ...contact, id: initialContact.id });
      } else {
        // Try custom native module first — it resolves the account correctly.
        // Skip custom module when a photo is attached (it only supports name+phone).
        const customModuleResult = form.photoUri ? false : await addContactViaCustomModule(fullName, formattedPhone);
        if (!customModuleResult) {
          // Fall back to expo-contacts (works on devices without cloud accounts)
          // and then to Intent.ACTION_INSERT as last resort.
          try {
            await Contacts.addContactAsync(contact, selectedContainerId === '__phone__' ? undefined : selectedContainerId);
          } catch (addErr: any) {
            if (addErr?.message?.includes('Cannot add contacts')) {
              const { SmsWriter } = require('react-native').NativeModules;
              if (SmsWriter?.addContact) {
                await SmsWriter.addContact(formattedPhone, fullName);
              } else {
                throw addErr;
              }
            } else {
              throw addErr;
            }
          }
        }
      }
      if (form.addAsEmergencyContact) {
        const fullName = [form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ') || form.firstName.trim() || form.lastName.trim() || form.phone.trim();
        await localContacts.addEmergencyContact({
          contactName: fullName,
          contactPhone: emergencyPhone,
          contactEmail: form.email.trim() || undefined,
          relationship: form.relationship.trim() || undefined,
          priority: 1,
          canViewLiveStream: true,
          notifySms: true,
          contactNotes: form.notes.trim() || undefined,
          includeAddressInSms: form.includeAddressInSms,
          isCheckInContact: form.isCheckInContact,
        });
      }
      onSaved(); onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save contact.');
    } finally { setSaving(false); }
  };

  const handleDelete = () => {
    if (!initialContact?.id) return;
    Alert.alert('Delete Contact', 'Are you sure you want to delete this contact?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await Contacts.removeContactAsync(initialContact.id);
          onSaved(); onClose();
        } catch (e: any) {
          Alert.alert('Error', e?.message || 'Failed to delete contact.');
        }
      }},
    ]);
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => {}}>
        <KeyboardAvoidingView
          style={s.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View style={[s.header, { borderBottomColor: colors.border }]}>
              <TouchableOpacity style={s.headerBtn} onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={[s.title, { color: colors.textPrimary }]}>{initialContact ? 'Edit Contact' : 'New Contact'}</Text>
              <TouchableOpacity style={s.headerBtn} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color="#60a5fa" />
                  : <Text style={s.saveBtn}>Save</Text>}
              </TouchableOpacity>
            </View>


            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.scroll}
            >
              {helperText ? (
                <View style={[s.saveToRow, { borderColor: colors.border }]}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                  <Text style={[s.saveToTxt, { color: colors.textSecondary, flex: 1 }]}>{helperText}</Text>
                </View>
              ) : null}
              {/* Save to — iOS only, Android saves to default account */}
              {Platform.OS === 'ios' && (
                <TouchableOpacity style={[s.saveToRow, { borderColor: colors.border }]} onPress={() => setShowSaveTo(true)}>
                  <Ionicons name="person-circle-outline" size={18} color={colors.textSecondary} />
                  <Text style={[s.saveToTxt, { color: colors.textSecondary }]}>
                    Save to: <Text style={s.saveToVal}>{selectedName}</Text>
                  </Text>
                  <Ionicons name="chevron-down-outline" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              )}

              {/* Profile photo */}
              <TouchableOpacity style={[s.photoRow, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]} onPress={pickProfileImage}>
                <View style={[s.photoAvatarWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                  {form.photoUri ? (
                    <Image source={{ uri: form.photoUri }} style={s.photoAvatarImage} />
                  ) : (
                    <Ionicons name="person" size={20} color={colors.textMuted} />
                  )}
                </View>
                <Text style={[s.photoRowText, { color: colors.textPrimary }]}>
                  {form.photoUri ? 'Change profile photo' : 'Add profile photo'}
                </Text>
              </TouchableOpacity>

              {/* Name — collapsible */}
              <Section icon="person-outline" label="Name" colors={colors}
                open={openSection === 'name'}
                onOpen={() => setOpenSection(p => p === 'name' ? null : 'name')}
                summary={[form.firstName, form.lastName].filter(Boolean).join(' ') || undefined}>
                <TextInput style={inp} value={form.firstName} onChangeText={set('firstName')} placeholder="First name" placeholderTextColor={ph} />
                <View style={div} />
                <TextInput style={inp} value={form.middleName} onChangeText={set('middleName')} placeholder="Middle name" placeholderTextColor={ph} />
                <View style={div} />
                <TextInput style={inp} value={form.lastName} onChangeText={set('lastName')} placeholder="Last name" placeholderTextColor={ph} />
              </Section>

              {/* Phone — collapses sections on focus */}
              <View style={row}>
                <Ionicons name="call-outline" size={18} color={colors.textSecondary} style={s.rowIcon} />
                <TextInput style={[inp, s.rowInput]} value={form.phone} onChangeText={(v) => setForm(f => ({ ...f, phone: formatPhoneInput(v) }))}
                  onFocus={closeSection} placeholder="Phone" placeholderTextColor={ph} keyboardType="phone-pad" />
              </View>

              {/* Work — collapsible */}
              <Section icon="briefcase-outline" label="Work info" colors={colors}
                open={openSection === 'work'}
                onOpen={() => setOpenSection(p => p === 'work' ? null : 'work')}>
                <TextInput style={inp} value={form.company} onChangeText={set('company')} placeholder="Company" placeholderTextColor={ph} />
                <View style={div} />
                <TextInput style={inp} value={form.jobTitle} onChangeText={set('jobTitle')} placeholder="Title" placeholderTextColor={ph} />
              </Section>

              {/* Email — collapses sections on focus */}
              <View style={row}>
                <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={s.rowIcon} />
                <TextInput style={[inp, s.rowInput]} value={form.email} onChangeText={set('email')}
                  onFocus={closeSection} placeholder="Email" placeholderTextColor={ph} keyboardType="email-address" autoCapitalize="none" />
              </View>

              {/* Address — collapsible */}
              <Section icon="location-outline" label="Address" colors={colors}
                open={openSection === 'address'}
                onOpen={() => setOpenSection(p => p === 'address' ? null : 'address')}>
                <TextInput style={inp} value={form.street} onChangeText={set('street')} placeholder="Street" placeholderTextColor={ph} />
                <View style={div} />
                <TextInput style={inp} value={form.city} onChangeText={set('city')} placeholder="City" placeholderTextColor={ph} />
                <View style={div} />
                <TextInput style={inp} value={form.state} onChangeText={set('state')} placeholder="State" placeholderTextColor={ph} />
                <View style={div} />
                <TextInput style={inp} value={form.postalCode} onChangeText={set('postalCode')} placeholder="Zip code" placeholderTextColor={ph} keyboardType="numeric" />
                <View style={div} />
                <TextInput style={inp} value={form.country} onChangeText={set('country')} placeholder="Country" placeholderTextColor={ph} />
              </Section>

              {/* Bottom fields — scroll into view on focus */}
              <View style={row}>
                <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} style={s.rowIcon} />
                <TextInput style={[inp, s.rowInput]} value={form.birthday} onChangeText={set('birthday')}
                  onFocus={closeSection} placeholder="Birthday (MM/DD/YYYY)" placeholderTextColor={ph} />
              </View>

              <View style={row}>
                <Ionicons name="globe-outline" size={18} color={colors.textSecondary} style={s.rowIcon} />
                <TextInput style={[inp, s.rowInput]} value={form.website} onChangeText={set('website')}
                  onFocus={closeSection} placeholder="Website" placeholderTextColor={ph} keyboardType="url" autoCapitalize="none" />
              </View>

              <View style={row}>
                <Ionicons name="people-outline" size={18} color={colors.textSecondary} style={s.rowIcon} />
                <TextInput style={[inp, s.rowInput]} value={form.relationship} onChangeText={set('relationship')}
                  onFocus={closeSection} placeholder="Relationship" placeholderTextColor={ph} />
              </View>

              <View style={row}>
                <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} style={s.rowIcon} />
                <TextInput style={[inp, s.rowInput, s.notes]} value={form.notes} onChangeText={set('notes')}
                  onFocus={closeSection} placeholder="Notes" placeholderTextColor={ph} multiline numberOfLines={3} />
              </View>

              <View style={[s.emergencyGroup, { borderColor: colors.border }]}>
                <View style={s.emergencyTopRow}>
                  <View style={s.toggleLabelWrap}>
                    <TouchableOpacity
                      style={s.infoIconBtn}
                      onPress={() => setActiveInfoModal('emergency')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <Text style={[s.emergencyToggleLabel, { color: colors.textPrimary }]}>Add as emergency contact</Text>
                  </View>
                  <View style={s.toggleControlSlot}>
                    <ToggleSwitch
                      value={form.addAsEmergencyContact}
                      onValueChange={(v) => setForm((f) => ({ ...f, addAsEmergencyContact: v }))}
                    />
                  </View>
                </View>

                {form.addAsEmergencyContact && (
                  <>
                    <View style={s.smsToggleRow}>
                      <View style={s.toggleLabelWrap}>
                        <TouchableOpacity onPress={() => setActiveInfoModal('address')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <Text style={[s.smsToggleLabel, { color: colors.textPrimary }]}>Include address info in SMS</Text>
                      </View>
                      <View style={s.toggleControlSlot}>
                        <ToggleSwitch
                          value={form.includeAddressInSms}
                          onValueChange={(v) => setForm((f) => ({ ...f, includeAddressInSms: v }))}
                        />
                      </View>
                    </View>

                    <View style={[s.smsToggleRow, s.smsToggleRowLast]}>
                      <View style={s.toggleLabelWrap}>
                        <TouchableOpacity onPress={() => setActiveInfoModal('checkin')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <Text style={[s.smsToggleLabel, { color: colors.textPrimary }]}>Check-in contact</Text>
                      </View>
                      <View style={s.toggleControlSlot}>
                        <ToggleSwitch
                          value={form.isCheckInContact}
                          onValueChange={(v) => setForm((f) => ({ ...f, isCheckInContact: v }))}
                        />
                      </View>
                    </View>
                  </>
                )}
              </View>

              {initialContact?.id ? (
                <TouchableOpacity style={[s.deleteBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text style={s.deleteBtnText}>Delete Contact</Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ height: 24 }} />
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <ContactAccountPickerSheet visible={showSaveTo} containers={containers} selectedId={selectedContainerId}
        onSelect={setSelectedContainerId} onClose={() => setShowSaveTo(false)} colors={colors} />

      <Modal visible={activeInfoModal !== null} transparent animationType="fade" onRequestClose={() => setActiveInfoModal(null)}>
        <Pressable style={s.infoModalBackdrop}>
          <Pressable style={[s.infoModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.infoModalHeader}>
              <TouchableOpacity
                style={[s.infoModalCloseIcon, { borderColor: colors.inputBorder }]}
                onPress={() => setActiveInfoModal(null)}
              >
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.infoModalText, { color: colors.textPrimary }]}>
              {activeInfoModal === 'emergency'
                ? 'When enabled, this contact is added to your Emergency Contacts list and can receive emergency alerts from this app.'
                : activeInfoModal === 'address'
                ? 'If you trigger an emergency while at one of your saved addresses, this contact\'s SMS will also include that address\'s access details, like gate codes, building info, and entry instructions.'
                : 'When enabled, this contact will receive an SMS if you miss a check-in.'}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  card: { width: '92%', maxWidth: 420, borderRadius: 12, borderWidth: 1, overflow: 'hidden', maxHeight: '82%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerBtn: { minWidth: 48, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '600' },
  saveBtn: { color: '#60a5fa', fontWeight: '700', fontSize: 16 },
  scroll: { padding: 12, paddingBottom: 24 },
  saveToRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 10, marginBottom: 8 },
  saveToTxt: { flex: 1, fontSize: 14 },
  saveToVal: { color: '#60a5fa', fontWeight: '600' },
  photoRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10 },
  photoAvatarWrap: { width: 42, height: 42, borderRadius: 21, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden' },
  photoAvatarImage: { width: '100%', height: '100%' },
  photoRowText: { fontSize: 15, fontWeight: '600' },
  sectionClosed: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 12 },
  sectionOpen: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 10, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 4 },
  sectionIcon: { marginRight: 10, width: 20 },
  sectionIconOpen: { marginRight: 10, marginTop: 13, width: 20 },
  sectionLabel: { fontSize: 15 },
  sectionSummary: { fontSize: 14, flex: 1, opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, marginBottom: 8, paddingHorizontal: 12 },
  rowIcon: { marginRight: 10, width: 20 },
  rowInput: { flex: 1 },
  input: { fontSize: 15, paddingVertical: 10, minHeight: 40 },
  divider: { height: 1 },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  emergencyGroup: { borderWidth: 1, borderRadius: 10, marginBottom: 8, paddingHorizontal: 12, paddingTop: 10 },
  emergencyTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  toggleLabelWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  toggleControlSlot: { width: 52, alignItems: 'flex-end' },
  infoIconBtn: { marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  emergencyToggleLabel: { fontSize: 15, fontWeight: '600' },
  smsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  smsToggleRowLast: { marginBottom: 10 },
  smsToggleLabel: { flex: 1, marginLeft: 8, fontSize: 14 },
  infoModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  infoModalCard: { width: '100%', maxWidth: 420, borderRadius: 12, borderWidth: 1, padding: 16 },
  infoModalHeader: { alignItems: 'flex-end', marginBottom: 6 },
  infoModalCloseIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  infoModalText: { fontSize: 14, lineHeight: 22 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  deleteBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
});
