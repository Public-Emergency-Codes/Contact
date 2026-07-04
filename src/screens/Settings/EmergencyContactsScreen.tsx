import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import ToggleSwitch from '../../components/ToggleSwitch';
import { View, FlatList, TouchableOpacity, Alert, Modal, Pressable, ScrollView, Image, NativeModules } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
import AppTextInput from '../../components/AppTextInput';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts/legacy';
const Text = AppText;
const TextInput = AppTextInput;
import { localContacts } from '../../services/localContactsService';
import { placeContactCall, placeContactVideoCall } from '../../services/contactActionService';
import contactCacheService from '../../services/contactCacheService';
import PhoneContactPicker from './PhoneContactPicker';
import makeEmergencyContactsStyles from './emergencyContactsStyles';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAppLanguage } from '../../context/AppLanguageContext';
import { translateWithDictionary } from '../../services/uiTranslationService';
import { formatPhoneInput, formatPhoneNumber, isValidE164, normalizePhoneE164 } from '../../utils/phoneFormat';

const defaultForm = {
  contactName: '', contactPhone: '', contactEmail: '', relationship: '',
  photoUri: '',
  company: '', jobTitle: '', address: '', birthday: '', website: '',
  priority: 1, canViewLiveStream: true, notifySms: true, contactNotes: '',
  includeAddressInSms: true, isCheckInContact: false,
};
type FormData = typeof defaultForm;
const emptyErrors = { contactName: false, contactPhone: false, contactPhoneInvalid: false };
const CONTACT_IMAGE_MAP_KEY = '@emergency_contact_custom_images_v1';

export default function EmergencyContactsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { languageCode, dictionary } = useAppLanguage();
  const t = useCallback((v: string) => translateWithDictionary(v, languageCode, dictionary), [dictionary, languageCode]);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeEmergencyContactsStyles(colors, insets.top), [colors, insets.top]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [addStep, setAddStep] = useState<'select' | 'new' | 'contact'>('select');
  const [addVisible, setAddVisible] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>(defaultForm);
  const [editForm, setEditForm] = useState<FormData>(defaultForm);

  const [errors, setErrors] = useState(emptyErrors);
  const [editErrors, setEditErrors] = useState(emptyErrors);
  const [infoVisible, setInfoVisible] = useState(false);
  const [activeInfoModal, setActiveInfoModal] = useState<null | 'address' | 'checkin'>(null);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [deviceContactImages, setDeviceContactImages] = useState<Record<string, string>>({});
  const [customImageMap, setCustomImageMap] = useState<Record<string, string>>({});

  const phoneKey = (raw: string) => {
    const digits = (raw || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.length > 10 ? digits.slice(-10) : digits;
  };

  const parseContactNotes = (raw: string) => {
    const lines = (raw || '').split('\n');
    const parsed = { company: '', jobTitle: '', address: '', birthday: '', website: '', contactNotes: '' };
    const baseLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('Company: ')) parsed.company = line.replace('Company: ', '');
      else if (line.startsWith('Job title: ')) parsed.jobTitle = line.replace('Job title: ', '');
      else if (line.startsWith('Address: ')) parsed.address = line.replace('Address: ', '');
      else if (line.startsWith('Birthday: ')) parsed.birthday = line.replace('Birthday: ', '');
      else if (line.startsWith('Website: ')) parsed.website = line.replace('Website: ', '');
      else if (line.trim()) baseLines.push(line);
    }
    parsed.contactNotes = baseLines.join('\n');
    return parsed;
  };

  const getProfileImageForContact = (phone: string, formPhotoUri?: string) => {
    if (formPhotoUri) return formPhotoUri;
    const key = phoneKey(phone);
    if (!key) return '';
    return customImageMap[key] || deviceContactImages[key] || '';
  };

  const loadCustomImages = async () => {
    try {
      const raw = await AsyncStorage.getItem(CONTACT_IMAGE_MAP_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') setCustomImageMap(parsed);
    } catch {
      // Ignore image cache read failures.
    }
  };

  const upsertCustomImage = async (phone: string, uri: string) => {
    const key = phoneKey(phone);
    if (!key || !uri) return;
    const next = { ...customImageMap, [key]: uri };
    setCustomImageMap(next);
    await AsyncStorage.setItem(CONTACT_IMAGE_MAP_KEY, JSON.stringify(next));
  };

  const loadDeviceContactImages = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') return;
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Image],
      });
      const nextMap: Record<string, string> = {};
      for (const c of data || []) {
        const uri = c.image?.uri || '';
        if (!uri || !c.phoneNumbers?.length) continue;
        for (const p of c.phoneNumbers) {
          const key = phoneKey(p.number || '');
          if (key && !nextMap[key]) nextMap[key] = uri;
        }
      }
      setDeviceContactImages(nextMap);
    } catch {
      // Ignore contact image sync failures.
    }
  };

  const pickProfileImage = async (update: (p: Partial<FormData>) => void) => {
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
    if (!result.canceled && result.assets?.[0]?.uri) update({ photoUri: result.assets[0].uri });
  };

  const toDialable = (value: string) => value.replace(/[^\d+*#,;]/g, '');
  const threadIdCacheRef = useRef<Map<string, string>>(new Map());

  const handleCall = async (phone: string) => {
    const dialable = toDialable(phone);
    if (!dialable) { Alert.alert('Cannot start call', 'This contact does not have a valid phone number.'); return; }
    await placeContactCall(dialable);
  };

  const handleVideoCall = async (phone: string) => {
    const dialable = toDialable(phone);
    if (!dialable) { Alert.alert('Cannot start call', 'This contact does not have a valid phone number.'); return; }
    await placeContactVideoCall(dialable);
  };

  const navigateToSmsChat = async (phone: string, contactName?: string) => {
    const dialable = toDialable(phone);
    if (!dialable) { Alert.alert('Cannot open chat', 'This contact does not have a valid phone number.'); return; }
    const cached = threadIdCacheRef.current.get(dialable);
    if (cached) { navigation.navigate('ChatWindow', { threadId: cached, address: dialable, contactName }); return; }
    try {
      const mod = NativeModules.SmsReader;
      if (mod && typeof mod.getThreadIdByAddress === 'function') {
        const threadId = await mod.getThreadIdByAddress(dialable);
        if (threadId) {
          const tid = String(threadId);
          threadIdCacheRef.current.set(dialable, tid);
          navigation.navigate('ChatWindow', { threadId: tid, address: dialable, contactName });
          return;
        }
      }
    } catch (e) { console.warn('[EmergencyContacts] getThreadIdByAddress failed:', e); }
    navigation.navigate('ChatWindow', { threadId: dialable, address: dialable, contactName });
  };

  const composeContactNotes = (form: FormData) => {
    const lines: string[] = [];
    if (form.contactNotes.trim()) lines.push(form.contactNotes.trim());
    if (form.company.trim()) lines.push(`Company: ${form.company.trim()}`);
    if (form.jobTitle.trim()) lines.push(`Job title: ${form.jobTitle.trim()}`);
    if (form.address.trim()) lines.push(`Address: ${form.address.trim()}`);
    if (form.birthday.trim()) lines.push(`Birthday: ${form.birthday.trim()}`);
    if (form.website.trim()) lines.push(`Website: ${form.website.trim()}`);
    return lines.join('\n');
  };

  const validateForm = (form: FormData, setErr: (e: typeof emptyErrors) => void) => {
    const name = form.contactName.trim();
    const phone = normalizePhoneE164(form.contactPhone);
    const phoneInvalid = !!phone && !isValidE164(phone);
    const errs = { contactName: !name, contactPhone: !phone, contactPhoneInvalid: phoneInvalid };
    setErr(errs);
    if (errs.contactName || errs.contactPhone || errs.contactPhoneInvalid) return null;
    return { ...form, contactName: name, contactPhone: phone };
  };

  useEffect(() => {
    loadContacts();
    loadCustomImages();
    loadDeviceContactImages();
  }, []);

  const loadContacts = async () => {
    try {
      const res = await localContacts.getEmergencyContacts();
      const fetched = res.data.contacts || [];
      setContacts(fetched);
      contactCacheService.cacheContacts(fetched);
    } catch {
      const cached = await contactCacheService.getCachedContacts();
      if (cached.length > 0) setContacts(cached);
    }
  };

  const handleAddContact = async () => {
    const validated = validateForm(formData, setErrors);
    if (!validated) return;
    try {
      await localContacts.addEmergencyContact({
        ...validated,
        contactNotes: composeContactNotes(validated),
      });
      if (validated.photoUri) await upsertCustomImage(validated.contactPhone, validated.photoUri);
      await loadContacts();
      setAddVisible(false);
      setFormData(defaultForm);
      setErrors(emptyErrors);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.details || e?.response?.data?.error || 'Failed to add contact');
    }
  };

  const handleEditSave = async () => {
    const validated = validateForm(editForm, setEditErrors);
    if (!validated || !editContact) return;
    try {
      await localContacts.updateEmergencyContact(editContact.id, {
        ...validated,
        contactNotes: composeContactNotes(validated),
      });
      if (validated.photoUri) await upsertCustomImage(validated.contactPhone, validated.photoUri);
      await loadContacts();
      setEditContact(null);
      setEditErrors(emptyErrors);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.details || e?.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = (contactId: string) => {
    Alert.alert('Delete Contact', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await localContacts.deleteEmergencyContact(contactId);
          setEditContact(null);
          await loadContacts();
        } catch { Alert.alert('Error', 'Failed to delete contact'); }
      }},
    ]);
  };

  const openEdit = (item: any) => {
    const parsedNotes = parseContactNotes(item.contact_notes || '');
    setEditForm({
      contactName: item.contact_name || '', contactPhone: item.contact_phone || '',
      contactEmail: item.contact_email || '', relationship: item.relationship || '',
      photoUri: getProfileImageForContact(item.contact_phone || ''),
      company: parsedNotes.company, jobTitle: parsedNotes.jobTitle, address: parsedNotes.address,
      birthday: parsedNotes.birthday, website: parsedNotes.website,
      priority: item.priority || 1, canViewLiveStream: item.can_view_live_stream !== false,
      notifySms: item.notify_sms !== false,
      contactNotes: parsedNotes.contactNotes,
      includeAddressInSms: item.include_address_in_sms !== false,
      isCheckInContact: item.is_check_in_contact === true,
    });
    setEditErrors(emptyErrors);
    setEditContact(item);
  };

  const FormFields = ({ form, update, errs, setErrs }: { form: FormData; update: (p: Partial<FormData>) => void; errs: typeof emptyErrors; setErrs: (e: typeof emptyErrors) => void; }) => (
    <>
      <TouchableOpacity style={styles.photoRow} onPress={() => pickProfileImage(update)}>
        <View style={styles.profileAvatarWrap}>
          {form.photoUri ? (
            <Image source={{ uri: form.photoUri }} style={styles.profileAvatarImage} />
          ) : (
            <Ionicons name="person" size={20} color={colors.textMuted} />
          )}
        </View>
        <Text style={styles.photoRowText}>{form.photoUri ? t('Change profile photo') : t('Add profile photo')}</Text>
      </TouchableOpacity>

      <View style={[styles.formRow, errs.contactName && styles.inputError]}>
        <Ionicons name="person-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={styles.formRowInput}
          placeholder={t('Name *')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.contactName}
          onChangeText={(v) => { update({ contactName: v }); if (errs.contactName && v) setErrs({ ...errs, contactName: false }); }}
        />
      </View>

      <View style={[styles.formRow, (errs.contactPhone || errs.contactPhoneInvalid) && styles.inputError]}>
        <Ionicons name="call-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={styles.formRowInput}
          placeholder={t('Phone Number *')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.contactPhone}
          keyboardType="phone-pad"
          onChangeText={(v) => { update({ contactPhone: formatPhoneInput(v) }); if (errs.contactPhone || errs.contactPhoneInvalid) setErrs({ ...errs, contactPhone: false, contactPhoneInvalid: false }); }}
        />
      </View>

      <View style={styles.formRow}>
        <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={styles.formRowInput}
          placeholder={t('Email (optional)')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.contactEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          onChangeText={(v) => update({ contactEmail: v })}
        />
      </View>

      <View style={styles.formRow}>
        <Ionicons name="briefcase-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={styles.formRowInput}
          placeholder={t('Company')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.company}
          onChangeText={(v) => update({ company: v })}
        />
      </View>

      <View style={styles.formRow}>
        <Ionicons name="briefcase-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={styles.formRowInput}
          placeholder={t('Title')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.jobTitle}
          onChangeText={(v) => update({ jobTitle: v })}
        />
      </View>

      <View style={styles.formRow}>
        <Ionicons name="location-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={styles.formRowInput}
          placeholder={t('Address')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.address}
          onChangeText={(v) => update({ address: v })}
        />
      </View>

      <View style={styles.formRow}>
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={styles.formRowInput}
          placeholder={t('Birthday (MM/DD/YYYY)')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.birthday}
          onChangeText={(v) => update({ birthday: v })}
        />
      </View>

      <View style={styles.formRow}>
        <Ionicons name="globe-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={styles.formRowInput}
          placeholder={t('Website')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.website}
          keyboardType="url"
          autoCapitalize="none"
          onChangeText={(v) => update({ website: v })}
        />
      </View>

      <View style={styles.formRow}>
        <Ionicons name="people-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={styles.formRowInput}
          placeholder={t('Relationship (optional)')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.relationship}
          onChangeText={(v) => update({ relationship: v })}
        />
      </View>

      <View style={[styles.formRow, styles.formNotesRow]}>
        <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} style={styles.formRowIcon} />
        <TextInput
          style={[styles.formRowInput, styles.formNotesInput]}
          placeholder={t('Notes for this contact (optional)')}
          placeholderTextColor={colors.inputPlaceholder}
          value={form.contactNotes}
          onChangeText={(v) => update({ contactNotes: v })}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      <View style={[styles.formToggleGroup, { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground }]}>
        <View style={styles.smsToggleRow}>
          <View style={styles.toggleLabelWrap}>
            <TouchableOpacity onPress={() => setActiveInfoModal('address')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.smsToggleLabel, { marginLeft: 8 }]}>{t('Include address info in SMS')}</Text>
          </View>
          <View style={styles.toggleControlSlot}>
            <ToggleSwitch
              value={form.includeAddressInSms}
              onValueChange={(v) => update({ includeAddressInSms: v })}
            />
          </View>
        </View>

        <View style={[styles.smsToggleRow, styles.smsToggleRowLast]}>
          <View style={styles.toggleLabelWrap}>
            <TouchableOpacity onPress={() => setActiveInfoModal('checkin')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={[styles.smsToggleLabel, { marginLeft: 8 }]}>{t('Check-in contact')}</Text>
          </View>
          <View style={styles.toggleControlSlot}>
            <ToggleSwitch
              value={form.isCheckInContact}
              onValueChange={(v) => update({ isCheckInContact: v })}
            />
          </View>
        </View>
      </View>
    </>
  );

  const renderContact = ({ item }: any) => (
    <View style={styles.contactCard}>
      <TouchableOpacity style={styles.contactHeaderRow} onPress={() => setExpandedContactId((prev) => (prev === item.id ? null : item.id))}>
        <View style={styles.contactAvatarWrap}>
          {getProfileImageForContact(item.contact_phone || '') ? (
            <Image source={{ uri: getProfileImageForContact(item.contact_phone || '') }} style={styles.contactAvatarImage} />
          ) : (
            <Ionicons name="person" size={18} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.contact_name}</Text>
          {item.relationship ? <Text style={styles.contactRelationship}>{item.relationship}</Text> : null}
          {item.contact_email ? <Text style={styles.contactEmail}>{item.contact_email}</Text> : null}
        </View>
        <Ionicons
          name={expandedContactId === item.id ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {expandedContactId === item.id && (() => {
        const notes = parseContactNotes(item.contact_notes || '');
        const details = [
          item.contact_email,
          notes.company,
          notes.jobTitle,
          notes.address,
          notes.birthday,
          notes.website,
          notes.contactNotes,
        ].filter(Boolean);
        return (
          <View style={styles.contactExpandedArea}>
            <Text style={styles.contactPhoneExpanded}>{formatPhoneNumber(item.contact_phone)}</Text>
            {details.length > 0 && details.map((line: string, index: number) => (
              <Text key={`detail-${index}`} style={styles.contactDetailText}>{line}</Text>
            ))}
            <View style={styles.contactActionsRow}>
              <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => handleCall(item.contact_phone || '')}>
                <Ionicons name="call" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => handleVideoCall(item.contact_phone || '')}>
                <Ionicons name="videocam" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => navigateToSmsChat(item.contact_phone || '', item.contact_name)}>
                <Ionicons name="chatbox" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => openEdit(item)}>
                <Ionicons name="pencil" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 30, lineHeight: 30, color: colors.textPrimary }}>{`\u2039`}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('Emergency Contacts')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => setInfoVisible(true)}>
          {contacts.length > 0 && <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />}
        </TouchableOpacity>
      </View>

      <FlatList data={contacts} renderItem={renderContact} keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={contacts.length === 0 ? <View>
          <Text style={styles.desc}>{t("When you activate an emergency call, the app automatically sends an SMS to everyone on this list \u2014 including your name, GPS coordinates, and a Google Maps link so they can see exactly where you are.\n\nYou can add contacts from your phone's contact list or enter them manually. Each contact can be configured to receive SMS notifications and optionally receive your saved address information.")}</Text>
          <Text style={styles.desc}><Text style={{ fontWeight: 'bold' }}>{t('Privacy Notice:')} </Text>{t("Your contacts' information is stored securely and is never shared with third parties. SMS notifications are only sent when you initiate an emergency call.")}</Text>
        </View> : null}
        ListEmptyComponent={null}
      />

      <TouchableOpacity style={styles.floatingButton}
        onPress={() => { setFormData(defaultForm); setAddStep('contact'); setErrors(emptyErrors); setAddVisible(true); }}
      >
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* INFO MODAL */}
      <Modal visible={infoVisible} animationType="fade" transparent onRequestClose={() => setInfoVisible(false)}>
        <Pressable style={styles.modalContainer}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalTitleRow}>
              <View />
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setInfoVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.desc, { color: colors.textPrimary }]}>{t("When you activate an emergency call, the app automatically sends an SMS to everyone on this list \u2014 including your name, GPS coordinates, and a Google Maps link so they can see exactly where you are.\n\nYou can add contacts from your phone's contact list or enter them manually. Each contact can be configured to receive SMS notifications and optionally receive your saved address information.")}</Text>
            <Text style={[styles.desc, { color: colors.textPrimary }]}><Text style={{ fontWeight: 'bold' }}>{t('Privacy Notice:')} </Text>{t("Your contacts' information is stored securely and is never shared with third parties. SMS notifications are only sent when you initiate an emergency call.")}</Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ADD MODAL - contact picker step: closes on backdrop or X */}
      <Modal visible={addVisible && addStep === 'contact'} animationType="slide" transparent onRequestClose={() => { setAddVisible(false); setErrors(emptyErrors); }}>
        <Pressable style={styles.modalContainer} onPress={() => { setAddVisible(false); setErrors(emptyErrors); }}>
          <Pressable style={[styles.modalContent, { maxHeight: '85%', overflow: 'hidden' }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalTitleRow}>
              <View />
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => { setAddVisible(false); setErrors(emptyErrors); }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <PhoneContactPicker visible={true} onClose={() => setAddVisible(false)}
              onSelect={(c) => { setFormData({ ...defaultForm, contactName: c.name, contactPhone: c.phone, contactEmail: c.email, photoUri: c.imageUri || '' }); setAddStep('new'); }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ADD MODAL - new contact form */}
      <Modal visible={addVisible && addStep === 'new'} animationType="slide" transparent onRequestClose={() => {}}>
        <View style={styles.modalContainer}>
          <Pressable style={styles.formCard} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.formHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity style={styles.formHeaderBtn} onPress={() => { setAddVisible(false); setErrors(emptyErrors); }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.formTitle}>{t('New Contact')}</Text>
              <TouchableOpacity style={styles.formHeaderBtn} onPress={handleAddContact}>
                <Text style={styles.formSaveBtn}>{t('Save')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formScroll}>
              <FormFields form={formData} update={(p) => setFormData({ ...formData, ...p })}
                errs={errors} setErrs={setErrors} />
              <View style={{ height: 20 }} />
            </ScrollView>
          </Pressable>
        </View>
      </Modal>

      {/* EDIT MODAL */}
      <Modal visible={!!editContact} animationType="slide" transparent onRequestClose={() => {}}>
        <View style={styles.modalContainer}>
          <Pressable style={styles.formCard} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.formHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity style={styles.formHeaderBtn} onPress={() => { setEditContact(null); setEditErrors(emptyErrors); }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
              <Text style={styles.formTitle}>{t('Edit Contact')}</Text>
              <TouchableOpacity style={styles.formHeaderBtn} onPress={handleEditSave}>
                <Text style={styles.formSaveBtn}>{t('Save')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formScroll}>
              <FormFields form={editForm} update={(p) => setEditForm({ ...editForm, ...p })}
                errs={editErrors} setErrs={setEditErrors} />
              <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} onPress={() => handleDelete(editContact?.id)}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={styles.deleteBtnText}>{t('Delete Contact')}</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </Pressable>
        </View>
      </Modal>

      {/* TOGGLE INFO MODAL */}
      <Modal visible={activeInfoModal !== null} transparent animationType="fade" onRequestClose={() => setActiveInfoModal(null)}>
        <Pressable style={styles.modalContainer}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalTitleRow}>
              <View />
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setActiveInfoModal(null)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.desc, { marginBottom: 16, color: colors.textPrimary }]}>
              {activeInfoModal === 'address'
                ? <Text style={styles.desc}>
                    {t('If you trigger an emergency while at one of your ')}<Text style={{ color: '#3b82f6' }} onPress={() => { setActiveInfoModal(null); navigation.navigate('SavedAddresses'); }}>{t('saved addresses')}</Text>{t(', this contact\'s SMS will also include that address\'s access details — like gate codes, building info, and entry instructions — so they can reach you as quickly as possible.')}
                  </Text>
                : t('When enabled, this contact will receive an SMS if you miss a check-in.')}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
