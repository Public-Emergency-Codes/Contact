import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ToggleSwitch from '../../components/ToggleSwitch';
import {
  View, StyleSheet, ScrollView,
  TouchableOpacity, AppState, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
const Text = AppText;
import { useTheme } from '../../context/ThemeContext';
import { CommonActions } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { openSettings } from 'react-native-permissions';
import { PERMISSIONS_LIST, isGranted, CRITICAL_KEYS, type PermState, type PermDef } from '../../utils/appPermissions';

type States = Record<string, PermState>;

export default function PermissionManagementScreen({ navigation, route }: any) {
  const highlightKey: string | undefined = route?.params?.highlightKey;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);
  const [states, setStates] = useState<States>(
    () => Object.fromEntries(PERMISSIONS_LIST.map(p => [p.key, 'loading' as PermState]))
  );
  // Tracks that we just sent the user to system settings — AppState listener uses this.
  const justOpenedSettings = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const cardOffsets = useRef<Record<string, number>>({});
  const highlightAnim = useRef(new Animated.Value(0)).current;

  const doRefresh = useCallback(async () => {
    const results = await Promise.all(
      PERMISSIONS_LIST.map(async p => {
        try { return [p.key, await p.checkPerm()] as const; }
        catch { return [p.key, 'denied' as PermState] as const; }
      })
    );
    const fresh = Object.fromEntries(results);
    setStates(fresh);
    return fresh as Record<string, PermState>;
  }, []);

  // Scroll to and pulse the highlighted card once states have loaded
  useEffect(() => {
    if (!highlightKey) return;
    const offset = cardOffsets.current[highlightKey];
    if (offset !== undefined) {
      setTimeout(() => scrollRef.current?.scrollTo({ y: offset - 20, animated: true }), 300);
    }
    Animated.loop(
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
        Animated.timing(highlightAnim, { toValue: 0, duration: 500, useNativeDriver: false }),
      ]),
      { iterations: 4 }
    ).start();
  }, [highlightKey, highlightAnim]);

  useEffect(() => {
    doRefresh();
    const unsubscribeFocus = navigation.addListener('focus', doRefresh);
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      const fresh = await doRefresh();
      if (justOpenedSettings.current) {
        justOpenedSettings.current = false;
        const anyRevoked = CRITICAL_KEYS.some(k => !isGranted(fresh[k] as PermState));
        if (anyRevoked) {
          await AsyncStorage.removeItem('setup_complete');
          navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Setup' }] }));
        }
      }
    });
    return () => {
      sub.remove();
      unsubscribeFocus();
    };
  }, [doRefresh, navigation]);

  const handleToggle = useCallback(async (p: PermDef) => {
    // Always read live state to avoid stale-closure bugs.
    const live = await p.checkPerm();
    if (isGranted(live)) {
      justOpenedSettings.current = true;
      await openSettings().catch(() => { justOpenedSettings.current = false; });
      return;
    }
    // Permission is OFF — request it.
    setStates(prev => ({ ...prev, [p.key]: 'loading' }));
    const newState = await p.requestPerm();
    setStates(prev => ({ ...prev, [p.key]: newState }));
    setTimeout(doRefresh, 800);
  }, [doRefresh]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 30, lineHeight: 30, color: colors.textPrimary }}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Permissions</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {PERMISSIONS_LIST.map(p => {
          const state = states[p.key] ?? 'loading';
          const granted = isGranted(state);
          const isHighlighted = p.key === highlightKey && !granted;
          const borderColor = isHighlighted
            ? highlightAnim.interpolate({ inputRange: [0, 1], outputRange: ['transparent', '#ef4444'] })
            : 'transparent';
          return (
            <Animated.View
              key={p.key}
              onLayout={e => { cardOffsets.current[p.key] = e.nativeEvent.layout.y; }}
              style={[styles.card, { borderWidth: 2, borderColor }]}
            >
              <TouchableOpacity onPress={() => handleToggle(p)} activeOpacity={0.7}>
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Text style={[styles.settingLabel, isHighlighted && { color: '#ef4444' }]}>{p.label}</Text>
                    <Text style={styles.settingDescription}>{p.description}</Text>
                  </View>
                  <ToggleSwitch
                    value={granted}
                    loading={state === 'loading'}
                    onValueChange={() => handleToggle(p)}
                  />
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, topInset: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: topInset + 12,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 40, height: 40 },
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
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLeft: { flex: 1, marginRight: 12 },
  settingLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  settingDescription: { fontSize: 14, color: colors.textSecondary },
});
