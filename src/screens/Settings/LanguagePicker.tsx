/**
 * LanguagePicker
 * Settings section component that lets users choose their preferred language.
 * Non-English languages trigger automatic translation during E911 calls so
 * users can speak/type in their language while the dispatcher receives English.
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import AppText from '../../components/AppText';
const Text = AppText; // global text scale
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import {
  SUPPORTED_LANGUAGES,
  getLanguage,
  LanguageEntry,
} from '../../services/languageConfig';
import { useTheme } from '../../context/ThemeContext';
import { useAppLanguage } from '../../context/AppLanguageContext';
import {
  downloadOfflineDictionary,
  getOfflineDictionaryStatus,
} from '../../services/uiDictionaryStore';

interface LanguagePickerProps {
  /** Current language code from parent settings */
  value: string;
  /** Callback when user selects a language */
  onChange: (code: string) => void;
}

export default function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const { colors } = useTheme();
  const { setLanguageCode } = useAppLanguage();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [modalVisible, setModalVisible] = useState(false);
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({ en: true });
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const selected = getLanguage(value) ?? SUPPORTED_LANGUAGES[0];

  React.useEffect(() => {
    getOfflineDictionaryStatus()
      .then((status) => setInstalledMap({ en: true, ...status }))
      .catch(() => setInstalledMap({ en: true }));
  }, [modalVisible]);

  const handleSelect = async (lang: LanguageEntry) => {
    const canSelect = lang.code === 'en' || !!installedMap[lang.code];
    if (!canSelect) return;
    onChange(lang.code);
    await setLanguageCode(lang.code);
    setModalVisible(false);
  };

  const handleDownloadOffline = async (code: string) => {
    if (downloadingCode || code === 'en') return;
    setDownloadingCode(code);
    setProgress(0);
    try {
      await downloadOfflineDictionary(code, setProgress);
      setInstalledMap((prev) => ({ ...prev, [code]: true }));
    } catch (e) {
      console.warn('Offline language download failed:', e);
      setInstalledMap((prev) => ({ ...prev, [code]: false }));
    } finally {
      setDownloadingCode(null);
    }
  };

  const renderItem = ({ item }: { item: LanguageEntry }) => {
    const installed = item.code === 'en' || !!installedMap[item.code];
    const isDownloadingThis = downloadingCode === item.code;
    const isSelected = item.code === value;

    return (
      <TouchableOpacity
        style={[
          s.langRow,
          isSelected && s.langRowActive,
          !installed && s.langRowDisabled,
        ]}
        onPress={() => handleSelect(item)}
        disabled={!installed}
      >
        <View style={s.langInfo}>
          <Text style={[s.langName, isSelected && s.langNameActive]}>
            {item.name}
          </Text>
          <Text style={s.langNative}>{item.nativeName}</Text>
          {!installed && (
            <Text style={s.lockedHint}>Download required before selecting</Text>
          )}
          {isDownloadingThis && (
            <Text style={s.progressHint}>Downloading... {progress}%</Text>
          )}
        </View>

        <View style={s.rightSide}>
          {isSelected && <Text style={s.check}>Selected</Text>}

          {!installed && (
            <TouchableOpacity
              style={s.downloadIconBtn}
              onPress={() => handleDownloadOffline(item.code)}
              disabled={!!downloadingCode}
            >
              {isDownloadingThis
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              }
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.settingInfo}>
        <Text style={s.label}>Preferred Language</Text>
        <Text style={s.desc}>
          Speak and type in your language during 911 calls - messages are
          automatically translated to English for the dispatcher, and the
          dispatcher's English responses are translated back for you
        </Text>
      </View>
      <TouchableOpacity style={s.selector} onPress={() => setModalVisible(true)}>
        <Text style={s.selectorText}>{selected.nativeName} ({selected.name})</Text>
        <Text style={s.arrow}>{'>'}</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Language</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={s.modalClose}>X</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={SUPPORTED_LANGUAGES}
              renderItem={renderItem}
              keyExtractor={(item) => item.code}
              contentContainerStyle={s.list}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container: { marginBottom: 0 },
    settingInfo: { marginBottom: 8 },
    label: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
    desc: { fontSize: 14, color: colors.textSecondary },
    selector: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 16,
      paddingVertical: 12, borderWidth: 1, borderColor: colors.inputBorder, marginTop: 8,
    },
    selectorText: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
    arrow: { color: colors.textMuted, fontSize: 16 },
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
      maxHeight: '70%', paddingBottom: 30,
    },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
    modalClose: { fontSize: 20, color: colors.textPrimary, padding: 4, fontWeight: '700' },
    list: { paddingHorizontal: 12 },
    langRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 14, paddingHorizontal: 12, borderRadius: 8, marginVertical: 2,
    },
    langRowDisabled: { opacity: 0.6 },
    langRowActive: { backgroundColor: colors.accentBg, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
    langInfo: { flex: 1 },
    langName: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
    langNameActive: { color: '#FFFFFF' },
    langNative: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    lockedHint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
    progressHint: { fontSize: 11, color: colors.accent, marginTop: 4, fontWeight: '600' },
    rightSide: { flexDirection: 'row', alignItems: 'center' },
    downloadIconBtn: {
      marginLeft: 10,
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    check: { fontSize: 18, color: '#FFFFFF', fontWeight: 'bold', marginLeft: 12 },
  });
