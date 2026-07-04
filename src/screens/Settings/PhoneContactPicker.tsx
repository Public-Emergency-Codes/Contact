import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import AppText from '../../components/AppText';
const Text = AppText;
import makeEmergencyContactsStyles from './emergencyContactsStyles';
import { useTheme } from '../../context/ThemeContext';
import { useAppLanguage } from '../../context/AppLanguageContext';
import { translateWithDictionary } from '../../services/uiTranslationService';
import * as Contacts from 'expo-contacts/legacy';
import { formatPhoneNumber } from '../../utils/phoneFormat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (contact: { name: string; phone: string; email: string; imageUri?: string }) => void;
}

export default function PhoneContactPicker({ visible, onSelect }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { languageCode, dictionary } = useAppLanguage();
  const t = useCallback((v: string) => translateWithDictionary(v, languageCode, dictionary), [dictionary, languageCode]);
  const styles = useMemo(() => makeEmergencyContactsStyles(colors, insets.top), [colors, insets.top]);
  const [phoneContacts, setPhoneContacts] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const cachedContacts = useRef<any[]>([]);

  const loadContacts = async () => {
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Image],
      });
      const withPhone = (data || [])
        .filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      if (withPhone.length === 0) {
        setError(t('No contacts with phone numbers found.'));
        setLoaded(true);
        return;
      }
      cachedContacts.current = withPhone;
      setPhoneContacts(withPhone);
      setLoaded(true);
    } catch (err) {
      console.error('Failed to load phone contacts:', err);
      setError(t('Failed to access contacts.'));
      setLoaded(true);
    }
  };

  React.useEffect(() => {
    if (visible) {
      setSearch('');
      setError('');
      if (cachedContacts.current.length > 0) {
        setPhoneContacts(cachedContacts.current);
        setLoaded(true);
      } else {
        setLoaded(false);
        loadContacts();
      }
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View>
      {!loaded ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: 32 }} />
      ) : error ? (
        <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 32 }}>{error}</Text>
      ) : (
        <>
          <TextInput
            style={[styles.input, { marginBottom: 8 }]}
            placeholder={t('Search...')}
            placeholderTextColor={colors.inputPlaceholder}
            value={search}
            onChangeText={setSearch}
          />
          <FlatList
            style={{ maxHeight: 350 }}
            data={phoneContacts.filter(c =>
              !search.trim() ||
              (c.name || '').toLowerCase().includes(search.toLowerCase())
            )}
            keyExtractor={(item, i) => item.id || String(i)}
            ListHeaderComponent={
              <TouchableOpacity
                style={{
                  paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
                  flexDirection: 'row', alignItems: 'center',
                }}
                onPress={() => onSelect({ name: '', phone: '', email: '' })}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>{t('Add New Contact')}</Text>
              </TouchableOpacity>
            }
            renderItem={({ item }) => {
              const phone = item.phoneNumbers?.[0]?.number || '';
              const imageUri = item.image?.uri || undefined;
              return (
                <TouchableOpacity
                  style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => { onSelect({ name: item.name || '', phone, email: item.emails?.[0]?.email || '', imageUri }); }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>{formatPhoneNumber(phone)}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}
    </View>
  );
}
