import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ToggleSwitch from '../../components/ToggleSwitch';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, AppState, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
const Text = AppText;
import { useTheme } from '../../context/ThemeContext';
import { openSettings } from 'react-native-permissions';
import { PERMISSIONS_LIST, isGranted, type PermState, type PermDef } from '../../utils/appPermissions';

type States = Record<string, PermState>;

export default function PermissionOnboardingScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [states, setStates] = useState<States>(
    () => Object.fromEntries(PERMISSIONS_LIST.map(p => [p.key, 'loading' as PermState]))
  );

  const refresh = useCallback(async () => {
    const results = await Promise.all(
      PERMISSIONS_LIST.map(async p => {
        try {
          return [p.key, await p.checkPerm()] as const;
        } catch {
          return [p.key, 'denied' as PermState] as const;
        }
      })
    );
    setStates(Object.fromEntries(results));
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const allGranted = PERMISSIONS_LIST.every(p => isGranted(states[p.key] ?? 'denied'));
  const stillLoading = PERMISSIONS_LIST.some(p => (states[p.key] ?? 'loading') === 'loading');

  useEffect(() => {
    if (!stillLoading && allGranted && navigation.canGoBack()) navigation.goBack();
  }, [allGranted, navigation, stillLoading]);

  const handleToggle = useCallback(async (p: PermDef) => {
    // Read live state (not from stale closure) to pick the right branch.
    const live = await p.checkPerm();
    if (isGranted(live)) {
      // Already granted — open App Info so user can manage it.
      await openSettings().catch(() => {});
      return;
    }
    setStates(prev => ({ ...prev, [p.key]: 'loading' }));
    const newState = await p.requestPerm();
    setStates(prev => ({ ...prev, [p.key]: newState }));
    setTimeout(refresh, 800);
  }, [refresh]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <Pressable
        style={styles.backdrop}
        onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Home')}
      >
        <Pressable style={styles.window} onPress={event => event.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerSpacer} />
            <Text style={styles.headerTitle}>Activate App</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Home')}
              accessibilityRole="button"
              accessibilityLabel="Close activation window"
            >
              <Text style={styles.closeText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {PERMISSIONS_LIST.map(p => {
              const state = states[p.key] ?? 'loading';
              const granted = isGranted(state);
              return (
                <TouchableOpacity key={p.key} style={styles.card} onPress={() => handleToggle(p)} activeOpacity={0.7}>
                  <View style={styles.row}>
                    <View style={styles.rowLeft}>
                      <Text style={styles.settingLabel}>{p.label}</Text>
                      <Text style={styles.settingDescription}>{p.description}</Text>
                    </View>
                    <ToggleSwitch
                      value={granted}
                      loading={state === 'loading'}
                      onValueChange={() => handleToggle(p)}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  window: { width: '100%', maxWidth: 520, maxHeight: '86%', backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', elevation: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.45, shadowRadius: 20 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between',
  },
  headerSpacer: { width: 40, height: 40 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textPrimary, fontSize: 30, lineHeight: 32 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  content: { paddingBottom: 16 },
  card: {
    backgroundColor: colors.surface,
    marginTop: 12,
    marginHorizontal: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLeft: { flex: 1, marginRight: 12 },
  settingLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  settingDescription: { fontSize: 14, color: colors.textSecondary },
});
