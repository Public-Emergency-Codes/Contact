import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions, FlatList, Modal, NativeModules, Pressable,
  StyleSheet, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts/legacy';
import AppText from '../../components/AppText';
import { formatPhoneNumber } from '../../utils/phoneFormat';
import { useTheme } from '../../context/ThemeContext';

const Text = AppText;
const { DirectMms } = NativeModules;

interface ContactItem {
  id: string;
  name: string;
  number: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  threadId: string;
  address: string;
  contactName?: string;
}

const CARD_H = Math.round(Dimensions.get('window').height * 0.65);

export default function AddPeopleModal({
  visible, onClose, address,
}: Props) {
  const { colors } = useTheme();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const loadedOnce = useRef(false);

  const loadContacts = useCallback(async () => {
    setSearch('');
    setLoading(true);
    loadedOnce.current = true;

    // Check if permission already granted (no dialog)
    try {
      const { status, granted } = await Contacts.getPermissionsAsync();
      if (status !== 'granted' && !granted) {
        // Not yet granted — attempt to request (dialog should show on top of modal)
        const result = await Contacts.requestPermissionsAsync();
        if (result.status !== 'granted' && !result.granted) {
          console.warn('[AddPeopleModal] permission denied');
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('[AddPeopleModal] permission error:', e);
      setLoading(false);
      return;
    }

    // Fetch contacts
    try {
      const result = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });
      console.log('[AddPeopleModal] got contacts:', (result.data || []).length);
      const items: ContactItem[] = (result.data || [])
        .filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0)
        .map((c, i) => ({
          id: c.id || `c-${i}`,
          name: c.name || 'Unknown',
          number: c.phoneNumbers![0].number || '',
        }));
      console.log('[AddPeopleModal] items with phones:', items.length);
      setContacts(items);
    } catch (e) {
      console.warn('[AddPeopleModal] fetch failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleShow = useCallback(() => {
    if (!loadedOnce.current) loadContacts();
  }, [loadContacts]);

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.number.includes(search),
    );
  }, [contacts, search]);

  const handleSelect = useCallback(async (item: ContactItem) => {
    const numbers = [address, item.number];
    if (DirectMms) {
      try {
        await DirectMms.sendGroupMms(numbers, '');
      } catch (e: any) {
        console.warn('[AddPeopleModal] sendGroupMms failed:', e);
      }
    }
    onClose();
  }, [address, onClose]);

  const s = styles(colors);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onShow={handleShow}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* X button */}
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <Text style={[s.title, { color: colors.textPrimary }]}>Add People</Text>

          {/* Search */}
          <View style={[s.searchWrap, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
            <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search contacts..."
              placeholderTextColor={colors.textSecondary}
              style={[s.searchInput, { color: colors.inputText }]}
            />
          </View>

          {/* Contact list */}
          {loading ? (
            <View style={s.center}>
              <Text style={[s.sub, { color: colors.textSecondary }]}>Loading contacts…</Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.list}
              keyboardShouldPersistTaps="handled"
              style={s.listBox}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.contactRow} onPress={() => handleSelect(item)} activeOpacity={0.7}>
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{item.name[0].toUpperCase()}</Text>
                  </View>
                  <View style={s.contactInfo}>
                    <Text style={[s.contactName, { color: colors.textPrimary }]}>{item.name}</Text>
                    <Text style={[s.contactNumber, { color: colors.textSecondary }]}>{formatPhoneNumber(item.number)}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[s.emptyText, { color: colors.textMuted }]}>
                  {search ? 'No contacts match.' : 'No contacts available.'}
                </Text>
              }
            />
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = (c: any) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    card: {
      width: '85%',
      height: CARD_H,
      borderRadius: 18,
      borderWidth: 1,
      paddingTop: 14,
      paddingBottom: 0,
      overflow: 'hidden',
    },
    closeBtn: {
      position: 'absolute',
      top: 8,
      right: 10,
      zIndex: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 14,
      marginBottom: 8,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 36,
      borderWidth: 1,
    },
    searchInput: { flex: 1, fontSize: 14, height: 36 },
    listBox: { flex: 1 },
    list: { paddingBottom: 12 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 40,
    },
    sub: { fontSize: 14 },
    contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    contactInfo: { flex: 1 },
    contactName: { fontSize: 14, fontWeight: '500' },
    contactNumber: { fontSize: 11, marginTop: 1 },
    emptyText: { textAlign: 'center', marginTop: 24 },
  });
