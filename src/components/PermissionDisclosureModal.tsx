import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import AppText from './AppText';
import { useTheme } from '../context/ThemeContext';

const Text = AppText;

type Props = { visible: boolean; title: string; body: string; onContinue: () => void; onCancel: () => void };

export default function PermissionDisclosureModal({ visible, title, body, onContinue, onCancel }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={event => event.stopPropagation()}>
          <Text style={styles.eyebrow}>BACKGROUND LOCATION</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <Text style={styles.choice}>You can choose Not now and continue using features that do not require background location.</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onCancel} accessibilityRole="button"><Text style={styles.secondaryText}>Not now</Text></TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={onContinue} accessibilityRole="button"><Text style={styles.primaryText}>Continue</Text></TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.72)' },
  card: { borderRadius: 18, padding: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  eyebrow: { color: '#ef4444', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginBottom: 14 },
  body: { color: colors.textPrimary, fontSize: 16, lineHeight: 24 },
  choice: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 22 },
  secondaryButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.textPrimary, fontWeight: '700' },
  primaryButton: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, backgroundColor: '#dc2626' },
  primaryText: { color: '#fff', fontWeight: '800' },
});
