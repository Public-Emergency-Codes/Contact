import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, Pressable, ScrollView, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppVideo from '../../components/AppVideo';
import AppText from '../../components/AppText';
import { getDayKey, formatDateLabel } from '../../utils/dateFormat';
import { useStickyDatePill } from '../../hooks/useStickyDatePill';

const Text = AppText;

interface SmsMsg {
  id: string;
  body: string;
  date: number;
  type: number;
  imageUri?: string;
  mediaMime?: string;
}

interface Props {
  messages: SmsMsg[];
  filteredMessages?: SmsMsg[];
  searchActive: boolean;
  colors: any;
  onImagePress?: (messageId: string) => void;
  selectionMode?: boolean;
  selectedMessageIds?: string[];
  starredMessageIds?: string[];
  scrollToMessageId?: string | null;
  onMessagePress?: (messageId: string) => void;
  onMessageLongPress?: (messageId: string) => void;
}

export default function ChatMessageList({
  messages,
  filteredMessages,
  searchActive,
  colors,
  onImagePress,
  selectionMode = false,
  selectedMessageIds = [],
  starredMessageIds = [],
  scrollToMessageId,
  onMessagePress,
  onMessageLongPress,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const lastAutoScrolledContentKeyRef = useRef('');
  const messageLayoutYRef = useRef<Record<string, number>>({});
  const pendingScrollMessageIdRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);
  const prevFirstMsgIdRef = useRef<string | null>(null);
  const { stickyLabel, stickyVisible, onDividerLayout, handleScroll } = useStickyDatePill();

  const scrollToBottom = (delay = 100, animated = true) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), delay);
  };

  const source = (searchActive && filteredMessages ? filteredMessages : messages)
    .filter((msg) => !!msg.imageUri || !!msg.body?.trim());
  const contentKey = `${source.length}:${source[source.length - 1]?.id ?? 'empty'}`;

  // Detect a genuinely new conversation (first-message ID changes) vs.
  // new messages arriving in the same thread (same first ID, longer list).
  const firstMsgId = source[0]?.id ?? null;
  const isNewConversation = firstMsgId !== prevFirstMsgIdRef.current;
  if (isNewConversation) {
    prevFirstMsgIdRef.current = firstMsgId;
    initialLoadDoneRef.current = false;
    lastAutoScrolledContentKeyRef.current = '';
  }

  const handleContentSizeChange = () => {
    // During initial load: scroll to bottom with animated=false so the
    // user lands at the most recent message instantly — no visible bounce.
    if (!initialLoadDoneRef.current) {
      lastAutoScrolledContentKeyRef.current = contentKey;
      if (source.length > 0) {
        scrollToBottom(100, false);
        initialLoadDoneRef.current = true;
      }
      return;
    }

    // After initial load: only scroll when new messages arrive
    if (lastAutoScrolledContentKeyRef.current === contentKey) return;
    lastAutoScrolledContentKeyRef.current = contentKey;
    scrollToBottom(0, true);
  };

  const scrollToMessage = (messageId: string) => {
    const y = messageLayoutYRef.current[messageId];
    if (typeof y !== 'number') {
      pendingScrollMessageIdRef.current = messageId;
      return;
    }
    pendingScrollMessageIdRef.current = null;
    scrollRef.current?.scrollTo({ y: Math.max(y - 18, 0), animated: true });
  };

  useEffect(() => {
    if (!scrollToMessageId) return;
    requestAnimationFrame(() => scrollToMessage(scrollToMessageId));
  }, [scrollToMessageId, contentKey]);

  const messageElements = useMemo(() => {
    let lastDayKey = '';
    return source.map((msg) => {
      const dayKey = getDayKey(msg.date);
      const showDivider = dayKey !== lastDayKey;
      lastDayKey = dayKey;
      const isSent = msg.type === 2;
      const timeStr = new Date(msg.date).toLocaleTimeString(
        undefined,
        { hour: 'numeric', minute: '2-digit', hour12: true },
      );
      const label = formatDateLabel(msg.date);
      const isSelected = selectedMessageIds.includes(msg.id);
      const isStarred = starredMessageIds.includes(msg.id);
      return (
        <View
          key={msg.id}
          onLayout={(e) => {
            messageLayoutYRef.current[msg.id] = e.nativeEvent.layout.y;
            if (pendingScrollMessageIdRef.current === msg.id) {
              scrollToMessage(msg.id);
            }
          }}
        >
          {showDivider && (
            <View
              style={s.dateDivider}
              onLayout={(e) => onDividerLayout(label, e.nativeEvent.layout.y)}
            >
              <View style={[s.dateDividerPill, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text style={[s.dateDividerText, { color: colors.textSecondary }]}>{label}</Text>
              </View>
            </View>
          )}
          <Pressable
            onPress={() => {
              if (selectionMode) onMessagePress?.(msg.id);
            }}
            onLongPress={() => onMessageLongPress?.(msg.id)}
            delayLongPress={260}
            style={[
              s.previewCard,
              s.selectableRow,
              isSelected && { backgroundColor: colors.selectionBg || 'rgba(0,0,0,0.14)' },
            ]}
          >
            <View style={s.chatSection}>
              {isSent ? (
                <View style={s.chatRowRight}>
                  <View style={[
                    s.chatBubbleRight,
                    { backgroundColor: colors.border },
                  ]}>
                    {msg.imageUri ? (
                      <MessageMediaPreview
                        uri={msg.imageUri}
                        mime={msg.mediaMime}
                        onImagePress={() => (selectionMode ? onMessagePress?.(msg.id) : onImagePress?.(msg.id))}
                      />
                    ) : null}
                    {msg.body ? (
                      <Text style={[s.chatTextRight, { color: colors.textPrimary }]}>
                        {msg.body}
                      </Text>
                    ) : null}
                  </View>
                  <MessageTime
                    time={timeStr}
                    starred={isStarred}
                    align="right"
                    color={colors.textMuted}
                  />
                </View>
              ) : (
                <View style={s.chatRowLeft}>
                  <View style={[
                    s.chatBubbleLeft,
                    { backgroundColor: colors.surfaceAlt },
                  ]}>
                    {msg.imageUri ? (
                      <MessageMediaPreview
                        uri={msg.imageUri}
                        mime={msg.mediaMime}
                        onImagePress={() => (selectionMode ? onMessagePress?.(msg.id) : onImagePress?.(msg.id))}
                      />
                    ) : null}
                    {msg.body ? (
                      <Text style={[s.chatText, { color: colors.textPrimary }]}>{msg.body}</Text>
                    ) : null}
                  </View>
                  <MessageTime
                    time={timeStr}
                    starred={isStarred}
                    align="left"
                    color={colors.textMuted}
                  />
                </View>
              )}
            </View>
          </Pressable>
        </View>
      );
    });
  }, [
    source,
    colors,
    onDividerLayout,
    onImagePress,
    onMessageLongPress,
    onMessagePress,
    selectedMessageIds,
    selectionMode,
    scrollToMessageId,
    starredMessageIds,
  ]);

  return (
    <View style={{ flex: 1 }}>
      {stickyVisible && stickyLabel && (
        <View style={s.stickyPillWrap} pointerEvents="none">
          <View style={[s.stickyPill, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Text style={[s.stickyPillText, { color: colors.textSecondary }]}>{stickyLabel}</Text>
          </View>
        </View>
      )}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        alwaysBounceVertical
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
      >
        {messageElements}
      </ScrollView>
    </View>
  );
}

function MessageTime({
  time,
  starred,
  align,
  color,
}: {
  time: string;
  starred: boolean;
  align: 'left' | 'right';
  color: string;
}) {
  return (
    <View style={[
      s.messageTimeRow,
      align === 'right' ? s.messageTimeRight : s.messageTimeLeft,
    ]}>
      {starred ? <Ionicons name="star" size={10} color="#FFFFFF" /> : null}
      <Text style={[s.messageTimeText, { color }]}>{time}</Text>
    </View>
  );
}

function MessageMediaPreview({
  uri,
  mime,
  onImagePress,
}: {
  uri: string;
  mime?: string;
  onImagePress?: () => void;
}) {
  const isVideo = mime?.startsWith('video/') || /\.(mp4|m4v|mov|3gp|3gpp|webm)(\?|$)/i.test(uri);
  const [playing, setPlaying] = useState(false);

  if (!isVideo) {
    return (
      <TouchableOpacity onPress={onImagePress} activeOpacity={0.85}>
        <Image source={{ uri }} style={s.messageImage} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={s.messageImage}
      onPress={() => setPlaying((value) => !value)}
      activeOpacity={0.9}
    >
      <AppVideo
        uri={uri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        playing={playing}
        nativeControls={false}
        onPlaybackEnd={() => setPlaying(false)}
      />
      {!playing ? (
        <View style={s.videoPlayOverlay}>
          <Ionicons name="play" size={22} color="#FFFFFF" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  content: { paddingTop: 12, paddingHorizontal: 8 },
  previewCard: { backgroundColor: 'transparent', borderRadius: 0, padding: 0, marginTop: 0, position: 'relative', overflow: 'hidden' },
  selectableRow: { marginBottom: 10, paddingVertical: 2, paddingHorizontal: 4 },
  chatSection: { width: '100%', marginBottom: 0 },
  chatRowLeft: { width: '100%', alignItems: 'flex-start', marginBottom: 0 },
  chatRowRight: { width: '100%', alignItems: 'flex-end', marginBottom: 0 },
  chatBubbleLeft: { borderRadius: 14, borderTopLeftRadius: 4, maxWidth: '80%', overflow: 'hidden' },
  chatBubbleRight: { borderRadius: 14, borderTopRightRadius: 4, maxWidth: '80%', overflow: 'hidden' },
  messageTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  messageTimeLeft: { marginLeft: 4 },
  messageTimeRight: { marginRight: 4, justifyContent: 'flex-end' },
  messageTimeText: { fontSize: 10 },
  messageImage: { width: 200, height: 200, borderRadius: 8, marginBottom: 4, overflow: 'hidden' },
  videoPlayOverlay: {
    position: 'absolute',
    left: 76,
    top: 76,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  chatText: { fontSize: 13, lineHeight: 18, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 },
  chatTextRight: { fontSize: 13, lineHeight: 18, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, marginBottom: 0 },
  dateDivider: { alignItems: 'center', marginVertical: 8 },
  dateDividerPill: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 0.5 },
  dateDividerText: { fontSize: 12 },
  stickyPillWrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 999, paddingTop: 6 },
  stickyPill: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 0.5 },
  stickyPillText: { fontSize: 12 },
});
