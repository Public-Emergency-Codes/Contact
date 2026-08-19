import React, { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import { Animated, AppState, BackHandler, Dimensions, PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CommunicationHubScreen from '../screens/Home/CommunicationHubScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import EmergencyVideoCaptureScreen from '../screens/Recordings/EmergencyVideoCaptureScreen';
import { TabPagerContext } from '../context/TabPagerContext';
import AppText from '../components/AppText';
import { arePermissionsGranted, PERMISSIONS_LIST, isGranted } from '../utils/appPermissions';

const { width: W, height: H } = Dimensions.get('window');
// Row layout (left→right): Record(0) | Home(1) | Settings(2)
const OFFSETS = [0, -W, -W * 2];

export default function TabContainer({ navigation, route }: any) {
  const offsetX = useRef(new Animated.Value(-W)).current;
  const page = useRef(1);
  const [activePage, setActivePage] = useState(1);
  const [activationNeeded, setActivationNeeded] = useState(false);
  const isFocused = useIsFocused();

  const refreshActivation = useCallback(async () => {
    const checks = await Promise.all(PERMISSIONS_LIST.map(async permission => {
      try { return isGranted(await permission.checkPerm()); }
      catch { return false; }
    }));
    setActivationNeeded(checks.some(granted => !granted));
  }, []);

  useEffect(() => {
    if (isFocused) void refreshActivation();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshActivation();
    });
    return () => sub.remove();
  }, [isFocused, refreshActivation]);

  const goToPage = useCallback((nextPage: number) => {
    page.current = nextPage;
    setActivePage(nextPage);
    Animated.spring(offsetX, {
      toValue: OFFSETS[nextPage],
      useNativeDriver: true,
      tension: 80,
      friction: 14,
    }).start();
  }, [offsetX]);

  const goToHome = useCallback(() => goToPage(1), [goToPage]);
  const goToRecord = useCallback(async () => {
    if (!await arePermissionsGranted(['camera', 'microphone'])) {
      navigation.navigate('Setup');
      return;
    }
    goToPage(0);
  }, [goToPage, navigation]);
  const goToSettings = useCallback(() => goToPage(2), [goToPage]);

  useEffect(() => {
    const target = route?.params?.initialPage;
    if (target === 'record') {
      goToRecord();
      return;
    }
    if (target === 'settings') {
      goToSettings();
      return;
    }
    if (target === 'home') {
      goToHome();
    }
  }, [goToHome, goToSettings, goToRecord, route?.params?.initialPage]);

  useEffect(() => {
    if (!isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page.current !== 1) {
        goToHome();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [goToHome, isFocused]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        page.current !== 1 && // Home's inner ScrollView handles its own gestures
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy),

      onPanResponderGrant: () => {
        offsetX.setOffset(OFFSETS[page.current]);
        offsetX.setValue(0);
      },

      onPanResponderMove: (_, gs) => {
        const currentPage = page.current;
        const canDrag =
          (currentPage === 0 && gs.dx < 0) ||
          currentPage === 1 ||
          (currentPage === 2 && gs.dx > 0);

        if (canDrag) {
          offsetX.setValue(gs.dx);
        }
      },

      onPanResponderRelease: (_, gs) => {
        offsetX.flattenOffset();
        const threshold = W * 0.25;
        const velocity = 0.4;
        const currentPage = page.current;

        if (currentPage === 0 && (gs.dx < -threshold || gs.vx < -velocity)) {
          goToHome();
        } else if (currentPage === 2 && (gs.dx > threshold || gs.vx > velocity)) {
          goToHome();
        } else if (currentPage === 1 && (gs.dx > threshold || gs.vx > velocity)) {
          goToRecord();
        } else if (currentPage === 1 && (gs.dx < -threshold || gs.vx < -velocity)) {
          goToSettings();
        } else {
          goToPage(currentPage);
        }
      },
    }),
  ).current;

  const ctx = useMemo(
    () => ({ goToHome, goToRecord, goToSettings, setHomeAtEdge: () => {} }),
    [goToHome, goToRecord, goToSettings],
  );

  return (
    <TabPagerContext.Provider value={ctx}>
      <View style={s.container}>
        <Animated.View
          style={[s.row, { transform: [{ translateX: offsetX }] }]}
          {...panResponder.panHandlers}
        >
          <View style={s.page}>
            <EmergencyVideoCaptureScreen navigation={navigation} isActive={activePage === 0} />
          </View>
          <View style={s.page}>
            <CommunicationHubScreen
              navigation={navigation}
              isActive={activePage === 1}
              initialTab={route?.params?.initialHomeTab}
              initialTabRequestId={route?.params?.initialHomeTabRequestId}
              pendingShare={route?.params?.pendingShare}
            />
          </View>
          <View style={s.page}>
            <SettingsScreen navigation={navigation} />
          </View>
        </Animated.View>
        {activationNeeded && (
          <SafeAreaView style={s.activationArea} edges={['bottom']} pointerEvents="box-none">
            <TouchableOpacity
              style={s.activationBanner}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Setup')}
              accessibilityRole="button"
              accessibilityLabel="Activate App"
            >
              <Ionicons name="shield-checkmark-outline" size={22} color="#fff" />
              <View style={s.activationCopy}>
                <AppText style={s.activationTitle}>Activate App</AppText>
                <AppText style={s.activationSubtitle}>Enable permissions to unlock all features</AppText>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
        )}
      </View>
    </TabPagerContext.Provider>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  row: { position: 'absolute', top: 0, left: 0, width: W * 3, height: H, flexDirection: 'row', backgroundColor: '#1a1a1a' },
  page: { width: W, height: H },
  activationArea: { position: 'absolute', left: 12, right: 12, bottom: 78, zIndex: 50 },
  activationBanner: { minHeight: 62, borderRadius: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: '#dc2626', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 12 },
  activationCopy: { flex: 1, marginHorizontal: 12 },
  activationTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  activationSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 2 },
});
