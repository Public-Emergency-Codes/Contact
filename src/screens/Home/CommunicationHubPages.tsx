import React from 'react';
import { FlatList, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../components/AppText';
import { formatPhoneNumber } from '../../utils/phoneFormat';

const Text = AppText;

export function EmergencyDirectoryPage(props: any) {
  const { screenWidth, styles, emergencyCards, expandedEmergencyId, setExpandedEmergencyId, colors,
    openE911, e911CardNumber, makeCall, navigateToSmsChat, edit311Contact } = props;
  return (
<View style={{ width: screenWidth }}>
          <ScrollView contentContainerStyle={styles.emergencyTabList}>
            {emergencyCards.map((item) => {
              const expanded = expandedEmergencyId === item.id;
              const isE911 = item.id === 'e1';
              const smsCapable = ['e4', 'e6'].includes(item.id);
              const is311 = item.id === 'e5';
              const callable = item.callable !== false;
              return (
                <View key={item.id} style={styles.contactCard}>
                  <TouchableOpacity
                    style={styles.contactHeaderRow}
                    onPress={() => setExpandedEmergencyId((prev) => (prev === item.id ? null : item.id))}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={item.icon as any} size={24} color="#ef4444" style={{ marginRight: 12 }} />
                    <View style={styles.rowCenter}>
                      <Text style={[styles.rowName, isE911 && { color: '#ef4444' }]}>{item.name}</Text>
                      <Text style={styles.rowSub}>{item.subtitle}</Text>
                    </View>
                    <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {expanded && (
                    <View style={styles.contactExpandedArea}>
                      <Text style={[styles.contactDetailText, { lineHeight: 20, marginBottom: 14 }]}>{item.description}</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' }}>
                        {isE911 && (
                          <TouchableOpacity
                            style={styles.emergencyActionBtn}
                            onPress={() => openE911({
                              source: 'home_emergency_card',
                              emergencyNumber: e911CardNumber,
                              autoInitiateCall: true,
                              withVideo: true,
                              startNewSession: true,
                            })}
                            accessibilityLabel="Start 911 call with video recording"
                          >
                            <Ionicons name="videocam" size={22} color="#fff" />
                          </TouchableOpacity>
                        )}
                        {callable && <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => { if (isE911) { openE911({ source: 'home_emergency_card', emergencyNumber: e911CardNumber, autoInitiateCall: true, startNewSession: true }); } else { makeCall(item.number, item.name); } }}>
                          <Ionicons name="call" size={22} color="#fff" />
                        </TouchableOpacity>}
                        {isE911 && (
                          <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => openE911({ source: 'home_emergency_card', emergencyNumber: e911CardNumber, showInitiateCallButton: true })}>
                            <Ionicons name="chatbox" size={22} color="#fff" />
                          </TouchableOpacity>
                        )}
                        {smsCapable && (
                          <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => navigateToSmsChat(item.number)}>
                            <Ionicons name="chatbox" size={22} color="#fff" />
                          </TouchableOpacity>
                        )}
                        {is311 && (
                          <TouchableOpacity style={styles.emergencyActionBtn} onPress={edit311Contact} accessibilityLabel="Correct county service number in phone contacts">
                            <Ionicons name="pencil" size={22} color="#fff" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
  );
}

export function RecentCallsPage(props: any) {
  const { screenWidth, styles, filteredRecent, setScrolled, contacts, expandedRecentId, setExpandedRecentId,
    colors, makeCall, handleVideoCall, navigateToSmsChat, setEditingContact, setAddContactVisible } = props;
  return (
<View style={{ width: screenWidth }}>
          <FlatList
            data={filteredRecent}
            keyExtractor={(item, idx) => ((item as any)._sep ? (item as any).id : (item as any).id || `r-${idx}`)}
            contentContainerStyle={styles.listContent}
            onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 10)}
            scrollEventThrottle={16}
            renderItem={({ item }) => {
              if ((item as any)._sep) {
                return <Text style={styles.dateSeparator}>{(item as any).label}</Text>;
              }
              const entry = item as any;
              const phone = entry.number || '';
              const phoneDigits = phone.replace(/\D/g, '');
              const phoneMatch = phoneDigits.length > 10 ? phoneDigits.slice(-10) : phoneDigits;
              const matchingContact = contacts.find((c: any) => {
                const cDigits = c.number.replace(/\D/g, '');
                const cMatch = cDigits.length > 10 ? cDigits.slice(-10) : cDigits;
                return cMatch === phoneMatch;
              });
              const displayName = matchingContact ? matchingContact.name : formatPhoneNumber(phone);
              const avatarLetter = matchingContact ? (matchingContact.name || '?').slice(0, 1).toUpperCase() : '';
              const expanded = expandedRecentId === entry.id;
              const missed = entry.types?.some((t: number) => t === 3 || t === 5);
              return (
                <View style={styles.contactCard}>
                  <TouchableOpacity
                    style={styles.contactHeaderRow}
                    onPress={() => setExpandedRecentId((prev) => (prev === entry.id ? null : entry.id))}
                    activeOpacity={0.85}
                  >
                    <View style={styles.avatar}>
                      {matchingContact ? (
                        <Text style={styles.avatarText}>{avatarLetter}</Text>
                      ) : (
                        <Ionicons name="person" size={19} color="#fff" />
                      )}
                    </View>
                    <View style={styles.rowCenter}>
                      <Text style={styles.rowName}>{displayName}</Text>
                      <View style={styles.recentMeta}>
                        {entry.types?.slice(0, 3).map((t: number, i: number) => (
                          <Ionicons key={i} name={t === 2 ? 'arrow-up-outline' : 'arrow-down-outline'} size={11}
                            color={t === 3 || t === 5 ? '#ef4444' : t === 1 ? '#4ade80' : colors.textSecondary} />
                        ))}
                        {entry.count > 1 && <Text style={styles.recentCount}>({entry.count})</Text>}
                      </View>
                    </View>
                    <Text style={[styles.recentDate, missed && { color: '#ef4444' }]}>
                      {entry.date ? new Date(entry.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                    </Text>
                  </TouchableOpacity>
                  {expanded && (
                    <View style={styles.contactExpandedArea}>
                      <Text style={styles.contactDetailText}>{formatPhoneNumber(phone)}</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginTop: 8, gap: 8 }}>
                        <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => makeCall(phone, displayName)}>
                          <Ionicons name="call" size={22} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => handleVideoCall(phone)}>
                          <Ionicons name="videocam" size={22} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => navigateToSmsChat(phone, displayName)}>
                          <Ionicons name="chatbox" size={22} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      {!matchingContact && (
                        <TouchableOpacity
                          style={[styles.emergencyActionBtn, { marginTop: 8, flexDirection: 'row', gap: 6, width: 'auto', paddingHorizontal: 16 }]}
                          onPress={() => {
                            setEditingContact({ name: '', number: phone } as any);
                            setAddContactVisible(true);
                          }}
                        >
                          <Ionicons name="person-add-outline" size={18} color="#fff" />
                          <Text style={{ color: '#fff', fontSize: 13 }}>Add to Contacts</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>No recent calls.</Text>}
          />
        </View>
  );
}

export function ContactsPage(props: any) {
  const { screenWidth, styles, filteredContacts, setScrolled, expandedContactId, setExpandedContactId,
    colors, makeCall, handleVideoCall, navigateToSmsChat, setEditingContact, setAddContactVisible, searchQuery } = props;
  return (
<View style={{ width: screenWidth }}>
          <FlatList
            data={filteredContacts}
            keyExtractor={(item, i) => (item as any).id || `c-${i}`}
            contentContainerStyle={styles.listContent}
            onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 10)}
            scrollEventThrottle={16}
            renderItem={({ item }) => {
              const name = item.name || 'Unknown';
              const phone = item.number || '';
              const label = item.subtitle || '';
              const contactId = item.id || `${name}-${phone}`;
              const expanded = expandedContactId === contactId;
              const details = [item.email, item.company, item.jobTitle, item.address, item.birthday, item.note].filter(Boolean);
              return (
                <View style={styles.contactCard}>
                  <TouchableOpacity
                    style={styles.contactHeaderRow}
                    onPress={() => setExpandedContactId((prev) => (prev === contactId ? null : contactId))}
                    onLongPress={() => { if (!item.id) return; setEditingContact({ id: item.id, name, number: phone }); setAddContactVisible(true); }}
                    delayLongPress={240}
                    activeOpacity={0.85}
                  >
                    <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
                    <View style={styles.rowCenter}>
                      <Text style={styles.rowName}>{name}</Text>
                      {label ? <Text style={styles.contactLabel}>{label}</Text> : null}
                    </View>
                    <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {expanded && (
                    <View style={styles.contactExpandedArea}>
                      <Text style={styles.contactDetailText}>{formatPhoneNumber(phone)}</Text>
                      {details.length > 0 && details.map((line: string, index: number) => (
                        <Text key={`${contactId}-detail-${index}`} style={styles.contactDetailText}>{line}</Text>
                      ))}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginTop: 10 }}>
                        <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => makeCall(phone, name)}>
                          <Ionicons name="call" size={22} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => handleVideoCall(phone)}>
                          <Ionicons name="videocam" size={22} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => navigateToSmsChat(phone, name)}>
                          <Ionicons name="chatbox" size={22} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.emergencyActionBtn} onPress={() => { if (!item.id) return; setEditingContact({ id: item.id, name, number: phone }); setAddContactVisible(true); }}>
                          <Ionicons name="pencil" size={22} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyText}>{searchQuery ? 'No contacts match.' : 'No contacts yet.'}</Text>}
          />
        </View>
  );
}
