import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, AppState, Keyboard, NativeModules, PermissionsAndroid, Platform, ScrollView, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts/legacy';
import AppText from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import makeCommunicationHubStyles from './communicationHubStyles';
import { type RecentEntry, withDateSeparators } from './communicationHubModels';
import { ContactsPage, EmergencyDirectoryPage, RecentCallsPage } from './CommunicationHubPages';
import { resolveLocalEmergencyNumbers } from '../../services/psap/bundledPsapDirectoryService';
import { getCurrentLocation } from '../../services/location/locationHistoryTrackingService';
import { EMERGENCY_TEST_NUMBER } from '../../services/runtimeConfig';
import { useTabPager } from '../../context/TabPagerContext';
import AddContactModal from './AddContactModal';
import ChatListTab from './ChatListTab';
import FloatingTabBar, { TAB_KEYS, TabKey } from '../../components/FloatingTabBar';
import { PhoneDialer } from './PhoneDialer';
import { placeContactCall, placeContactVideoCall } from '../../services/contactActionService';
import { inCallService } from '../../services/inCallService';
import { resolveLocal311Equivalent } from '../../services/civic/countyDirectoryService';
import type { Local311Equivalent } from '../../services/civic/countyDirectoryService';

const Text = AppText;

// TABS, TAB_KEYS defined in FloatingTabBar component

export default function CommunicationHubScreen({ navigation, isActive = true, initialTab, initialTabRequestId, pendingShare }: any) {
  const { colors } = useTheme();
  const { goToSettings } = useTabPager();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeCommunicationHubStyles(colors, insets.top), [colors, insets.top]);
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [contacts, setContacts] = useState<any[]>([]);
  const [recentCalls, setRecentCalls] = useState<RecentEntry[]>([]);
  const [localNums, setLocalNums] = useState<{ police: string; fire: string | null; medical: string | null }>({ police: '911', fire: null, medical: null });
  const [local311, setLocal311] = useState<Local311Equivalent | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const [deepSearch, setDeepSearch] = useState(false);
  const [deepSearchTooltip, setDeepSearchTooltip] = useState(false);
  const [addContactVisible, setAddContactVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<{ id: string; name: string; number: string } | null>(null);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [expandedEmergencyId, setExpandedEmergencyId] = useState<string | null>(null);
  const [expandedRecentId, setExpandedRecentId] = useState<string | null>(null);
  const searchAnim = useRef(new Animated.Value(0)).current;
  const searchInputRef = useRef<TextInput>(null);
  const { width: screenWidth } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const loadingRef = useRef(false);
  const permsRef = useRef({ contacts: false, callLog: false });
  const initialScrollDone = useRef(false);
  const pendingInitialTabRef = useRef<TabKey | null>(initialTab === 'chat' ? initialTab : null);
  const needsPagerReset = useRef(false);
  const threadIdCacheRef = useRef<Map<string, string>>(new Map());

  // When returning to Home from Settings, snap inner pager back to Chat
  useEffect(() => {
    if (isActive && needsPagerReset.current) {
      needsPagerReset.current = false;
      const chatIdx = TAB_KEYS.indexOf('chat');
      pagerRef.current?.scrollTo({ x: chatIdx * screenWidth, animated: false });
      setActiveTab('chat');
    }
  }, [isActive, screenWidth]);

  const goToInnerPage = useCallback((idx: number, animated = true) => {
    pagerRef.current?.scrollTo({ x: idx * screenWidth, animated });
    setActiveTab(TAB_KEYS[idx]);
  }, [screenWidth]);

  const snapToInnerTab = useCallback((tab: TabKey, animated = false) => {
    const idx = TAB_KEYS.indexOf(tab);
    if (idx < 0) return;
    pagerRef.current?.scrollTo({ x: idx * screenWidth, animated });
    setActiveTab(tab);
  }, [screenWidth]);

  useEffect(() => {
    if (initialTab !== 'chat') return;
    pendingInitialTabRef.current = initialTab;
    if (initialScrollDone.current) {
      snapToInnerTab(initialTab, false);
    }
  }, [initialTab, initialTabRequestId, snapToInnerTab]);

  // Handle incoming shared content from other apps (ACTION_SEND intent)
  useEffect(() => {
    if (!pendingShare) return;
    // Store pending share globally so ChatWindow can pick it up when composing
    (globalThis as any).__pendingShare = pendingShare;
  }, [pendingShare]);

  const handleGhostPage = useCallback(() => {
    needsPagerReset.current = true;
    goToSettings();
  }, [goToSettings]);

  // Finger lifted — if past last tab, go to Settings
  const onScrollEndDrag = useCallback((e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    if (x > (TAB_KEYS.length - 1) * screenWidth + 20) {
      handleGhostPage();
    }
  }, [screenWidth, handleGhostPage]);

  const onPagerMomentumEnd = useCallback((e: any) => {
    const pageIdx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    if (pageIdx >= TAB_KEYS.length) {
      handleGhostPage();
    } else {
      setActiveTab(TAB_KEYS[pageIdx]);
    }
  }, [screenWidth, handleGhostPage]);

  const handleTabPress = useCallback((key: TabKey) => {
    const i = TAB_KEYS.indexOf(key);
    if (i >= 0) goToInnerPage(i);
  }, [goToInnerPage]);

  // Pure data loader — no permission requests
  const loadContactsData = useCallback(async () => {
    if (!permsRef.current.contacts) return;
    try {
      const normalizePhoneLabel = (value: string | undefined) => {
        const label = (value || '').trim();
        if (!label) return '';
        if (/^(mobile|cell|home|work|main|other)$/i.test(label)) return '';
        return label;
      };
      const result = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Company,
          Contacts.Fields.JobTitle,
          Contacts.Fields.Addresses,
          Contacts.Fields.Image,
          Contacts.Fields.Note,
          Contacts.Fields.Birthday,
        ],
      });
      const normalized = (result.data || [])
        .filter((c) => c.phoneNumbers && c.phoneNumbers.length > 0)
        .map((c, i) => ({
          id: c.id || `c-${i}`,
          name: c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown',
          number: c.phoneNumbers![0].number || '',
          subtitle: normalizePhoneLabel(c.phoneNumbers![0].label),
          email: c.emails?.[0]?.email || '',
          company: c.company || '',
          jobTitle: c.jobTitle || '',
          address: c.addresses?.[0]
            ? [
                (c.addresses[0] as any).street,
                (c.addresses[0] as any).city,
                (c.addresses[0] as any).state,
                (c.addresses[0] as any).postalCode,
                (c.addresses[0] as any).country,
              ].filter(Boolean).join(', ')
            : '',
          note: c.note || '',
          birthday: c.birthday
            ? [c.birthday.month, c.birthday.day, c.birthday.year].filter(Boolean).join('/')
            : '',
          imageUri: c.image?.uri || '',
        }));
      setContacts(normalized);
    } catch (err) {
      console.warn('[Contacts] load failed:', err);
    }
  }, []);

  // Pure data loader — no permission requests
  const loadRecentCallsData = useCallback(async () => {
    if (Platform.OS !== 'android' || !permsRef.current.callLog) return;
    try {
      const mod = NativeModules.E911DetectorModule;
      if (!mod) return;
      const raw: any[] = await mod.getRecentCalls(100);
      if (!Array.isArray(raw)) return;
      // Group only consecutive calls to the same number
      const grouped: RecentEntry[] = [];
      for (const x of raw) {
        if (!x?.number) continue;
        const last = grouped[grouped.length - 1];
        if (last && last.number === x.number) {
          last.types.push(x.type ?? 2);
          last.count++;
        } else {
          grouped.push({
            id: `${x.date ?? Date.now()}-${grouped.length}`,
            name: x.name?.trim() || x.number,
            number: x.number,
            date: x.date ?? 0,
            types: [x.type ?? 2],
            count: 1,
          });
        }
      }
      setRecentCalls(grouped);
    } catch (err) {
      console.warn('[Recent] load failed:', err);
    }
  }, []);

  const reloadData = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try { await Promise.all([loadContactsData(), loadRecentCallsData()]); }
    finally { loadingRef.current = false; }
  }, [loadContactsData, loadRecentCallsData]);

  const openSearch = useCallback(() => {
    setSearchVisible(true);
    setFilterVisible(false);
    if (activeTab === 'chat') setDeepSearchTooltip(true);
    Animated.timing(searchAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start(() => searchInputRef.current?.focus());
  }, [searchAnim, activeTab]);

  const closeSearch = useCallback(() => {
    setSearchQuery('');
    setSearchVisible(false);
    Keyboard.dismiss();
    Animated.timing(searchAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }, [searchAnim]);

  // Reset search/filter when switching tabs
  useEffect(() => {
    setScrolled(false);
    setSearchQuery('');
    setSearchVisible(false);
    searchAnim.setValue(0);
    setFilterVisible(false);
    setFilterValue('');
    setDeepSearch(false);
    setDeepSearchTooltip(false);
  }, [activeTab, searchAnim]);

  // ONE-TIME permission init — the only place we ever call requestPermissionsAsync
  useEffect(() => {
    (async () => {
      // Contacts: check before request to avoid unnecessary dialog
      const { status: existing } = await Contacts.getPermissionsAsync();
      if (existing === 'granted') {
        permsRef.current.contacts = true;
      } else {
        const { status } = await Contacts.requestPermissionsAsync();
        permsRef.current.contacts = status === 'granted';
      }
      // Call log: request once here — AppState listener never requests again
      if (Platform.OS === 'android') {
        const checked = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
        let clGranted = checked;
        if (!clGranted) {
          const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
          clGranted = res === PermissionsAndroid.RESULTS.GRANTED;
        }
        permsRef.current.callLog = clGranted;
      } else {
        permsRef.current.callLog = true;
      }
      reloadData();
    })().catch((e) => console.warn('[CommunicationHubScreen] init error:', e));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // AppState: refresh data on foreground — NO permission requests
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        loadingRef.current = false;
        reloadData();
      }
    });
    return () => sub.remove();
  }, [reloadData]);

  const toDialable = useCallback((value: string) => value.replace(/[^\d+*#,;]/g, ''), []);
  const e911CardNumber = EMERGENCY_TEST_NUMBER;

  const makeCall = useCallback(async (phoneNumber: string, _label: string) => {
    const dialable = toDialable(phoneNumber);
    if (!dialable) {
      Alert.alert('Cannot start call', 'This contact does not have a valid phone number.');
      return;
    }
    await placeContactCall(dialable);
  }, [toDialable]);

  const handleVideoCall = useCallback(async (phoneNumber: string) => {
    const dialable = toDialable(phoneNumber);
    if (!dialable) {
      Alert.alert('Cannot start call', 'This contact does not have a valid phone number.');
      return;
    }
    await placeContactVideoCall(dialable);
  }, [toDialable]);

  const navigateToSmsChat = useCallback(async (phoneNumber: string, contactName?: string) => {
    const dialable = toDialable(phoneNumber);
    if (!dialable) {
      Alert.alert('Cannot open chat', 'This contact does not have a valid phone number.');
      return;
    }
    // Check cache first
    const cached = threadIdCacheRef.current.get(dialable);
    if (cached) {
      navigation.navigate('ChatWindow', { threadId: cached, address: dialable, contactName });
      return;
    }
    // Resolve thread ID from the native SMS provider
    try {
      const mod = NativeModules.SmsReader;
      if (mod && typeof mod.getThreadIdByAddress === 'function') {
        const threadId = await mod.getThreadIdByAddress(dialable);
        if (threadId) {
          const tid = String(threadId);
          threadIdCacheRef.current.set(dialable, tid);
          navigation.navigate('ChatWindow', { threadId: tid, address: dialable, contactName });
          return;
        }
      }
    } catch (e) {
      console.warn('[CommunicationHubScreen] getThreadIdByAddress failed:', e);
    }
    // Fallback: navigate with the phone number as threadId (may be empty)
    navigation.navigate('ChatWindow', { threadId: dialable, address: dialable, contactName });
  }, [toDialable, navigation]);

  const openE911 = useCallback(async (params: any) => {
    const e911ActionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextParams = {
      ...params,
      autoInitiateCall: params?.autoInitiateCall === true,
      showInitiateCallButton: params?.showInitiateCallButton === true,
      startNewSession: params?.startNewSession === true,
      withVideo: params?.withVideo === true,
      e911ActionId,
    };
    const navState = navigation.getState?.();
    const liveE911Route = navState?.routes?.find((route: any) => route.name === 'E911Call');
    if (liveE911Route) {
      navigation.popTo('E911Call', nextParams);
      return;
    }

    // Never navigate into an auto-dialing E911 route while Telecom already has
    // a call. This avoids Android's "can't place two calls" system dialog even
    // if the original E911 route was removed unexpectedly.
    const hasActiveCall = await inCallService.hasActiveCall();
    if (hasActiveCall) {
      navigation.navigate('E911Call', {
        source: 'resume_active_e911',
        emergencyNumber: e911CardNumber,
        callInitiated: true,
        startNewSession: false,
        withVideo: nextParams.withVideo,
        autoInitiateCall: false,
        e911ActionId,
      });
      return;
    }

    navigation.navigate('E911Call', nextParams);
  }, [e911CardNumber, navigation]);

  // Refresh local emergency and county non-emergency numbers when Home becomes active.
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    (async () => {
      try {
        const loc = await getCurrentLocation();
        const resp = resolveLocalEmergencyNumbers(loc.latitude, loc.longitude);
        const civicNumber = await resolveLocal311Equivalent(loc.latitude, loc.longitude).catch((error: any) => {
          console.warn('[Civic] county number lookup failed:', error?.message || error);
          return null;
        });
        if (cancelled) return;
        const base = resp.policeNumber || '911';
        setLocalNums({
          police: base,
          fire: (resp.fireNumber && resp.fireNumber !== base) ? resp.fireNumber : null,
          medical: (resp.medicalNumber && resp.medicalNumber !== base) ? resp.medicalNumber : null,
        });
        setLocal311(civicNumber);
      } catch (e: any) { console.warn('[Emergency] localNums fetch failed:', e?.message || e); }
    })();
    return () => { cancelled = true; };
  }, [isActive]);

  const emergencyCards = useMemo(() => {
    const coveredBy911 = ['Police', ...(!localNums.fire ? ['Fire'] : []), ...(!localNums.medical ? ['Medical'] : [])];
    const primaryEmergencyNumber = e911CardNumber;
    const cards: { id: string; name: string; number: string; subtitle: string; description: string; icon: string }[] = [
      {
        id: 'e1', name: primaryEmergencyNumber, number: primaryEmergencyNumber,
        subtitle: coveredBy911.join(' · '), icon: 'alert-circle',
        description: 'Call 911 only for life-threatening emergencies that require an immediate police, fire, or medical response — such as active crimes, serious injuries, fires, or cardiac events. Do not call for noise complaints, minor disputes, lost property, or any situation that can wait. Misuse of 911 ties up resources and can delay help for someone whose life is truly at risk.',
      },
    ];
    if (localNums.fire)
      cards.push({
        id: 'e2', name: localNums.fire, number: localNums.fire, subtitle: 'Local fire dispatch', icon: 'alert-circle',
        description: 'Use this number to report an active fire, gas leak, chemical spill, or any situation where fire department or hazmat response is urgently needed in your area. Do not call for general fire safety questions, past incidents that have already been resolved, or situations better handled by non-emergency services.',
      });
    if (localNums.medical)
      cards.push({
        id: 'e3', name: localNums.medical, number: localNums.medical, subtitle: 'Local medical dispatch', icon: 'alert-circle',
        description: 'Call this number to request emergency medical assistance, such as an ambulance for serious injuries, unconsciousness, difficulty breathing, chest pain, or stroke symptoms. Do not use it for medical advice, prescription questions, or non-urgent health concerns — contact your doctor or an urgent care clinic instead.',
      });
    cards.push(
      {
        id: 'e4', name: '988', number: '988', subtitle: 'Suicide & Crisis Lifeline', icon: 'alert-circle',
        description: 'Call or text 988 if you or someone you know is experiencing suicidal thoughts, a mental health crisis, or severe emotional distress. Counselors are available 24/7 and the service is free and confidential. This line is not intended for non-crisis mental health advice, physical emergencies, or general social services — for those, use 211 or 911 respectively.',
      },
      {
        id: 'e6', name: '211', number: '211', subtitle: 'Community & social services', icon: 'alert-circle',
        description: 'Dial 211 to be connected with local social support programs, including food banks, emergency housing, utility assistance, mental health resources, child care, and disaster relief. This is the right number for navigating community resources. It is not for medical or police emergencies, and response times may vary by region.',
      },
      {
        id: 'e5', name: local311?.phone || '311', number: local311?.phone || '311',
        subtitle: local311
          ? `${local311.county} ${local311.has311 ? '311 service' : 'non-emergency services'}`
          : 'Non-emergency city services',
        icon: 'alert-circle',
        description: local311
          ? `Call this ${local311.county} number for non-urgent local government services and issues such as noise complaints, potholes, broken streetlights, graffiti, or illegal dumping. Do not use it for emergencies — call 911 when there is an immediate threat to life, safety, or property.`
          : 'Dial 311 to report non-urgent city issues such as noise complaints, potholes, broken streetlights, graffiti, illegal dumping, or to ask questions about local government services. Do not call 311 for emergencies — if there is any immediate threat to life, safety, or property, call 911 instead.',
      },
    );
    return cards;
  }, [e911CardNumber, local311, localNums]);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter((c: any) => c.name.toLowerCase().includes(q) || c.number.includes(searchQuery));
  }, [contacts, searchQuery]);

  const filteredRecent = useMemo(() => {
    let list = recentCalls;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q) || e.number.includes(searchQuery));
    }
    if (filterValue === 'incoming') list = list.filter((e) => e.types.some((t) => t === 1));
    else if (filterValue === 'outgoing') list = list.filter((e) => e.types.some((t) => t === 2));
    else if (filterValue === 'missed') list = list.filter((e) => e.types.some((t) => t === 3 || t === 5));
    return withDateSeparators(list);
  }, [recentCalls, searchQuery, filterValue]);

  const searchInputWidth = searchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 176] });
  const showTools = activeTab === 'contacts' || activeTab === 'recent' || activeTab === 'chat';

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {/* Horizontal pager */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={onPagerMomentumEnd}
        style={{ flex: 1 }}
        onLayout={() => {
          if (!initialScrollDone.current) {
            initialScrollDone.current = true;
            const targetTab = pendingInitialTabRef.current || 'chat';
            pendingInitialTabRef.current = null;
            snapToInnerTab(targetTab, false);
          }
        }}
      >
        {/* Page 0: Emergency */}
        <EmergencyDirectoryPage
          screenWidth={screenWidth} styles={styles} emergencyCards={emergencyCards}
          expandedEmergencyId={expandedEmergencyId} setExpandedEmergencyId={setExpandedEmergencyId}
          colors={colors} openE911={openE911} e911CardNumber={e911CardNumber}
          makeCall={makeCall} navigateToSmsChat={navigateToSmsChat}
        />

        {/* Page 1: Chat */}
        <View style={{ width: screenWidth }}>
          <ChatListTab colors={colors} navigation={navigation} searchQuery={searchQuery} deepSearch={deepSearch} />
        </View>

        {/* Page 2: Recent */}
        <RecentCallsPage
          screenWidth={screenWidth} styles={styles} filteredRecent={filteredRecent} setScrolled={setScrolled}
          contacts={contacts} expandedRecentId={expandedRecentId} setExpandedRecentId={setExpandedRecentId}
          colors={colors} makeCall={makeCall} handleVideoCall={handleVideoCall} navigateToSmsChat={navigateToSmsChat}
          setEditingContact={setEditingContact} setAddContactVisible={setAddContactVisible}
        />

        {/* Page 3: Keypad */}
        <View style={{ width: screenWidth }}>
          <View style={styles.dialerContainer}>
            <PhoneDialer onCallPress={(num) => makeCall(num, num)} contacts={contacts} onAddContactPress={(num) => { setEditingContact({ id: '', name: '', number: num }); setAddContactVisible(true); }} />
          </View>
        </View>

        {/* Page 4: Contacts */}
        <ContactsPage
          screenWidth={screenWidth} styles={styles} filteredContacts={filteredContacts} setScrolled={setScrolled}
          expandedContactId={expandedContactId} setExpandedContactId={setExpandedContactId} colors={colors}
          makeCall={makeCall} handleVideoCall={handleVideoCall} navigateToSmsChat={navigateToSmsChat}
          setEditingContact={setEditingContact} setAddContactVisible={setAddContactVisible} searchQuery={searchQuery}
        />

        {/* Ghost page — swiping past Contacts navigates to Settings */}
        <View style={{ width: screenWidth, flex: 1, backgroundColor: colors.background }} />
      </ScrollView>

      {/* Floating action bar top-right: [Search] [Filter] [Settings] */}
      <View style={[styles.actionWrap, (scrolled || searchVisible) && styles.actionWrapScrolled]} pointerEvents="box-none">
        {showTools && (
          <>
            <Animated.View style={[styles.searchPill, searchVisible && styles.searchPillOpen, { width: searchInputWidth }]}>
              {searchVisible && (
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onBlur={closeSearch}
                  placeholder={activeTab === 'chat' ? 'Search chats…' : 'Search contacts…'}
                  placeholderTextColor={colors.textSecondary}
                  returnKeyType="search"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              )}
            </Animated.View>
            {activeTab === 'chat' && searchVisible && (
              <TouchableOpacity
                style={[styles.iconBtn, (scrolled || searchVisible) && styles.iconBtnScrolled, deepSearch && styles.iconBtnActive]}
                onPress={() => setDeepSearch((v) => !v)}
              >
                <Ionicons name="layers-outline" size={16} color={deepSearch ? '#60a5fa' : colors.textPrimary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.iconBtn, (scrolled || searchVisible) && styles.iconBtnScrolled]} onPress={searchVisible ? closeSearch : openSearch}>
              <Ionicons name={searchVisible ? 'close' : 'search-outline'} size={19} color={colors.textPrimary} />
            </TouchableOpacity>
          </>
        )}
        {activeTab === 'contacts' && !searchVisible && (
          <TouchableOpacity style={[styles.iconBtn, (scrolled || searchVisible) && styles.iconBtnScrolled]} onPress={() => { console.log('[CommunicationHubScreen] plus tapped'); setEditingContact(null); setAddContactVisible(true); }}>
            <Ionicons name="add" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        {!searchVisible && (
          <TouchableOpacity style={[styles.iconBtn, (scrolled || searchVisible) && styles.iconBtnScrolled]} onPress={goToSettings}>
            <Ionicons name="settings-outline" size={19} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Deep search tooltip — dismisses on any tap */}
      {deepSearchTooltip && activeTab === 'chat' && searchVisible && (
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setDeepSearchTooltip(false)}
        >
          <View style={styles.tooltipBubble}>
            <Text style={styles.tooltipText}>Search through all messages</Text>
            <View style={styles.tooltipArrow} />
          </View>
        </TouchableOpacity>
      )}

      <AddContactModal
        visible={addContactVisible}
        initialContact={editingContact}
        onClose={() => { setAddContactVisible(false); setEditingContact(null); }}
        onSaved={() => { setAddContactVisible(false); setEditingContact(null); loadContactsData(); }}
      />

      {/* Filter dropdown — recent calls only */}
      {filterVisible && (
        <View style={styles.filterDropdown} pointerEvents="box-none">
          {[{ label: 'All', value: '' }, { label: 'Incoming', value: 'incoming' }, { label: 'Outgoing', value: 'outgoing' }, { label: 'Missed', value: 'missed' }].map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.filterOption, filterValue === opt.value && styles.filterOptionActive]}
              onPress={() => { setFilterValue(opt.value); setFilterVisible(false); }}
            >
              <Text style={[styles.filterOptionText, filterValue === opt.value && styles.filterOptionTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Floating pill tab bar */}
      <FloatingTabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </SafeAreaView>
  );
}
