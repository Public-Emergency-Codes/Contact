import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import AppText from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { getProfileMedicalInfoStorageKey, getProfilePhotoStorageKey, PROFILE_MEDICAL_INFO_KEY, PROFILE_PHOTO_KEY, CALL_INIT_SELFIE_ENABLED_KEY, EMERGENCY_INFO_LANGUAGE_KEY, LOCAL_PROFILE_KEY } from '../../constants/profileMedical';
import { DEAF_MUTE_KEY } from '../../constants/accessibility';
import { getUserLanguage, SUPPORTED_LANGUAGES, getLanguage } from '../../services/languageConfig';
import androidMedicalInfoService from '../../services/androidMedicalInfoService';
import makeEditProfileStyles from './editProfileStyles';
import { Field, WheelSelector } from './EditProfileControls';
import ToggleSwitch from '../../components/ToggleSwitch';
import {
  BLOOD_TYPE_OPTIONS, DAY_OPTIONS, HEIGHT_CM_OPTIONS, HEIGHT_FEET_OPTIONS,
  HEIGHT_INCH_OPTIONS, MONTH_OPTIONS, WEIGHT_DECIMAL_OPTIONS, WEIGHT_WHOLE_OPTIONS,
  YEAR_OPTIONS, blankProfile, type EditProfileForm,
} from './editProfileModels';

const Text = AppText;
export default function EditProfileScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeEditProfileStyles(colors, insets.top), [colors, insets.top]);
  const initial = route?.params?.profile || blankProfile;
  const [form, setForm] = useState<EditProfileForm>({ ...blankProfile, ...initial });
  const [infoVisible, setInfoVisible] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [bloodTypePickerVisible, setBloodTypePickerVisible] = useState(false);
  const [weightPickerVisible, setWeightPickerVisible] = useState(false);
  const [heightPickerVisible, setHeightPickerVisible] = useState(false);
  const [dobPickerVisible, setDobPickerVisible] = useState(false);
  const [weightWhole, setWeightWhole] = useState('');
  const [weightDecimal, setWeightDecimal] = useState('0');
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('lb');
  const [heightFeet, setHeightFeet] = useState('5');
  const [heightInches, setHeightInches] = useState('6');
  const [heightCm, setHeightCm] = useState('170');
  const [heightUnit, setHeightUnit] = useState<'ftin' | 'cm'>('ftin');
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const latestFormRef = useRef<EditProfileForm>({ ...blankProfile, ...initial });

  useEffect(() => {
    latestFormRef.current = form;
  }, [form]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [localRaw, medicalRaw, deafMuteRaw, callSelfieRaw, emergencyLangRaw, globalLang] = await Promise.all([
          AsyncStorage.getItem(LOCAL_PROFILE_KEY),
          AsyncStorage.getItem(getProfileMedicalInfoStorageKey()),
          AsyncStorage.getItem(DEAF_MUTE_KEY),
          AsyncStorage.getItem(CALL_INIT_SELFIE_ENABLED_KEY),
          AsyncStorage.getItem(EMERGENCY_INFO_LANGUAGE_KEY),
          getUserLanguage(),
        ]);
        if (!mounted) return;
        const localProfile = localRaw ? JSON.parse(localRaw) : {};
        const medicalProfile = medicalRaw ? JSON.parse(medicalRaw) : {};
        setForm({
          ...blankProfile,
          ...initial,
          ...localProfile,
          weight: String(medicalProfile?.weight || ''),
          height: String(medicalProfile?.height || ''),
          dateOfBirth: String(medicalProfile?.dateOfBirth || ''),
          bloodType: BLOOD_TYPE_OPTIONS.includes(String(medicalProfile?.bloodType || '') as any)
            ? String(medicalProfile?.bloodType || '')
            : 'Unknown',
          organDonor: !!medicalProfile?.organDonor,
          medicalConditions: String(medicalProfile?.medicalConditions || ''),
          allergies: String(medicalProfile?.allergies || ''),
          medications: String(medicalProfile?.medications || ''),
          address: String(medicalProfile?.address || ''),
          psapNotes: String(medicalProfile?.psapNotes || ''),
          isDeafOrMute: deafMuteRaw === 'true',
          callInitSelfie: callSelfieRaw === 'true',
          emergencyLanguage: emergencyLangRaw || globalLang || 'en',
        });
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [initial]);

  const setField = (key: keyof EditProfileForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openWeightPicker = () => {
    const match = form.weight.match(/^(\d+)(?:\.(\d))?\s*(lb|kg)?$/i);
    if (match) {
      setWeightWhole(match[1]);
      setWeightDecimal(match[2] || '0');
      setWeightUnit((match[3]?.toLowerCase() as 'lb' | 'kg') || 'lb');
    } else {
      setWeightWhole('143');
      setWeightDecimal('0');
      setWeightUnit('lb');
    }
    setWeightPickerVisible(true);
  };

  const openHeightPicker = () => {
    const ftInMatch = form.height.match(/^(\d+)\s*'\s*(\d+)\s*"?$/);
    const cmMatch = form.height.match(/^(\d+)\s*cm$/i);
    if (ftInMatch) {
      setHeightUnit('ftin');
      setHeightFeet(ftInMatch[1]);
      setHeightInches(ftInMatch[2]);
    } else if (cmMatch) {
      setHeightUnit('cm');
      setHeightCm(cmMatch[1]);
    }
    setHeightPickerVisible(true);
  };

  const openDobPicker = () => {
    const match = form.dateOfBirth.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      setDobMonth(match[1]);
      setDobDay(match[2]);
      setDobYear(match[3]);
    } else {
      setDobMonth('1');
      setDobDay('1');
      setDobYear(String(new Date().getFullYear() - 30));
    }
    setDobPickerVisible(true);
  };

  const openPhotoPicker = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setField('photoUri', result.assets[0].uri);
      }
    } catch {}
  };

  const persistProfile = useCallback(async (currentForm: EditProfileForm) => {
    const normalized: EditProfileForm = {
      firstName: currentForm.firstName.trim(),
      lastName: currentForm.lastName.trim(),
      photoUri: currentForm.photoUri.trim(),
      weight: currentForm.weight.trim(),
      height: currentForm.height.trim(),
      dateOfBirth: currentForm.dateOfBirth.trim(),
      bloodType: currentForm.bloodType.trim(),
      organDonor: !!currentForm.organDonor,
      medicalConditions: currentForm.medicalConditions.trim(),
      allergies: currentForm.allergies.trim(),
      medications: currentForm.medications.trim(),
      address: currentForm.address.trim(),
      psapNotes: currentForm.psapNotes.trim(),
      isDeafOrMute: !!currentForm.isDeafOrMute,
      callInitSelfie: !!currentForm.callInitSelfie,
      emergencyLanguage: currentForm.emergencyLanguage || 'en',
    };

    try {
      await AsyncStorage.multiSet([
        [LOCAL_PROFILE_KEY, JSON.stringify({
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          photoUri: normalized.photoUri,
        })],
        [getProfileMedicalInfoStorageKey(), JSON.stringify({
          weight: normalized.weight,
          height: normalized.height,
          dateOfBirth: normalized.dateOfBirth,
          bloodType: normalized.bloodType,
          organDonor: normalized.organDonor,
          medicalConditions: normalized.medicalConditions,
          allergies: normalized.allergies,
          medications: normalized.medications,
          address: normalized.address,
          psapNotes: normalized.psapNotes,
        })],
        [PROFILE_MEDICAL_INFO_KEY, JSON.stringify({
          weight: normalized.weight,
          height: normalized.height,
          dateOfBirth: normalized.dateOfBirth,
          bloodType: normalized.bloodType,
          organDonor: normalized.organDonor,
          medicalConditions: normalized.medicalConditions,
          allergies: normalized.allergies,
          medications: normalized.medications,
          address: normalized.address,
          psapNotes: normalized.psapNotes,
        })],
        // Also store photo under the key the identity photos system reads from
        [getProfilePhotoStorageKey(), normalized.photoUri],
        [PROFILE_PHOTO_KEY, normalized.photoUri],
        [DEAF_MUTE_KEY, String(currentForm.isDeafOrMute)],
        [CALL_INIT_SELFIE_ENABLED_KEY, String(currentForm.callInitSelfie)],
        [EMERGENCY_INFO_LANGUAGE_KEY, currentForm.emergencyLanguage],
      ]);

      if (await androidMedicalInfoService.hasPermission()) {
        await androidMedicalInfoService.sync({
          bloodType: normalized.bloodType,
          organDonor: normalized.organDonor,
          medicalConditions: normalized.medicalConditions,
          allergies: normalized.allergies,
          medications: normalized.medications,
          address: normalized.address,
          notes: normalized.psapNotes,
          weight: normalized.weight,
          height: normalized.height,
          dateOfBirth: normalized.dateOfBirth,
        });
      }
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        persistProfile(latestFormRef.current).catch(() => {});
      };
    }, [persistProfile])
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backGlyph}>{'\u2039'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Info</Text>
        <TouchableOpacity style={styles.infoButton} onPress={() => setInfoVisible(true)}>
          <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <View style={styles.photoSection}>
            <TouchableOpacity style={styles.photoCircle} onPress={openPhotoPicker}>
              {form.photoUri ? (
                <Image source={{ uri: form.photoUri }} style={styles.photoImage} />
              ) : (
                <Text style={styles.photoAddText}>+</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.photoExplain}>Your photo helps emergency responders identify you. It will be sent via SMS when you start an emergency.</Text>
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              <Text style={styles.toggleRowLabel}>Call Start Selfie</Text>
              <Text style={styles.toggleRowDesc}>Takes a front-facing selfie when you make an emergency call and sends it to dispatch alongside your saved profile photo.</Text>
            </View>
            <ToggleSwitch value={form.callInitSelfie} onValueChange={(v) => setField('callInitSelfie', v)} />
          </View>
        </View>

        <View style={[styles.section, styles.sectionFirst]}>
          <Field label="First Name" value={form.firstName} onChangeText={(value) => setField('firstName', value)} placeholder="First name" colors={colors} styles={styles} />
          <Field label="Last Name" value={form.lastName} onChangeText={(value) => setField('lastName', value)} placeholder="Last name" colors={colors} styles={styles} />
        </View>

        <View style={styles.section}>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Weight</Text>
            <TouchableOpacity style={styles.selectorInput} onPress={openWeightPicker}>
              <Text style={styles.selectorInputText}>{form.weight || 'Tap to set weight'}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Height</Text>
            <TouchableOpacity style={styles.selectorInput} onPress={openHeightPicker}>
              <Text style={styles.selectorInputText}>{form.height || 'Tap to set height'}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity style={styles.selectorInput} onPress={openDobPicker}>
              <Text style={styles.selectorInputText}>{form.dateOfBirth || 'Tap to set date of birth'}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Blood Type</Text>
            <TouchableOpacity style={styles.selectorInput} onPress={() => setBloodTypePickerVisible(true)}>
              <Text style={styles.selectorInputText}>{form.bloodType || 'Unknown'}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.fieldBlock}>
            <View style={styles.toggleLine}>
              <Text style={[styles.label, styles.toggleLabel]}>Organ Donor</Text>
              <View style={styles.segmentToggle}>
                <TouchableOpacity
                  style={[styles.segmentToggleButton, form.organDonor && styles.segmentToggleButtonActive]}
                  onPress={() => setField('organDonor', true)}
                >
                  <Text style={[styles.segmentToggleText, form.organDonor && styles.segmentToggleTextActive]}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentToggleButton, !form.organDonor && styles.segmentToggleButtonActive]}
                  onPress={() => setField('organDonor', false)}
                >
                  <Text style={[styles.segmentToggleText, !form.organDonor && styles.segmentToggleTextActive]}>No</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.fieldBlock}>
            <View style={styles.toggleLine}>
              <Text style={[styles.label, styles.toggleLabel]}>Deaf or Mute</Text>
              <View style={styles.segmentToggle}>
                <TouchableOpacity
                  style={[styles.segmentToggleButton, form.isDeafOrMute && styles.segmentToggleButtonActive]}
                  onPress={() => setField('isDeafOrMute', true)}
                >
                  <Text style={[styles.segmentToggleText, form.isDeafOrMute && styles.segmentToggleTextActive]}>Yes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentToggleButton, !form.isDeafOrMute && styles.segmentToggleButtonActive]}
                  onPress={() => setField('isDeafOrMute', false)}
                >
                  <Text style={[styles.segmentToggleText, !form.isDeafOrMute && styles.segmentToggleTextActive]}>No</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Field label="Medical Conditions" value={form.medicalConditions} onChangeText={(value) => setField('medicalConditions', value)} placeholder="Conditions responders should know" multiline colors={colors} styles={styles} />
        </View>

        <View style={styles.section}>
          <Field label="Allergies" value={form.allergies} onChangeText={(value) => setField('allergies', value)} placeholder="Drug, food, or environmental allergies" multiline colors={colors} styles={styles} />
        </View>

        <View style={styles.section}>
          <Field label="Medications" value={form.medications} onChangeText={(value) => setField('medications', value)} placeholder="Current medications" multiline colors={colors} styles={styles} />
        </View>

        <View style={styles.section}>
          <Field label="Address" value={form.address} onChangeText={(value) => setField('address', value)} placeholder="Home or current address" multiline colors={colors} styles={styles} />
        </View>

        <View style={styles.section}>
          <Field label="Medical Notes" value={form.psapNotes} onChangeText={(value) => setField('psapNotes', value)} placeholder="Enter other important info" multiline colors={colors} styles={styles} />
        </View>

        <View style={styles.section}>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Preferred Language</Text>
            <Text style={[styles.label, { fontSize: 12, marginBottom: 8, color: colors.textMuted }]}>
              Used when contacting dispatch — does not affect app language.
            </Text>
            <TouchableOpacity style={styles.selectorInput} onPress={() => setLangModalVisible(true)}>
              <Text style={styles.selectorInputText}>
                {getLanguage(form.emergencyLanguage)?.name ?? 'English'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.hint}>Changes save automatically when you leave this screen.</Text>
      </ScrollView>

      <Modal visible={infoVisible} transparent animationType="fade" onRequestClose={() => setInfoVisible(false)}>
        <Pressable style={styles.modalOverlay}>
          <Pressable style={styles.infoModal} onPress={(event) => event.stopPropagation()}>
            <TouchableOpacity style={styles.infoClose} onPress={() => setInfoVisible(false)}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.infoText}>
              Your emergency info stays on your phone until you start an emergency.
              {'\n\n'}
              When you start an emergency, this information is sent as an SMS to the emergency phone operator.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={langModalVisible} transparent animationType="fade" onRequestClose={() => setLangModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setLangModalVisible(false)}>
          <Pressable style={[styles.infoModal, { maxHeight: '75%', paddingBottom: 8 }]} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={styles.infoClose} onPress={() => setLangModalVisible(false)}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.pickerTitle, { marginBottom: 12 }]}>Preferred Language</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {SUPPORTED_LANGUAGES.map((lang) => {
                const selected = lang.code === form.emergencyLanguage;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.pickerOption, { marginBottom: 6 }, selected && styles.pickerOptionActive]}
                    onPress={() => { setField('emergencyLanguage', lang.code); setLangModalVisible(false); }}
                  >
                    <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextActive]}>
                      {lang.name}
                    </Text>
                    <Text style={[styles.label, { marginBottom: 0, fontSize: 12 }, selected && { color: 'rgba(255,255,255,0.75)' }]}>
                      {lang.nativeName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={bloodTypePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBloodTypePickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBloodTypePickerVisible(false)}>
          <Pressable style={styles.infoModal} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.pickerTitle}>Select Blood Type</Text>
            <View style={styles.pickerList}>
              {BLOOD_TYPE_OPTIONS.map((option) => {
                const selected = form.bloodType === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.pickerOption, selected && styles.pickerOptionActive]}
                    onPress={() => {
                      setField('bloodType', option);
                      setBloodTypePickerVisible(false);
                    }}
                  >
                    <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextActive]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={weightPickerVisible} transparent animationType="slide" onRequestClose={() => setWeightPickerVisible(false)}>
        <View style={styles.modalOverlayBottom}>
          <Pressable style={styles.modalBackdrop} onPress={() => setWeightPickerVisible(false)} />
          <View style={styles.bottomSheet}>
            <Text style={styles.pickerTitle}>Set weight</Text>
            <View style={styles.wheelRow}>
              <WheelSelector values={WEIGHT_WHOLE_OPTIONS} selectedValue={weightWhole} onChange={setWeightWhole} styles={styles} width={92} />
              <Text style={styles.inlineDot}>.</Text>
              <WheelSelector values={WEIGHT_DECIMAL_OPTIONS} selectedValue={weightDecimal} onChange={setWeightDecimal} styles={styles} width={70} />
            </View>
            <View style={styles.unitToggleRow}>
              <View style={styles.segmentToggle}>
                <TouchableOpacity
                  style={[styles.segmentToggleButton, weightUnit === 'lb' && styles.segmentToggleButtonActive]}
                  onPress={() => setWeightUnit('lb')}
                >
                  <Text style={[styles.segmentToggleText, weightUnit === 'lb' && styles.segmentToggleTextActive]}>lb</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentToggleButton, weightUnit === 'kg' && styles.segmentToggleButtonActive]}
                  onPress={() => setWeightUnit('kg')}
                >
                  <Text style={[styles.segmentToggleText, weightUnit === 'kg' && styles.segmentToggleTextActive]}>kg</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetActionBtn} onPress={() => setWeightPickerVisible(false)}><Text style={styles.sheetActionText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetActionBtn}
                onPress={() => {
                  const whole = (weightWhole || '').trim();
                  setField('weight', whole ? `${whole}.${weightDecimal || '0'} ${weightUnit}` : '');
                  setWeightPickerVisible(false);
                }}
              >
                <Text style={styles.sheetActionText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={heightPickerVisible} transparent animationType="slide" onRequestClose={() => setHeightPickerVisible(false)}>
        <View style={styles.modalOverlayBottom}>
          <Pressable style={styles.modalBackdrop} onPress={() => setHeightPickerVisible(false)} />
          <View style={styles.bottomSheet}>
            <Text style={styles.pickerTitle}>Set height</Text>
            <View style={styles.unitToggleRow}>
              <View style={styles.segmentToggle}>
                <TouchableOpacity
                  style={[styles.segmentToggleButton, heightUnit === 'ftin' && styles.segmentToggleButtonActive]}
                  onPress={() => setHeightUnit('ftin')}
                >
                  <Text style={[styles.segmentToggleText, heightUnit === 'ftin' && styles.segmentToggleTextActive]}>ft,in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentToggleButton, heightUnit === 'cm' && styles.segmentToggleButtonActive]}
                  onPress={() => setHeightUnit('cm')}
                >
                  <Text style={[styles.segmentToggleText, heightUnit === 'cm' && styles.segmentToggleTextActive]}>cm</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.wheelRow}>
              {heightUnit === 'ftin' ? (
                <>
                  <WheelSelector values={HEIGHT_FEET_OPTIONS} selectedValue={heightFeet} onChange={setHeightFeet} styles={styles} width={80} />
                  <Text style={styles.inlineUnit}>ft</Text>
                  <WheelSelector values={HEIGHT_INCH_OPTIONS} selectedValue={heightInches} onChange={setHeightInches} styles={styles} width={80} />
                  <Text style={styles.inlineUnit}>in</Text>
                </>
              ) : (
                <>
                  <WheelSelector values={HEIGHT_CM_OPTIONS} selectedValue={heightCm} onChange={setHeightCm} styles={styles} width={110} />
                  <Text style={styles.inlineUnit}>cm</Text>
                </>
              )}
            </View>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetActionBtn} onPress={() => setHeightPickerVisible(false)}><Text style={styles.sheetActionText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetActionBtn}
                onPress={() => {
                  if (heightUnit === 'cm') {
                    const cm = (heightCm || '').trim();
                    setField('height', cm ? `${cm} cm` : '');
                  } else {
                    const ft = (heightFeet || '').trim();
                    const inch = (heightInches || '').trim();
                    setField('height', ft ? `${ft}'${inch || '0'}"` : '');
                  }
                  setHeightPickerVisible(false);
                }}
              >
                <Text style={styles.sheetActionText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={dobPickerVisible} transparent animationType="slide" onRequestClose={() => setDobPickerVisible(false)}>
        <View style={styles.modalOverlayBottom}>
          <Pressable style={styles.modalBackdrop} onPress={() => setDobPickerVisible(false)} />
          <View style={styles.bottomSheet}>
            <Text style={styles.pickerTitle}>Set date of birth</Text>
            <View style={styles.wheelRow}>
              <WheelSelector values={MONTH_OPTIONS} selectedValue={dobMonth} onChange={setDobMonth} styles={styles} width={80} />
              <WheelSelector values={DAY_OPTIONS} selectedValue={dobDay} onChange={setDobDay} styles={styles} width={80} />
              <WheelSelector values={YEAR_OPTIONS} selectedValue={dobYear} onChange={setDobYear} styles={styles} width={110} />
            </View>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetActionBtn} onPress={() => setDobPickerVisible(false)}><Text style={styles.sheetActionText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetActionBtn}
                onPress={() => {
                  if (dobMonth && dobDay && dobYear.length === 4) {
                    const mm = dobMonth.padStart(2, '0');
                    const dd = dobDay.padStart(2, '0');
                    setField('dateOfBirth', `${mm}/${dd}/${dobYear}`);
                  } else {
                    setField('dateOfBirth', '');
                  }
                  setDobPickerVisible(false);
                }}
              >
                <Text style={styles.sheetActionText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
