import React, { useState, useMemo, useCallback } from 'react';
import {
  View, StyleSheet, FlatList, NativeModules,
  TouchableOpacity, Alert, RefreshControl, Modal, Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AppText from '../../components/AppText';
import AppTextInput from '../../components/AppTextInput';
const Text = AppText; // global text scale
const TextInput = AppTextInput;
import * as FileSystem from 'expo-file-system/legacy';
import AppVideo from '../../components/AppVideo';
import { useTheme } from '../../context/ThemeContext';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';

const { ShareFile } = NativeModules;

interface Recording {
  uri: string; name: string; size: number; modificationTime: number;
}

export default function RecordingLibraryScreen({ navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUris, setSelectedUris] = useState<Set<string>>(new Set());
  const [infoVisible, setInfoVisible] = useState(false);
  const [editingUri, setEditingUri] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirm, setConfirm] = useState<{ msg: string; onOk: () => void } | null>(null);
  const showConfirm = (msg: string, onOk: () => void) => setConfirm({ msg, onOk });
  const dismissConfirm = () => setConfirm(null);

  const loadRecordings = async () => {
    try {
      setRefreshing(true);
      const dir = FileSystem.documentDirectory || '';
      const files = await FileSystem.readDirectoryAsync(dir);
      const vids = files.filter(f => f.endsWith('.mp4'));
      const details = await Promise.all(
        vids.map(async (file) => {
          const uri = `${dir}${file}`;
          const info = await FileSystem.getInfoAsync(uri);
          return {
            uri, name: file,
            size: info.exists && 'size' in info ? info.size : 0,
            modificationTime: info.exists && 'modificationTime' in info ? info.modificationTime : 0,
          };
        })
      );
      details.sort((a, b) => b.modificationTime - a.modificationTime);
      setRecordings(details);
    } catch (e) {
      console.error('Failed to load recordings:', e);
      Alert.alert('Error', 'Failed to load recordings');
    } finally { setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { loadRecordings(); }, []));

  const handleDelete = (rec: Recording) => {
    showConfirm(`Delete ${rec.name}?`, async () => {
      try {
        await FileSystem.deleteAsync(rec.uri, { idempotent: true });
        loadRecordings();
      } catch { Alert.alert('Error', 'Failed to delete recording'); }
    });
  };

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedUris(new Set());
  }, []);

  const handleLongPress = (uri: string) => {
    setPlaying(null);
    setSelectMode(true);
    setSelectedUris(new Set([uri]));
  };

  const handleCardPress = (item: Recording) => {
    if (selectMode) {
      setSelectedUris(prev => {
        const next = new Set(prev);
        if (next.has(item.uri)) next.delete(item.uri); else next.add(item.uri);
        return next;
      });
    } else {
      setPlaying(playing === item.uri ? null : item.uri);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedUris.size === 0) return;
    showConfirm(`Delete ${selectedUris.size} recording${selectedUris.size > 1 ? 's' : ''}? This cannot be undone.`, async () => {
      try {
        await Promise.all([...selectedUris].map(u => FileSystem.deleteAsync(u, { idempotent: true }).catch(() => {})));
        exitSelectMode();
        loadRecordings();
      } catch { Alert.alert('Error', 'Failed to delete some recordings'); loadRecordings(); }
    });
  };

  const startEdit = (item: Recording) => {
    setEditingUri(item.uri);
    setEditName(item.name.replace(/\.mp4$/i, ''));
  };

  const cancelEdit = () => { setEditingUri(null); setEditName(''); };

  const handleRename = async (item: Recording) => {
    const trimmed = editName.trim();
    if (!trimmed) { Alert.alert('Invalid', 'Name cannot be empty.'); return; }
    const newName = trimmed.endsWith('.mp4') ? trimmed : `${trimmed}.mp4`;
    if (newName === item.name) { cancelEdit(); return; }
    const dir = FileSystem.documentDirectory || '';
    const newUri = `${dir}${newName}`;
    try {
      const existing = await FileSystem.getInfoAsync(newUri);
      if (existing.exists) { Alert.alert('Name taken', 'A recording with that name already exists.'); return; }
      await FileSystem.moveAsync({ from: item.uri, to: newUri });
      cancelEdit();
      loadRecordings();
    } catch (e) {
      console.error('Rename failed:', e);
      Alert.alert('Error', 'Failed to rename recording.');
    }
  };

  const handleShare = async (item: Recording) => {
    try {
      if (!ShareFile?.share) throw new Error('Native file sharing is unavailable');
      await ShareFile.share(item.uri, 'video/mp4', item.name);
    } catch (e) {
      console.warn('[Recordings] File share failed:', e);
      Alert.alert('Unable to share', 'The recording could not be attached.');
    }
  };

  const fmtSize = (b: number) => {    if (b === 0) return '0 B';
    const k = 1024;
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return Math.round((b / Math.pow(k, i)) * 100) / 100 + ' ' + u[i];
  };

  const fmtDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };

  const renderItem = ({ item }: { item: Recording }) => {
    const isSel = selectedUris.has(item.uri);
    const isEditing = editingUri === item.uri;
    const isExpanded = !selectMode && playing === item.uri;
    return (
      <TouchableOpacity
        activeOpacity={isEditing ? 1 : 0.85}
        onPress={() => { if (!isEditing) handleCardPress(item); }}
        onLongPress={() => { if (!isEditing) handleLongPress(item.uri); }}
        delayLongPress={350}
      >
        <View style={[s.card, isSel && s.cardSelected]}>
          <View style={s.cardBody}>
            {selectMode && (
              <View style={[s.checkbox, isSel && s.checkboxOn]}>
                {isSel && <Ionicons name="checkmark" size={14} color="#FFF" />}
              </View>
            )}
            <View style={s.cardInfo}>
              {isEditing ? (
                <TextInput
                  style={s.nameInput}
                  value={editName}
                  onChangeText={setEditName}
                  autoFocus
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={() => handleRename(item)}
                />
              ) : (
                <Text style={s.cardLabel}>{item.name}</Text>
              )}
              <Text style={s.cardMeta}>{fmtSize(item.size)} • {fmtDate(item.modificationTime)}</Text>
            </View>
            {!selectMode && (
              isEditing ? (
                <View style={s.editActions}>
                  <TouchableOpacity style={s.editActionBtn} onPress={() => handleRename(item)}>
                    <Ionicons name="checkmark" size={20} color={colors.accent} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.editActionBtn} onPress={cancelEdit}>
                    <Ionicons name="close" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : isExpanded ? (
                <View style={s.cardActions}>
                  <TouchableOpacity style={s.cardActionBtn} onPress={() => handleShare(item)}>
                    <Ionicons name="share-social" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cardActionBtn} onPress={() => handleDelete(item)}>
                    <Ionicons name="trash" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.cardActions}>
                  <TouchableOpacity style={s.cardActionBtn} onPress={() => handleShare(item)}>
                    <Ionicons name="share-social" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cardActionBtn} onPress={() => startEdit(item)}>
                    <Ionicons name="pencil" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )
            )}
          </View>
          {isExpanded && (
            <View style={s.videoWrap} onStartShouldSetResponder={() => true}>
              <AppVideo
                uri={item.uri}
                style={s.video}
                contentFit="contain"
                nativeControls
              />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['bottom', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={selectMode ? exitSelectMode : () => navigation.goBack()}>
          {selectMode
            ? <Ionicons name="close" size={24} color={colors.textPrimary} />
            : <Text style={{ fontSize: 30, lineHeight: 30, color: colors.textPrimary }}>{'\u2039'}</Text>}
        </TouchableOpacity>
        <Text style={s.title}>
          {selectMode ? `${selectedUris.size} selected` : 'Emergency Recordings'}
        </Text>
        {selectMode ? (
          <TouchableOpacity style={s.backBtn} onPress={handleDeleteSelected}>
            <Ionicons name="trash" size={24} color={selectedUris.size > 0 ? '#DC2626' : colors.textMuted} />
          </TouchableOpacity>
        ) : recordings.length > 0 ? (
          <TouchableOpacity style={s.backBtn} onPress={() => setInfoVisible(true)}>
            <Ionicons name="information-circle-outline" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={s.backBtn} />
        )}
      </View>
      <FlatList
        data={recordings}
        renderItem={renderItem}
        keyExtractor={i => i.uri}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadRecordings} />}
        ListEmptyComponent={!refreshing ? (
          <View style={s.emptyDesc}>
            <Text style={s.desc}>
              {'Emergency recordings are automatically captured during an active emergency session. Videos are stored only on your device and are never uploaded.'}
            </Text>
            <Text style={s.desc}>
              {'Once you have recordings, you can tap a card to play it, press the pencil to rename it, or long-press to select multiple recordings for deletion.'}
            </Text>
          </View>
        ) : null}
      />

      <Modal visible={infoVisible} transparent animationType="fade" onRequestClose={() => setInfoVisible(false)}>
        <Pressable style={s.modalOverlay}>
          <Pressable style={s.infoModal} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity style={s.infoClose} onPress={() => setInfoVisible(false)}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={s.infoText}>
              {'Emergency recordings are automatically captured during an active emergency session.\n\nVideos are stored locally on your device and never uploaded.\n\n'}
              <Text style={{ fontWeight: 'bold' }}>Tip: </Text>
              {'Long-press any recording card to enter multi-select mode and delete several recordings at once.'}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={dismissConfirm}>
        <View style={s.modalOverlay}>
          <View style={s.confirmBox}>
            <Text style={s.confirmMsg}>{confirm?.msg}</Text>
            <View style={s.confirmBtns}>
              <TouchableOpacity style={s.confirmCancel} onPress={dismissConfirm}>
                <Text style={s.confirmCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmDelete} onPress={() => { confirm?.onOk(); dismissConfirm(); }}>
                <Text style={s.confirmDeleteTxt}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ReturnType<typeof import('../../context/ThemeContext').useTheme>['colors'], topInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: topInset + 16, paddingBottom: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
    delAll: { fontSize: 14, fontWeight: '600', color: '#DC2626', textAlign: 'right' },
    emptyDesc: { paddingTop: 8, paddingHorizontal: 20 },
    desc: { color: colors.textMuted, fontSize: 14, marginBottom: 20, lineHeight: 20 },
    card: { backgroundColor: colors.surface, marginTop: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    cardSelected: { borderColor: '#EF4444', borderTopWidth: 2, borderBottomWidth: 2 },
    cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
    cardInfo: { flex: 1, marginRight: 12 },
    cardLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
    cardMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
    cardDeleteBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardActionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    nameInput: { color: colors.inputText, fontSize: 14, fontWeight: '600', backgroundColor: colors.inputBackground, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 2 },
    editActions: { flexDirection: 'row', alignItems: 'center' },
    editActionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
    checkboxOn: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
    videoWrap: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#000' },
    video: { width: '100%', height: 300 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    infoModal: { backgroundColor: colors.surface, borderRadius: 12, padding: 24, paddingTop: 16, width: '85%', maxWidth: 380, borderWidth: 1, borderColor: colors.border },
    infoClose: { alignSelf: 'flex-end', padding: 4, marginBottom: 8 },
    infoText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
    confirmBox: { backgroundColor: colors.surface, borderRadius: 12, padding: 24, width: '85%', maxWidth: 380, borderWidth: 1, borderColor: colors.border },
    confirmMsg: { color: colors.textPrimary, fontSize: 15, lineHeight: 22, marginBottom: 20 },
    confirmBtns: { flexDirection: 'row', gap: 10 },
    confirmCancel: { flex: 1, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
    confirmCancelTxt: { color: '#fff', fontWeight: '600', fontSize: 15 },
    confirmDelete: { flex: 1, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
    confirmDeleteTxt: { color: '#fff', fontWeight: '600', fontSize: 15 },
  });
