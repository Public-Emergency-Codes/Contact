import React, { useState, useMemo } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Modal,
} from 'react-native';
import AppText from '../../components/AppText';
import AppTextInput from '../../components/AppTextInput';
const Text = AppText; // global text scale
const TextInput = AppTextInput; // global placeholder translation
import LAYOUT_QUESTIONS, { LayoutQuestion } from '../../utils/addressLayoutQuestions';
import type { AddressLayoutInfo } from '../../store/slices/savedAddressesSlice';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  layout: AddressLayoutInfo;
  onChange: (updated: AddressLayoutInfo) => void;
}

export default function AddressLayoutForm({ layout, onChange }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [pickerKey, setPickerKey] = useState<string | null>(null);

  const activeQ = LAYOUT_QUESTIONS.find((q) => q.key === pickerKey);

  const setValue = (key: string, value: string) => {
    onChange({ ...layout, [key]: value });
  };

  const displayValue = (q: LayoutQuestion): string => {
    const val = (layout as any)[q.key] || '';
    if (q.type === 'text') return val || '';
    const opt = q.options.find((o) => o.value === val);
    return opt?.label || 'Unsure';
  };

  // Build rows: 2-per-row except nearestCrossStreet which is always full-width
  const rows: LayoutQuestion[][] = [];
  let pending: LayoutQuestion | null = null;
  for (const q of LAYOUT_QUESTIONS) {
    if (q.key === 'nearestCrossStreet') {
      if (pending) { rows.push([pending]); pending = null; }
      rows.push([q]);
    } else if (pending) {
      rows.push([pending, q]);
      pending = null;
    } else {
      pending = q;
    }
  }
  if (pending) rows.push([pending]);

  const renderField = (q: LayoutQuestion) => (
    q.type === 'text' ? (
      <TextInput
        style={s.textInput}
        placeholder="-"
        placeholderTextColor={colors.inputPlaceholder}
        keyboardType={q.numeric ? 'numeric' : 'default'}
        value={(layout as any)[q.key] || ''}
        onChangeText={(t) => setValue(q.key, t)}
      />
    ) : (
      <TouchableOpacity style={s.dropdown} onPress={() => setPickerKey(q.key)}>
        <Text style={[s.dropdownText, (layout as any)[q.key] === 'unsure' && s.unsureText]} numberOfLines={1}>
          {displayValue(q)}
        </Text>
        <Text style={s.arrow}>{'\u25BE'}</Text>
      </TouchableOpacity>
    )
  );

  return (
    <View>
      {rows.map((rowItems, i) => (
        <View key={i} style={rowItems.length === 2 ? s.pairRow : null}>
          {rowItems.map((q) => (
            <View key={q.key} style={[s.row, rowItems.length === 2 && s.halfCell]}>
              <Text style={s.label}>{q.label}</Text>
              {renderField(q)}
            </View>
          ))}
        </View>
      ))}

      {/* Additional Info */}
      <View style={s.row}>
        <Text style={s.label}>Additional Info</Text>
        <TextInput
          style={[s.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
          placeholder="Anything else responders should know..."
          placeholderTextColor={colors.inputPlaceholder}
          multiline
          value={layout.additionalInfo || ''}
          onChangeText={(t) => onChange({ ...layout, additionalInfo: t })}
        />
      </View>

      {/* Picker modal */}
      <Modal visible={!!pickerKey} transparent animationType="fade"
        onRequestClose={() => setPickerKey(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1}
          onPress={() => setPickerKey(null)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{activeQ?.label}</Text>
            {activeQ?.options.map((opt) => {
              const selected = (layout as any)[activeQ.key] === opt.value;
              return (
                <TouchableOpacity key={opt.value}
                  style={[s.option, selected && s.optionActive]}
                  onPress={() => { setValue(activeQ.key, opt.value); setPickerKey(null); }}>
                  <Text style={[s.optionText, selected && s.optionTextActive]}>
                    {opt.label}
                  </Text>
                  {selected && <Text style={s.check}>{'\u2713'}</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={s.cancelBtn} onPress={() => setPickerKey(null)}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    row: { marginBottom: 10 },
    pairRow: { flexDirection: 'row', gap: 8 },
    halfCell: { flex: 1 },
    label: { color: colors.textSecondary, fontSize: 13, marginBottom: 4, fontWeight: '500' },
    textInput: {
      backgroundColor: colors.inputBackground, color: colors.inputText, fontSize: 14,
      paddingHorizontal: 12, borderRadius: 8,
      borderWidth: 1, borderColor: colors.inputBorder, height: 44,
    },
    dropdown: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: colors.inputBackground, paddingHorizontal: 12,
      borderRadius: 8, borderWidth: 1, borderColor: colors.inputBorder, height: 44,
    },
    dropdownText: { color: colors.textPrimary, fontSize: 14 },
    unsureText: { color: colors.textMuted },
    arrow: { color: colors.textMuted, fontSize: 14 },
    overlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
      padding: 20, paddingBottom: 36,
    },
    sheetTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 16 },
    option: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 14, paddingHorizontal: 12,
      borderRadius: 8, marginBottom: 4,
    },
    optionActive: { backgroundColor: colors.accentBg },
    optionText: { color: colors.textSecondary, fontSize: 15 },
    optionTextActive: { color: colors.textPrimary, fontWeight: '600' },
    check: { color: colors.accent, fontSize: 18, fontWeight: '700' },
    cancelBtn: { marginTop: 12, alignItems: 'center', padding: 12 },
    cancelText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
  });
