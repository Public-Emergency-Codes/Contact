import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DeviceEventEmitter,
  FlatList, NativeModules, TouchableOpacity, View, StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import * as Contacts from 'expo-contacts/legacy';
import AppText from '../../components/AppText';
import { RootState } from '../../store';
import { formatPhoneNumber, normalizePhoneLookup } from '../../utils/phoneFormat';

const Text = AppText;
const { SmsReader } = NativeModules;

export interface Thread {
  threadId: string;
  address: string;
  snippet: string;
  date: number;
  read: boolean;
  type: number;
  contactName?: string;
}

function formatDate(ts: number): string {
  const diff = Date.now() - ts;
  const h = diff / 3_600_000;
  if (h < 1) return `${Math.round(diff / 60000)}m`;
  const d = new Date(ts);
  const now = new Date();
  if (d.getDate() === now.getDate() && h < 24)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (h < 48) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Format a raw phone number for display — e.g. "+1234567890" → "(123) 456-7890" */
export default function ChatListTab({ colors, navigation, searchQuery = '', deepSearch = false }: { colors: any; navigation?: any; searchQuery?: string; deepSearch?: boolean }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [deepSearchThreadIds, setDeepSearchThreadIds] = useState<Set<string>>(new Set());
  const [deepSearchLoading, setDeepSearchLoading] = useState(false);

  const loadThreads = useCallback(async () => {
    if (!SmsReader) { setLoading(false); return; }
    try {
      const raw: Thread[] = await SmsReader.getThreads(60);

      // Try to resolve contact names
      let nameMap: Record<string, string> = {};
      try {
        const { status } = await Contacts.getPermissionsAsync();
        if (status === 'granted') {
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
          });
          for (const c of data) {
            for (const ph of c.phoneNumbers ?? []) {
              const norm = normalizePhoneLookup(ph.number ?? '');
              if (norm) nameMap[norm] = c.name ?? '';
            }
          }
        }
      } catch {}

      setThreads(raw.map(t => ({
        ...t,
        contactName: nameMap[normalizePhoneLookup(t.address)] || undefined,
      })));
    } catch (e) {
      console.warn('SmsReader.getThreads failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload threads every time this screen gains focus (e.g. after sending
  // a message in ChatWindow and navigating back).
  useFocusEffect(
    useCallback(() => {
      loadThreads();
    }, [loadThreads]),
  );

  // Reload threads when a new SMS arrives (native SmsDeliverReceiver
  // emits onSmsReceived via DeviceEventEmitter after writing to provider)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onSmsReceived', () => {
      loadThreads();
    });
    return () => sub.remove();
  }, [loadThreads]);

  // Also reload when an MMS arrives (native WapPushReceiver downloads
  // and emits onMmsReceived after storing in the provider)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onMmsReceived', () => {
      // Small delay so the MMS download & provider write complete first
      setTimeout(() => loadThreads(), 1500);
    });
    return () => sub.remove();
  }, [loadThreads]);

  // Deep search: query native SMS provider for threads matching the search term
  useEffect(() => {
    if (!deepSearch || !searchQuery.trim() || !SmsReader?.searchMessages) {
      setDeepSearchThreadIds(new Set());
      setDeepSearchLoading(false);
      return;
    }
    let cancelled = false;
    setDeepSearchLoading(true);
    SmsReader.searchMessages(searchQuery, 200)
      .then((ids: string[]) => {
        if (!cancelled) {
          setDeepSearchThreadIds(new Set(ids));
          setDeepSearchLoading(false);
        }
      })
      .catch((e: any) => {
        console.warn('SmsReader.searchMessages failed:', e);
        if (!cancelled) {
          setDeepSearchThreadIds(new Set());
          setDeepSearchLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [deepSearch, searchQuery]);

  const { archivedThreadIds, starredThreadIds, readThreadIds } = useSelector(
    (state: RootState) => state.conversation,
  );

  const visibleThreads = useMemo(() => {
    // Filter out archived threads; starred threads sorted to top
    let filtered = threads.filter((t) => !archivedThreadIds.includes(t.threadId));
    // Apply search query
    if (searchQuery.trim()) {
      if (deepSearch && deepSearchThreadIds.size > 0) {
        // Deep search: only show threads whose messages contain the query
        filtered = filtered.filter((t) => deepSearchThreadIds.has(t.threadId));
      } else if (deepSearch && deepSearchLoading) {
        // Still loading deep search results — keep current filtered list (don't clear)
      } else {
        // Shallow search: match snippet, contact name, or address
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter((t) =>
          (t.contactName || '').toLowerCase().includes(q) ||
          t.address.toLowerCase().includes(q) ||
          (t.snippet || '').toLowerCase().includes(q),
        );
      }
    }
    filtered.sort((a, b) => {
      const aStarred = starredThreadIds.includes(a.threadId);
      const bStarred = starredThreadIds.includes(b.threadId);
      if (aStarred && !bStarred) return -1;
      if (!aStarred && bStarred) return 1;
      return b.date - a.date; // then by date desc
    });
    return filtered;
  }, [threads, archivedThreadIds, starredThreadIds, searchQuery, deepSearch, deepSearchThreadIds, deepSearchLoading]);

  const openThread = useCallback((thread: Thread) => {
    if (navigation) {
      navigation.navigate('ChatWindow', {
        threadId: thread.threadId,
        address: thread.address,
        contactName: thread.contactName,
      });
    }
  }, [navigation]);

  const s = styles(colors);

  if (loading) {
    return <View style={s.center}><Text style={s.sub}>Loading chats…</Text></View>;
  }
  if (!SmsReader) {
    return <View style={s.center}><Text style={s.sub}>SMS reader unavailable.</Text></View>;
  }
  if (visibleThreads.length === 0) {
    if (deepSearch && deepSearchLoading) {
      return <View style={s.center}><Text style={s.sub}>Searching all messages…</Text></View>;
    }
    return <View style={s.center}><Text style={s.sub}>{searchQuery ? 'No chats match.' : 'No messages yet.'}</Text></View>;
  }

  return (
    <FlatList
      data={visibleThreads}
      keyExtractor={t => t.threadId}
      contentContainerStyle={s.list}
      renderItem={({ item }) => {
        const name = item.contactName || formatPhoneNumber(item.address);
        const saved = !!item.contactName;
        const isStarred = starredThreadIds.includes(item.threadId);
        const isUnread = !item.read && !readThreadIds.includes(item.threadId);
        return (
          <TouchableOpacity
            style={[s.card, isUnread && s.cardUnread]}
            onPress={() => openThread(item)}
            activeOpacity={0.85}
          >
            <View style={s.cardRow}>
              <View style={s.avatar}>
                {saved ? (
                  <Text style={s.avatarText}>{item.contactName![0].toUpperCase()}</Text>
                ) : (
                  <Ionicons name="person" size={18} color="#fff" />
                )}
              </View>
              <View style={s.rowCenter}>
                <View style={s.topRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    {isStarred && (
                      <Text style={{ fontSize: 12, marginRight: 4 }}>⭐</Text>
                    )}
                    <Text style={[s.rowName, isUnread && s.nameBold, !isUnread && s.readNameDim]} numberOfLines={1}>{name}</Text>
                  </View>
                  <Text style={[s.time, !isUnread && s.timeDim]}>{formatDate(item.date)}</Text>
                </View>
                <Text style={[s.rowSub, isUnread && s.snippetBold, !isUnread && s.rowSubDim]} numberOfLines={1}>
                  {item.type === 2 ? `You: ${item.snippet}` : item.snippet}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const TOP_PAD = 56;

const styles = (c: any) => StyleSheet.create({
  list:        { paddingTop: TOP_PAD, paddingBottom: 110 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sub:         { color: c.textSecondary, fontSize: 14 },
  // card — matches CommunicationHubScreen contactCard
  card:        { borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, marginHorizontal: 12, marginVertical: 4, paddingHorizontal: 16, paddingVertical: 12 },
  cardUnread:  { backgroundColor: c.surfaceAlt },
  cardRow:     { flexDirection: 'row', alignItems: 'center' },
  avatar:      { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt, marginRight: 12, flexShrink: 0 },
  avatarText:  { color: '#fff', fontWeight: '700' },
  rowCenter:   { flex: 1 },
  topRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowName:     { color: c.textPrimary, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  nameBold:    { fontWeight: '700' },
  readNameDim: { color: c.textSecondary },
  time:        { color: c.textSecondary, fontSize: 12, marginLeft: 8, flexShrink: 0 },
  timeDim:     { color: c.textMuted },
  rowSub:      { color: c.textSecondary, fontSize: 12, marginTop: 2 },
  rowSubDim:   { color: c.textMuted },
  snippetBold: { color: c.textPrimary, fontWeight: '600' },
});
