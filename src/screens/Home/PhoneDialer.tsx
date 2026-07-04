import React, { useState, useCallback, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet, Keyboard, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { useTextScale } from '../../context/TextScaleContext';
import { formatPhoneNumber } from '../../utils/phoneFormat';

const Text = AppText;

const DIAL_LETTERS: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
  '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ', '0': '+',
};
const DIAL_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['*', '0', '#']];

interface Contact { id: string; name: string; number: string; }
interface PhoneDialerProps { onCallPress: (number: string) => void; contacts?: Contact[]; onAddContactPress?: (number: string) => void; }

export const PhoneDialer = ({ onCallPress, contacts = [], onAddContactPress }: PhoneDialerProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const { colors } = useTheme();
  const { textScale } = useTextScale();
  const fs = useCallback((size: number) => size * textScale, [textScale]);
  const styles = useMemo(() => makeStyles(colors, fs), [colors, fs]);

  const handlePress = useCallback((digit: string) => {
    setPhoneNumber((prev) => prev + digit);
  }, []);

  const handleLongPress = useCallback((digit: string) => {
    if (digit === '1') {
      Linking.openURL('voicemail:').catch(() => Linking.openURL('tel:*86'));
    } else if (digit === '0') {
      setPhoneNumber((prev) => prev + '+');
    }
  }, []);

  const handleBackspace = useCallback(() => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  }, []);

  const handleCall = useCallback(() => {
    if (phoneNumber.trim()) {
      Keyboard.dismiss();
      onCallPress(phoneNumber);
      setPhoneNumber('');
    }
  }, [phoneNumber, onCallPress]);

  const matched = useMemo(() => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 2) return [];
    return contacts.filter((c) => c.number.replace(/\D/g, '').includes(digits)).slice(0, 3);
  }, [phoneNumber, contacts]);

  return (
    <View style={styles.container}>
      <View style={styles.displayArea}>
        {matched.length > 0 && (
          <View style={styles.resultsOverlay}>
            {matched.map((c) => (
              <TouchableOpacity key={c.id} style={styles.resultRow} onPress={() => setPhoneNumber(c.number)} activeOpacity={0.75}>
                <View style={styles.resultAvatar}>
                  <Text style={styles.resultAvatarText}>{c.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>{c.name}</Text>
                  <Text style={styles.resultNumber}>{formatPhoneNumber(c.number)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View style={styles.displaySection}>
          <Text style={[styles.numberDisplay, { fontSize: fs(phoneNumber.length > 10 ? 26 : 34) }]}>
            {formatPhoneNumber(phoneNumber) || ' '}
          </Text>
        </View>
      </View>

      <View style={styles.dialpadGrid}>
        {DIAL_ROWS.map((row, i) => (
          <View key={i} style={styles.dialpadRow}>
            {row.map((digit) => (
              <TouchableOpacity
                key={digit}
                style={styles.dialButton}
                onPress={() => handlePress(digit)}
                onLongPress={() => handleLongPress(digit)}
                delayLongPress={500}
                activeOpacity={0.7}
              >
                <Text style={[styles.dialButtonText, { fontSize: fs(28) }]}>{digit}</Text>
                {DIAL_LETTERS[digit] ? (
                  <Text style={[styles.dialLetters, { fontSize: fs(9) }]}>{DIAL_LETTERS[digit]}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionButton, { opacity: phoneNumber ? 1 : 0 }]} onPress={handleBackspace} disabled={!phoneNumber} activeOpacity={0.7}>
          <Ionicons name="backspace-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.callButton, !phoneNumber.trim() && styles.callButtonDisabled]} onPress={handleCall} disabled={!phoneNumber.trim()} activeOpacity={0.7}>
          <Ionicons name="call" size={28} color={phoneNumber.trim() ? '#FFF' : colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { opacity: phoneNumber ? 1 : 0 }]}
          onPress={() => onAddContactPress?.(phoneNumber)}
          disabled={!phoneNumber}
          activeOpacity={0.7}
        >
          <Ionicons name="person-add-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const makeStyles = (colors: any, _fs: (size: number) => number) =>
  StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 18, justifyContent: 'flex-end', paddingBottom: 80 },
    displayArea: { position: 'relative', minHeight: 60 },
    resultsOverlay: { borderRadius: 12, overflow: 'hidden', marginBottom: 4, borderWidth: 1, borderColor: colors.border },
    resultRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, gap: 10 },
    resultAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    resultAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    resultName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
    resultNumber: { color: colors.textSecondary, fontSize: 12 },
    displaySection: { minHeight: 60, justifyContent: 'center', alignItems: 'center', paddingVertical: 24, marginBottom: 2 },
    numberDisplay: { color: '#F5F5F5', fontWeight: '300', letterSpacing: 2, textAlign: 'center' },
    dialpadGrid: { marginBottom: 8 },
    dialpadRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 10 },
    dialButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#1c1c1c', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
    dialButtonText: { color: '#ffffff', fontWeight: '600', lineHeight: 32 },
    dialLetters: { color: 'rgba(255,255,255,0.45)', fontWeight: '600', letterSpacing: 1.5, marginTop: -2 },
    actionsRow: { flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 12, marginTop: 4 },
    actionButton: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', elevation: 3 },
    callButton: { backgroundColor: '#2aa865' },
    callButtonDisabled: { backgroundColor: '#1c1c1c', opacity: 0.5 },
  });
