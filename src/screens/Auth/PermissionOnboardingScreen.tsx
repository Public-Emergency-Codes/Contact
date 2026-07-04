import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ToggleSwitch from '../../components/ToggleSwitch';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppText from '../../components/AppText';
const Text = AppText;
import { useTheme } from '../../context/ThemeContext';
import { openSettings } from 'react-native-permissions';
import { PERMISSIONS_LIST, isGranted, type PermState, type PermDef } from '../../utils/appPermissions';

type States = Record<string, PermState>;

export default function PermissionOnboardingScreen({ navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);
  const [states, setStates] = useState<States>(
    () => Object.fromEntries(PERMISSIONS_LIST.map(p => [p.key, 'loading' as PermState]))
  );
  const [showErrors, setShowErrors] = useState(false);

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

  // Only critical permissions must be granted before the user can continue.
  const allGranted = PERMISSIONS_LIST
    .filter(p => p.critical)
    .every(p => isGranted(states[p.key] ?? 'denied'));

  const criticalStillLoading = PERMISSIONS_LIST
    .filter(p => p.critical)
    .some(p => (states[p.key] ?? 'loading') === 'loading');

  const handleContinue = async () => {
    if (!allGranted || criticalStillLoading) {
      setShowErrors(true);
      return;
    }
    await AsyncStorage.setItem('setup_complete', 'true');
    navigation.replace('Home');
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Permissions</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {PERMISSIONS_LIST.map(p => {
          const state = states[p.key] ?? 'loading';
          const granted = isGranted(state);
          const hasError = showErrors && p.critical && !granted && state !== 'loading';
          return (
            <TouchableOpacity key={p.key} style={[styles.card, hasError && styles.cardError]} onPress={() => handleToggle(p)} activeOpacity={0.7}>
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.settingLabel}>{p.label}</Text>
                  <Text style={styles.settingDescription}>{p.description}</Text>
                </View>
                <ToggleSwitch
                  value={granted}
                  loading={state === 'loading'}
                  error={hasError}
                  onValueChange={() => handleToggle(p)}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, (allGranted && !criticalStillLoading) ? styles.continueBtnActive : styles.continueBtnDisabled]}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, topInset: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: topInset + 12,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
  content: { flexGrow: 1, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    marginTop: 16,
    padding: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  cardError: {
    borderColor: '#ef4444',
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLeft: { flex: 1, marginRight: 12 },
  settingLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  settingDescription: { fontSize: 14, color: colors.textSecondary },
  footer: {
    padding: 16, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  continueBtn: {
    paddingVertical: 16, borderRadius: 12, alignItems: 'center',
  },
  continueBtnActive: { backgroundColor: '#3b82f6', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  continueBtnDisabled: { backgroundColor: '#4a4a4a', opacity: 0.4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' },
  continueBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
