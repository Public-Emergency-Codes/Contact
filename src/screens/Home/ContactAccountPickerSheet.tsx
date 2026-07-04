import React from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../components/AppText';

const Text = AppText;

const getContainerIcon = (type?: string): string => {
  if ((type as string) === 'CardDAV') return 'logo-google';
  if ((type as string) === 'Exchange') return 'mail-outline';
  return 'phone-portrait-outline';
};

const getContainerLabel = (type?: string): string => {
  if ((type as string) === 'CardDAV') return 'Google';
  if ((type as string) === 'Local') return 'Phone storage';
  if ((type as string) === 'Exchange') return 'Exchange';
  return type || '';
};

interface Props {
  visible: boolean;
  containers: any[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  colors: any;
}

export default function ContactAccountPickerSheet({ visible, containers, selectedId, onSelect, onClose, colors }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ss.bg} onPress={onClose}>
        <Pressable style={[ss.sheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[ss.title, { color: colors.textPrimary }]}>Save contact to</Text>
          {containers.map((c: any) => (
            <TouchableOpacity
              key={c.id}
              style={[ss.row, selectedId === c.id && ss.rowActive]}
              onPress={() => { onSelect(c.id); onClose(); }}>
              <View style={ss.check}>
                {selectedId === c.id && <Ionicons name="checkmark" size={18} color="#60a5fa" />}
              </View>
              <View style={[ss.avatar, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons
                  name={getContainerIcon(c.type) as any}
                  size={20}
                  color={(c.type as string) === 'CardDAV' ? '#4285F4' : colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.name, { color: colors.textPrimary }]}>{c.name || 'Unknown'}</Text>
                {!!c.type && (
                  <Text style={[ss.sub, { color: colors.textSecondary }]}>{getContainerLabel(c.type)}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={ss.cancel} onPress={onClose}>
            <Text style={{ color: colors.textSecondary, fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ss = StyleSheet.create({
  bg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 },
  title: { fontSize: 18, fontWeight: '600', padding: 20, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  rowActive: { backgroundColor: 'rgba(96,165,250,0.12)' },
  check: { width: 24, alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '500' },
  sub: { fontSize: 13, marginTop: 1 },
  cancel: { paddingHorizontal: 20, paddingTop: 12 },
});
