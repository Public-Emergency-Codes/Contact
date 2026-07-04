import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  NativeModules,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
const Text = AppText;
import AsyncStorage from '@react-native-async-storage/async-storage';
import makeSettingsStyles from './settingsStyles';
import LanguagePicker from '../Settings/LanguagePicker';
import { getUserLanguage, saveUserLanguage } from '../../services/languageConfig';
import { useTheme } from '../../context/ThemeContext';
import { useTextScale } from '../../context/TextScaleContext';
import androidMedicalInfoService from '../../services/androidMedicalInfoService';
import { LOCAL_PROFILE_KEY } from '../../constants/profileMedical';
import { useFocusEffect } from '@react-navigation/native';
import * as IntentLauncher from 'expo-intent-launcher';

export const DEV_OVERRIDE_NUMBER_KEY = 'dev_emergency_override_number';

function DevDialer() {
  const [phone, setPhone] = useState('');
  const [savedOverride, setSavedOverride] = useState<string | null>(null);
  const [hasOverlayPerm, setHasOverlayPerm] = useState<boolean | null>(null);

  const checkOverlay = useCallback(() => {
    if (Platform.OS !== 'android') return;
    NativeModules.E911DetectorModule?.checkOverlayPermission?.()
      ?.then?.(setHasOverlayPerm)
      ?.catch?.(() => setHasOverlayPerm(false));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(DEV_OVERRIDE_NUMBER_KEY).then(setSavedOverride);
    checkOverlay();
  }, [checkOverlay]);

  const dial = async () => {
    const number = phone.trim().replace(/\D/g, '');
    if (!number) return;
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.CALL', {
        data: `tel:${number}`,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message || String(e));
    }
  };

  const setOverride = async () => {
    const number = phone.trim().replace(/\D/g, '');
    if (!number) { Alert.alert('Enter a number first'); return; }
    await AsyncStorage.setItem(DEV_OVERRIDE_NUMBER_KEY, number);
    setSavedOverride(number);
    Alert.alert('Override set', `Emergency calls & SMS will go to ${number}`);
  };

  const clearOverride = async () => {
    await AsyncStorage.removeItem(DEV_OVERRIDE_NUMBER_KEY);
    setSavedOverride(null);
  };

  return (
    <View style={{ margin: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)' }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#f59e0b', marginBottom: 4, letterSpacing: 0.5 }}>DEV — TEST DIALER</Text>
      {Platform.OS === 'android' && hasOverlayPerm === false && (
        <TouchableOpacity
          onPress={() => {
            NativeModules.E911DetectorModule?.requestOverlayPermission?.()?.then?.(() => setTimeout(checkOverlay, 1000))?.catch?.(() => {});
          }}
          style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 6, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: '#ef4444' }}>
          <Text style={{ fontSize: 11, color: '#ef4444', fontWeight: '700' }}>⚠️ Grant "Draw over apps" permission for auto-return after call</Text>
        </TouchableOpacity>
      )}
      {Platform.OS === 'android' && hasOverlayPerm === true && (
        <Text style={{ fontSize: 10, color: 'rgba(34,197,94,0.8)', marginBottom: 6 }}>✓ Auto-return enabled</Text>
      )}
      {savedOverride ? (
        <Text style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginBottom: 8 }}>Override active: {savedOverride} — emergencies go here</Text>
      ) : (
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>No override — real emergency contacts</Text>
      )}
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Enter phone number"
        keyboardType="phone-pad"
        style={{ borderWidth: 1, borderColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', marginBottom: 10, fontSize: 16 }}
        placeholderTextColor="rgba(255,255,255,0.35)"
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: '#f59e0b', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }} onPress={dial}>
          <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(245,158,11,0.25)', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#f59e0b' }} onPress={setOverride}>
          <Text style={{ color: '#f59e0b', fontWeight: '700', fontSize: 13 }}>Set Override</Text>
        </TouchableOpacity>
        {savedOverride && (
          <TouchableOpacity style={{ borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }} onPress={clearOverride}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontWeight: '700', fontSize: 13 }}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      {savedOverride && (
        <TouchableOpacity
          style={{ marginTop: 8, backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#3b82f6' }}
          onPress={async () => {
            const { NativeModules: NM } = require('react-native');
            const dm = NM.DirectSms;
            if (!dm) { Alert.alert('DirectSms module is NULL — native module not loaded'); return; }
            try {
              const id = await dm.sendSms(savedOverride, '[DEV TEST] Direct SMS from eMessages');
              Alert.alert('SMS sent!', `msgId=${id}\nTo: ${savedOverride}`);
            } catch (e: any) {
              Alert.alert('SMS FAILED', e?.message || String(e));
            }
          }}>
          <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 13 }}>Test SMS → {savedOverride}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function SettingsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { textScale, setTextScale } = useTextScale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeSettingsStyles(colors, insets.top), [colors, insets.top]);
  const [profileName, setProfileName] = useState('Medical Info');
  const [localProfile, setLocalProfile] = useState({ firstName: '', lastName: '', phone: '', email: '', photoUri: '' });
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const languageLoaded = useRef(false);

  useEffect(() => {
    getUserLanguage().then((lang) => {
      if (lang) setPreferredLanguage(lang);
      languageLoaded.current = true;
    });
  }, []);

  const handleLanguageChange = async (code: string) => {
    setPreferredLanguage(code);
    if (languageLoaded.current) {
      await saveUserLanguage(code);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;
      (async () => {
        let hasLocalName = false;
        try {
          const raw = await AsyncStorage.getItem(LOCAL_PROFILE_KEY);
          if (mounted && raw) {
            const parsed = JSON.parse(raw);
            const next = {
              firstName: String(parsed?.firstName || ''),
              lastName: String(parsed?.lastName || ''),
              phone: String(parsed?.phone || ''),
              email: String(parsed?.email || ''),
              photoUri: String(parsed?.photoUri || ''),
            };
            setLocalProfile(next);
            const full = `${next.firstName} ${next.lastName}`.trim();
            if (full) {
              hasLocalName = true;
              setProfileName(full);
            }
          }
        } catch {}

        if (hasLocalName || !mounted) return;

        try {
          const name = await androidMedicalInfoService.getProfileName();
          if (mounted && name?.trim()) setProfileName(name.trim());
        } catch {}
      })();

      return () => {
        mounted = false;
      };
    }, [])
  );

  const renderOptionSection = (
    label: string,
    description: string,
    onPress?: () => void
  ) => (
    <View style={styles.section}>
      <TouchableOpacity style={[styles.menuItem, styles.menuItemSingle]} onPress={onPress}>
        <View style={styles.menuItemTextWrap}>
          <Text style={styles.menuItemText}>{label}</Text>
          <Text style={styles.menuItemDesc}>{description}</Text>
        </View>
        <Text style={styles.menuItemArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSupportPill = (label: string, onPress?: () => void) => (
    <TouchableOpacity style={styles.supportPill} onPress={onPress}>
      <Text style={styles.supportPillText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { position: 'relative' }]} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.identityTapArea}
            onPress={() => navigation.navigate('EditProfile')}
            accessibilityLabel="Open your emergency info"
          >
            <View style={styles.avatar}>
              {localProfile.photoUri ? (
                <Image source={{ uri: localProfile.photoUri }} style={{ width: '100%', height: '100%', borderRadius: 40 }} />
              ) : (
                <Text style={styles.avatarText}>{profileName.slice(0, 2).toUpperCase()}</Text>
              )}
            </View>
            <Text style={styles.name}>{profileName}</Text>
          </TouchableOpacity>
        </View>

        {renderOptionSection(
          'Emergency Info',
          'Update the medical details and preferences used during emergencies.',
          () => navigation.navigate('EditProfile', { profile: localProfile })
        )}

        {renderOptionSection(
          'Emergency Contacts',
          'People who receive SMS alerts when you trigger an emergency.',
          () => navigation.navigate('EmergencyContacts')
        )}

        {renderOptionSection(
          'Saved Addresses',
          'Home, work, or other locations shared with dispatchers during an emergency.',
          () => navigation.navigate('SavedAddresses')
        )}

        {renderOptionSection(
          'App Permissions',
          'Review and grant permissions required for emergency features.',
          () => navigation.navigate('Permissions')
        )}

        {renderOptionSection(
          'View Recordings',
          'Review, keep, or delete emergency recordings and manage your recording retention settings.',
          () => navigation.navigate('Recordings')
        )}

        {renderOptionSection(
          'Check-In Settings',
          'Configure automatic safety check-ins, escalation timing, and who gets notified if you miss one.',
          () => navigation.navigate('CheckInSettings')
        )}

        {/* Preferred Language */}
        <View style={[styles.section, { paddingVertical: 16 }]}>
          <LanguagePicker
            value={preferredLanguage}
            onChange={handleLanguageChange}
          />
        </View>

        {/* Text Size */}
        <View style={styles.section}>
          <View style={{ paddingVertical: 12 }}>
            <Text style={styles.menuItemText}>Text Size</Text>
            <Text style={styles.menuItemDesc}>
              Scales all text across the entire app — {Math.round(textScale * 100)}%
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 12 }}>
              <TouchableOpacity
                onPress={() => setTextScale(Math.max(0.8, textScale - 0.1))}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22, color: colors.textPrimary, lineHeight: 24 }}>−</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary, minWidth: 48, textAlign: 'center' }}>
                {Math.round(textScale * 100)}%
              </Text>
              <TouchableOpacity
                onPress={() => setTextScale(Math.min(2, textScale + 0.1))}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderLight,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 22, color: colors.textPrimary, lineHeight: 24 }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {__DEV__ && <DevDialer />}

        <View style={styles.footerActions}>
          <View style={styles.supportPillRow}>
            {renderSupportPill('Privacy Policy', () => Alert.alert(
              'Privacy Policy',
              'See PRIVACY.md in the project repository.'
            ))}
            {renderSupportPill('Contact Us', () => Alert.alert(
              'Contact Us',
              'Open a GitHub issue for setup help. Do not include personal or emergency information.'
            ))}
            {renderSupportPill('Terms of Service', () => Alert.alert(
              'Terms of Service',
              'See the LICENSE file in the project repository.'
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
