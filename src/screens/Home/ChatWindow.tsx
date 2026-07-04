import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Clipboard, DeviceEventEmitter, Keyboard, NativeModules, Share, ToastAndroid,
  Modal, ScrollView, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
// @ts-ignore
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts/legacy';
import AppText from '../../components/AppText';
import ChatMenuDropdown from '../../components/ChatMenuDropdown';
import { useTheme } from '../../context/ThemeContext';
import { makeStyles } from './chatWindowStyles';
import ChatMessageList from './ChatMessageList';
import ChatSearchBar from './ChatSearchBar';
import ChatInputBar from './ChatInputBar';
import AddPeopleModal from './AddPeopleModal';
import FullScreenChatMediaViewer from './FullScreenChatMediaViewer';
import { useChatMenuItems } from './useChatMenuItems';
import { useAttachmentPicker } from '../../hooks/useAttachmentPicker';
import { formatPhoneNumber } from '../../utils/phoneFormat';
import { placeContactCall } from '../../services/contactActionService';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { starMessage, unstarMessage, markThreadRead } from '../../store/slices/conversationSlice';
import {
  isDirectSmsAvailable,
  sendDirectMmsAttachments,
  sendDirectSmsText,
} from '../../services/directSmsMediaService';

const Text = AppText;
const { SmsReader, DirectSms, SmsWriter } = NativeModules;

interface SmsMsg {
  id: string;
  body: string;
  date: number;
  type: number; // 1=inbox 2=sent
  imageUri?: string;
  mediaMime?: string;
}

function hasVisibleMessageContent(msg: SmsMsg): boolean {
  return !!msg.imageUri || !!msg.body?.trim();
}

/** Format a raw phone number for display — e.g. "+1234567890" → "(123) 456-7890" */
interface Props {
  navigation: any;
  route: { params: { threadId: string; address: string; contactName?: string } };
}

export default function ChatWindow({ navigation, route }: Props) {
  const { threadId, address, contactName } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = makeStyles(colors);

  const [messages, setMessages] = useState<SmsMsg[]>([]);
  const [deletedMediaMessageIds, setDeletedMediaMessageIds] = useState<string[]>([]);
  const [selectedMediaMessageId, setSelectedMediaMessageId] = useState<string | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [sending, setSending] = useState(false);
  const [resolvedContactName, setResolvedContactName] = useState<string | undefined>(contactName);
  const title = resolvedContactName || formatPhoneNumber(address);
  const dispatch = useAppDispatch();
  const starredMessageIds = useAppSelector(state => state.conversation.starredMessageIds);
  const selectedMessages = useMemo(
    () => selectedMessageIds
      .map(id => messages.find(message => message.id === id))
      .filter(Boolean) as SmsMsg[],
    [messages, selectedMessageIds],
  );
  const selectionMode = selectedMessageIds.length > 0;

  // ── Resolve contact name from device contacts if not provided ─────────
  useEffect(() => {
    if (contactName) return; // already have it
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Contacts.getPermissionsAsync();
        if (status !== 'granted') return;
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });
        if (cancelled) return;
        const normAddr = address.replace(/[^+\d]/g, '');
        for (const c of data) {
          for (const ph of c.phoneNumbers ?? []) {
            const norm = (ph.number ?? '').replace(/[^+\d]/g, '');
            if (norm === normAddr) {
              setResolvedContactName(c.name ?? undefined);
              return;
            }
          }
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [contactName, address]);

  const loadMessages = useCallback(async () => {
    if (!SmsReader) return;
    try {
      const raw: SmsMsg[] = await SmsReader.getMessages(threadId, 100);
      const dbMessages: SmsMsg[] = [...raw].reverse();

      let cachedIncomingMms: SmsMsg[] = [];
      try {
        if (typeof SmsReader.getCachedIncomingMms === 'function') {
          cachedIncomingMms = await SmsReader.getCachedIncomingMms(address, 50);
        }
      } catch (_) {}

      // Load persisted sent images (MMS not readable from content://mms)
      let persistedImages: SmsMsg[] = [];
      try {
        const json = await AsyncStorage.getItem(`pending_images_${threadId}`);
        if (json) persistedImages = JSON.parse(json);
      } catch (_) {}

      // Merge DB messages with persisted images, deduplicating by date+body
      const allMessages = [...dbMessages];
      for (const cached of cachedIncomingMms) {
        const isDuplicate = allMessages.some(
          m => (m.id === cached.id) ||
            (m.type === 1 && m.imageUri && Math.abs(m.date - cached.date) < 5000)
        );
        if (!isDuplicate) allMessages.push(cached);
      }
      for (const img of persistedImages) {
        const isDuplicate = allMessages.some(
          m => m.body === img.body && Math.abs(m.date - img.date) < 5000
        );
        if (!isDuplicate) allMessages.push(img);
      }
      allMessages.sort((a, b) => a.date - b.date);
      const visibleMessages = allMessages.filter(hasVisibleMessageContent);

      // Merge with existing optimistic messages — keep them until the
      // SMS/MMS database catches up and deduplication removes them.
      setMessages(prev => {
        const optimistic = prev.filter(m => m.id.startsWith('local-') && hasVisibleMessageContent(m));
        const localToKeep = optimistic.filter(local =>
          !visibleMessages.some(db => db.body === local.body && Math.abs(db.date - local.date) < 5000)
        );
        return [...visibleMessages, ...localToKeep].filter(m => !deletedMediaMessageIds.includes(m.id));
      });
    } catch (e) {
      console.warn('[ChatWindow] getMessages failed:', e);
    }
  }, [threadId, address, deletedMediaMessageIds]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Mark the thread as read in the system SMS provider so the chat-list
  // card instantly reflects the read state when navigating back.
  useEffect(() => {
    dispatch(markThreadRead(threadId));
    if (SmsReader?.markThreadRead) {
      SmsReader.markThreadRead(threadId).catch(() => {});
    }
  }, [threadId, dispatch]);

  // Reload messages when a new SMS arrives for this conversation
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'onSmsReceived',
      (event: { address: string }) => {
        const normCurrent = address.replace(/\D/g, '');
        const normIncoming = (event.address || '').replace(/\D/g, '');
        if (normIncoming && normCurrent.endsWith(normIncoming.slice(-10)) || normIncoming.endsWith(normCurrent.slice(-10))) {
          loadMessages();
        }
      },
    );
    return () => sub.remove();
  }, [address, loadMessages]);

  // Reload when an MMS arrives (WapPushReceiver downloads & emits onMmsReceived)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('onMmsReceived', () => {
      setTimeout(() => loadMessages(), 1500);
    });
    return () => sub.remove();
  }, [loadMessages]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const {
    pickerOpen, setPickerOpen, pickImage, pickVideo, pickDocument, pickContact,
    addAttachment, pendingAttachments, clearAttachments,
  } = useAttachmentPicker(address);

  // Consume shared content from external apps (ACTION_SEND intent)
  useFocusEffect(useCallback(() => {
    const ps = (globalThis as any).__pendingShare;
    console.log('[ChatWindow] focused; __pendingShare:', JSON.stringify(ps));
    if (!ps) return;

    // Consume before updating state so a focus transition cannot queue it twice.
    delete (globalThis as any).__pendingShare;
    if (ps.uris?.length) {
      const uris: string[] = ps.uris;
      const mimeType: string = ps.mimeType || '*/*';
      console.log('[ChatWindow] calling addAttachment for', uris.length, 'file(s), mime=', mimeType);
      uris.forEach((uri: string) => addAttachment(uri, mimeType));
    } else if (ps.text) {
      console.log('[ChatWindow] pre-filling shared text');
      setText(ps.text);
    }
  }, [addAttachment]));

  const handlePickContact = useCallback(async () => {
    const phone = await pickContact();
    if (phone) { setText(phone); setPickerOpen(false); }
  }, [pickContact]);

  const handleSend = useCallback(async () => {
    const msg = text.trim();
    const hasAttachments = pendingAttachments.length > 0;
    if (sending || (!msg && !hasAttachments) || !isDirectSmsAvailable()) return;

    // Build optimistic messages for UI
    const firstImageUri = hasAttachments ? pendingAttachments[0].uri : undefined;
    const optimistic: SmsMsg = {
      id: `local-${Date.now()}`,
      body: msg || '',
      date: Date.now(),
      type: 2,
      imageUri: firstImageUri,
      mediaMime: hasAttachments ? pendingAttachments[0].mimeType : undefined,
    };
    setMessages(prev => {
      // Deduplicate — don't add if already in list
      if (prev.some(m => m.body === msg && m.date > Date.now() - 5000)) return prev;
      return [...prev, optimistic];
    });
    setText('');
    setSending(true);

    try {
      // Send text as SMS first (guaranteed delivery)
      if (msg && !hasAttachments) {
        await sendDirectSmsText(address, msg, threadId);
      }

      // Send images via PDU carrier MMS
      if (hasAttachments) {
        try {
          await sendDirectMmsAttachments(address, msg, pendingAttachments);
          clearAttachments();
          // Persist sent image so it survives screen changes (MMS not
          // readable from content://mms on this device).
          if (firstImageUri) {
            const key = `pending_images_${threadId}`;
            const existing = await AsyncStorage.getItem(key);
            const list: SmsMsg[] = existing ? JSON.parse(existing) : [];
            list.push(optimistic);
            await AsyncStorage.setItem(key, JSON.stringify(list));
          }
        } catch (mmsErr: any) {
          console.warn('[ChatWindow] MMS failed:', mmsErr?.message);
          throw mmsErr;
        }
      }
    } catch (e: any) {
      setMessages(prev => prev.filter(message => message.id !== optimistic.id));
      setText(msg);
      console.warn('[ChatWindow] send failed:', e?.message);
      Alert.alert('Send Failed', e?.message || 'Could not send message. Please try again.');
    } finally {
      setSending(false);
      // Reload after a short delay so the SMS database has time to update
      setTimeout(() => loadMessages(), 3000);
    }
  }, [text, address, threadId, loadMessages, pendingAttachments, clearAttachments, sending]);

  const handleCall = useCallback(() => {
    void placeContactCall(address);
  }, [address]);

  // ── 3-dot menu state ───────────────────────────────────────────────────
  const [menuVisible, setMenuVisible] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addPeopleVisible, setAddPeopleVisible] = useState(false);
  const [starredMessagesVisible, setStarredMessagesVisible] = useState(false);
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(null);

  const handleTrash = useCallback(() => {
    Alert.alert(
      'Delete Entire Conversation',
      'Are you sure you want to permanently delete this entire conversation? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (SmsWriter) await SmsWriter.deleteThread(threadId);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete conversation.');
            }
          },
        },
      ],
    );
  }, [threadId, navigation]);

  const handleUnsubscribe = useCallback(async () => {
    if (!DirectSms) return;
    try {
      await DirectSms.sendSms(address, 'STOP', threadId);
      Alert.alert('Sent', 'An unsubscribe request (STOP) has been sent.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send STOP message.');
    }
  }, [address]);

  const handleBlock = useCallback(() => {
    if (!SmsWriter) {
      Alert.alert('Not available', 'Blocking is not available on this device.');
      return;
    }
    Alert.alert(
      'Block & Report Spam',
      `Block ${address} and report as spam? They will not be able to call or text you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await SmsWriter.blockNumber(address);
              Alert.alert('Blocked', `${address} has been blocked and reported as spam.`);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to block number.');
            }
          },
        },
      ],
    );
  }, [address]);

  const handleAddPeople = useCallback(() => {
    setAddPeopleVisible(true);
  }, []);

  const handleOpenStarredMessages = useCallback(() => {
    setStarredMessagesVisible(true);
  }, []);

  const menuItems = useChatMenuItems({
    threadId,
    address,
    contactName,
    navigation,
    setSearchActive,
    onTrash: handleTrash,
    onBlock: handleBlock,
    onUnsubscribe: handleUnsubscribe,
    onAddPeople: handleAddPeople,
    onStarredMessages: handleOpenStarredMessages,
  });

  // ── Search filter ──────────────────────────────────────────────────────
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => m.body.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const mediaMessages = useMemo(
    () => messages.filter(m => !!m.imageUri && !deletedMediaMessageIds.includes(m.id)),
    [messages, deletedMediaMessageIds],
  );

  const starredMessages = useMemo(
    () => messages.filter(message => starredMessageIds.includes(message.id)),
    [messages, starredMessageIds],
  );

  const handleDeleteMediaMessage = useCallback(async (message: SmsMsg) => {
    setDeletedMediaMessageIds(prev => (prev.includes(message.id) ? prev : [...prev, message.id]));
    setMessages(prev => prev.filter(m => m.id !== message.id));
    if (message.id.startsWith('local-')) {
      try {
        const key = `pending_images_${threadId}`;
        const json = await AsyncStorage.getItem(key);
        const list: SmsMsg[] = json ? JSON.parse(json) : [];
        await AsyncStorage.setItem(key, JSON.stringify(list.filter(m => m.id !== message.id)));
      } catch (_) {}
    }
  }, [threadId]);

  const handleToggleStarMediaMessage = useCallback((messageId: string) => {
    if (starredMessageIds.includes(messageId)) {
      dispatch(unstarMessage(messageId));
    } else {
      dispatch(starMessage(messageId));
    }
  }, [dispatch, starredMessageIds]);

  const clearMessageSelection = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);

  const toggleSelectedMessage = useCallback((messageId: string) => {
    setSelectedMessageIds(prev => (
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    ));
  }, []);

  const handleMessageLongPress = useCallback((messageId: string) => {
    setSelectedMessageIds(prev => (prev.includes(messageId) ? prev : [messageId]));
  }, []);

  const selectedText = useMemo(
    () => selectedMessages
      .filter(message => message.body?.trim())
      .map(message => message.body.trim())
      .join('\n\n'),
    [selectedMessages],
  );

  const handleCopySelectedMessages = useCallback(() => {
    if (!selectedText) {
      Alert.alert('Nothing to copy', 'The selected message has no text.');
      return;
    }
    Clipboard.setString(selectedText);
    ToastAndroid.show(
      selectedMessages.length === 1 ? 'Message copied' : 'Messages copied',
      ToastAndroid.SHORT,
    );
    clearMessageSelection();
  }, [clearMessageSelection, selectedMessages.length, selectedText]);

  const handleShareSelectedMessages = useCallback(async () => {
    const shareText = selectedText || selectedMessages
      .filter(message => !!message.imageUri)
      .map(message => message.imageUri)
      .join('\n');
    if (!shareText) {
      Alert.alert('Nothing to share', 'The selected message has no shareable content.');
      return;
    }
    try {
      await Share.share({ message: shareText, title: 'Share message' });
      clearMessageSelection();
    } catch {
      Alert.alert('Share failed', 'No app is available to share this message.');
    }
  }, [clearMessageSelection, selectedMessages, selectedText]);

  const handleToggleStarSelectedMessage = useCallback(() => {
    const messageId = selectedMessageIds[0];
    if (!messageId || selectedMessageIds.length !== 1) return;
    if (starredMessageIds.includes(messageId)) {
      dispatch(unstarMessage(messageId));
    } else {
      dispatch(starMessage(messageId));
    }
    clearMessageSelection();
  }, [clearMessageSelection, dispatch, selectedMessageIds, starredMessageIds]);

  const removeLocalMessageArtifacts = useCallback(async (messagesToRemove: SmsMsg[]) => {
    const localOrMediaIds = messagesToRemove
      .filter(message => message.id.startsWith('local-') || !!message.imageUri)
      .map(message => message.id);
    if (localOrMediaIds.length === 0) return;

    setDeletedMediaMessageIds(prev => Array.from(new Set([...prev, ...localOrMediaIds])));
    try {
      const key = `pending_images_${threadId}`;
      const json = await AsyncStorage.getItem(key);
      const list: SmsMsg[] = json ? JSON.parse(json) : [];
      await AsyncStorage.setItem(
        key,
        JSON.stringify(list.filter(message => !localOrMediaIds.includes(message.id))),
      );
    } catch (_) {}
  }, [threadId]);

  const deleteSelectedMessages = useCallback(async () => {
    const ids = selectedMessageIds;
    const messagesToDelete = selectedMessages;
    clearMessageSelection();
    ids.forEach(id => {
      if (starredMessageIds.includes(id)) dispatch(unstarMessage(id));
    });
    setMessages(prev => prev.filter(message => !ids.includes(message.id)));
    await removeLocalMessageArtifacts(messagesToDelete);

    const nativeDeleteIds = ids.filter(id => !id.startsWith('local-'));
    if (!SmsWriter?.deleteMessage || nativeDeleteIds.length === 0) return;

    const results = await Promise.allSettled(
      nativeDeleteIds.map(id => SmsWriter.deleteMessage(id)),
    );
    if (results.some(result => result.status === 'rejected')) {
      Alert.alert(
        'Delete warning',
        'Some messages were removed from this view but could not be deleted from the phone SMS database.',
      );
    }
  }, [
    clearMessageSelection,
    dispatch,
    removeLocalMessageArtifacts,
    selectedMessageIds,
    selectedMessages,
    starredMessageIds,
  ]);

  const handleDeleteSelectedMessages = useCallback(() => {
    if (selectedMessageIds.length === 0) return;
    Alert.alert(
      selectedMessageIds.length === 1 ? 'Delete message?' : `Delete ${selectedMessageIds.length} messages?`,
      'This removes the selected bubble from this conversation. Messages already stored by the phone may be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: deleteSelectedMessages,
        },
      ],
    );
  }, [deleteSelectedMessages, selectedMessageIds.length]);

  const singleSelectedIsStarred = selectedMessageIds.length === 1
    && starredMessageIds.includes(selectedMessageIds[0]);

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <View style={[s.header, selectionMode && s.selectionHeader, { paddingTop: insets.top + 6 }]}>
        {selectionMode ? (
          <>
            <TouchableOpacity
              onPress={clearMessageSelection}
              style={s.headerCallBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel message selection"
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={s.selectionHeaderCount}>
              <Text style={s.selectionHeaderTitle}>{selectedMessageIds.length}</Text>
            </View>
            <TouchableOpacity
              onPress={handleCopySelectedMessages}
              style={s.headerCallBtn}
              accessibilityRole="button"
              accessibilityLabel="Copy selected messages"
            >
              <Ionicons name="copy-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShareSelectedMessages}
              style={s.headerCallBtn}
              accessibilityRole="button"
              accessibilityLabel="Forward selected messages"
            >
              <Ionicons name="arrow-redo-outline" size={23} color={colors.textPrimary} />
            </TouchableOpacity>
            {selectedMessageIds.length === 1 ? (
              <TouchableOpacity
                onPress={handleToggleStarSelectedMessage}
                style={s.headerCallBtn}
                accessibilityRole="button"
                accessibilityLabel={singleSelectedIsStarred ? 'Unstar selected message' : 'Star selected message'}
              >
                <Ionicons
                  name={singleSelectedIsStarred ? 'star' : 'star-outline'}
                  size={23}
                  color={singleSelectedIsStarred ? '#F59E0B' : colors.textPrimary}
                />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleDeleteSelectedMessages}
              style={s.headerCallBtn}
              accessibilityRole="button"
              accessibilityLabel="Delete selected messages"
            >
              <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        ) : (
          <>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={s.backBtn}
        >
          <Text style={s.backArrow}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
          {contactName ? <Text style={s.headerSub} numberOfLines={1}>{formatPhoneNumber(address)}</Text> : null}
        </View>
        <TouchableOpacity
          onPress={handleCall}
          style={s.headerCallBtn}
        >
          <Ionicons name="call" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMenuVisible(true)}
          style={[s.headerCallBtn, { marginLeft: 0 }]}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="#FFFFFF" />
        </TouchableOpacity>
          </>
        )}
      </View>

      {searchActive && (
        <ChatSearchBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onClose={() => { setSearchActive(false); setSearchQuery(''); }}
          colors={colors}
        />
      )}

      <View style={{ flex: 1 }}>
        <ChatMessageList
          messages={messages}
          filteredMessages={filteredMessages}
          searchActive={searchActive}
          colors={colors}
          onImagePress={setSelectedMediaMessageId}
          selectionMode={selectionMode}
          selectedMessageIds={selectedMessageIds}
          starredMessageIds={starredMessageIds}
          scrollToMessageId={scrollToMessageId}
          onMessagePress={toggleSelectedMessage}
          onMessageLongPress={handleMessageLongPress}
        />

        <ChatInputBar
          text={text}
          setText={setText}
          onSend={handleSend}
          pickerOpen={pickerOpen}
          setPickerOpen={setPickerOpen}
          pickImage={pickImage}
          pickVideo={pickVideo}
          pickDocument={pickDocument}
          handlePickContact={handlePickContact}
          keyboardHeight={keyboardHeight}
          colors={colors}
          styles={s}
          pendingAttachments={pendingAttachments}
          clearAttachments={clearAttachments}
          sending={sending}
        />
      </View>

      <ChatMenuDropdown
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        items={menuItems}
      />

      <AddPeopleModal
        visible={addPeopleVisible}
        onClose={() => { setAddPeopleVisible(false); loadMessages(); }}
        threadId={threadId}
        address={address}
        contactName={contactName}
      />

      <Modal
        visible={starredMessagesVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStarredMessagesVisible(false)}
      >
        <View style={s.starredBackdrop}>
          <View style={s.starredSheet}>
            <View style={s.starredHeader}>
              <Text style={s.starredTitle}>Starred messages</Text>
              <TouchableOpacity
                onPress={() => setStarredMessagesVisible(false)}
                style={s.starredCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close starred messages"
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={s.starredList} contentContainerStyle={s.starredListContent}>
              {starredMessages.length === 0 ? (
                <View style={s.starredEmpty}>
                  <Ionicons name="star" size={24} color="#F59E0B" />
                  <Text style={s.starredEmptyText}>No starred messages yet</Text>
                </View>
              ) : (
                starredMessages.map(message => {
                  const sender = message.type === 2 ? 'You' : title;
                  const preview = message.body?.trim() || (message.imageUri ? 'Media message' : 'Message');
                  const time = new Date(message.date).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                  return (
                    <TouchableOpacity
                      key={message.id}
                      style={s.starredItem}
                      activeOpacity={0.7}
                      onPress={() => {
                        setStarredMessagesVisible(false);
                        setSelectedMessageIds([]);
                        setScrollToMessageId(null);
                        requestAnimationFrame(() => setScrollToMessageId(message.id));
                      }}
                    >
                      <Ionicons name="star" size={15} color="#F59E0B" />
                      <View style={s.starredItemBody}>
                        <View style={s.starredItemMeta}>
                          <Text style={s.starredSender} numberOfLines={1}>{sender}</Text>
                          <Text style={s.starredTime} numberOfLines={1}>{time}</Text>
                        </View>
                        <Text style={s.starredPreview} numberOfLines={3}>{preview}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <FullScreenChatMediaViewer
        visible={selectedMediaMessageId !== null}
        media={mediaMessages}
        initialMessageId={selectedMediaMessageId}
        senderTitle={title}
        address={formatPhoneNumber(address)}
        starredMessageIds={starredMessageIds}
        onClose={() => setSelectedMediaMessageId(null)}
        onDelete={handleDeleteMediaMessage}
        onToggleStar={handleToggleStarMediaMessage}
      />
    </SafeAreaView>
  );
}
