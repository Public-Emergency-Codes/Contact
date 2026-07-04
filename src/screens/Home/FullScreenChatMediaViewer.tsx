import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, FlatList, Modal, NativeModules, NativeScrollEvent, NativeSyntheticEvent,
  StyleSheet, ToastAndroid, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppVideo from '../../components/AppVideo';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';

const Text = AppText;
const { ShareFile } = NativeModules;

export interface ChatMediaMessage {
  id: string;
  body: string;
  date: number;
  type: number;
  imageUri?: string;
  mediaMime?: string;
}

interface Props {
  visible: boolean;
  media: ChatMediaMessage[];
  initialMessageId: string | null;
  senderTitle: string;
  address: string;
  starredMessageIds: string[];
  onClose: () => void;
  onDelete: (message: ChatMediaMessage) => void;
  onToggleStar: (messageId: string) => void;
}

export default function FullScreenChatMediaViewer({
  visible,
  media,
  initialMessageId,
  senderTitle,
  address,
  starredMessageIds,
  onClose,
  onDelete,
  onToggleStar,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [immersive, setImmersive] = useState(false);
  const itemWidth = width * 0.86;
  const itemSpacing = 16;
  const pageWidth = itemWidth + itemSpacing;
  const sidePeek = (width - itemWidth) / 2;
  const headerHeight = insets.top + 58;
  const bottomInset = Math.max(insets.bottom, 22);
  const listRef = useRef<FlatList<ChatMediaMessage>>(null);
  const initialIndex = useMemo(
    () => Math.max(0, media.findIndex((m) => m.id === initialMessageId)),
    [media, initialMessageId],
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCurrentIndex(initialIndex);
    setImmersive(false);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: initialIndex * pageWidth, animated: false });
    });
  }, [visible, initialIndex, pageWidth]);

  if (!visible || media.length === 0) return null;

  const current = media[Math.min(currentIndex, media.length - 1)];
  const currentIsVideo = isVideoMedia(current);
  const isSent = current?.type === 2;
  const sender = isSent ? 'You' : senderTitle || address;
  const actionTime = `${isSent ? 'Sent' : 'Received'} ${formatFullDate(current?.date || Date.now())}`;
  const isStarred = current ? starredMessageIds.includes(current.id) : false;

  const handleDelete = () => {
    if (!current) return;
    const nextIndex = media.length <= 1 ? 0 : Math.min(currentIndex, media.length - 2);
    onDelete(current);
    setMenuOpen(false);
    setCurrentIndex(nextIndex);
    if (media.length <= 1) onClose();
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(pageWidth, 1));
    setCurrentIndex(Math.min(Math.max(nextIndex, 0), media.length - 1));
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <GestureHandlerRootView style={s.root}>
        <FlatList
          ref={listRef}
          data={media}
          keyExtractor={(item) => item.id}
          horizontal
          snapToInterval={pageWidth}
          snapToAlignment="start"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: sidePeek - (itemSpacing / 2) }}
          getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
          onMomentumScrollEnd={handleScrollEnd}
          renderItem={({ item }) => (
            <View style={[s.mediaPage, { width: pageWidth, height, paddingTop: headerHeight, paddingBottom: bottomInset, paddingHorizontal: itemSpacing / 2 }]}>
              {isVideoMedia(item) ? (
                <AppVideo
                  uri={item.imageUri || ''}
                  style={s.fullImage}
                  contentFit="contain"
                  nativeControls
                />
              ) : (
                <ZoomableImage
                  uri={item.imageUri}
                  mode="level1"
                  onEnterImmersive={() => setImmersive(true)}
                />
              )}
            </View>
          )}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => listRef.current?.scrollToOffset({ offset: index * pageWidth, animated: false }), 50);
          }}
        />

        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onClose} style={s.iconBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={s.headerText}>
            <Text style={s.sender} numberOfLines={1}>{sender}</Text>
            <Text style={s.timestamp} numberOfLines={1}>{actionTime}</Text>
          </View>

          <TouchableOpacity onPress={() => current && downloadMedia(current)} style={s.iconBtn} activeOpacity={0.7}>
            <Ionicons name="download-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={s.iconBtn} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <TouchableOpacity onPress={() => setMenuOpen((v) => !v)} style={s.iconBtn} activeOpacity={0.7}>
              <Ionicons name="ellipsis-vertical" size={23} color="#FFFFFF" />
            </TouchableOpacity>
            {menuOpen && (
              <View style={s.menu}>
                <TouchableOpacity
                  onPress={() => {
                    setMenuOpen(false);
                    if (current) shareMedia(current, 'Forward');
                  }}
                  style={s.menuItem}
                >
                  <Text style={s.menuText}>Forward</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setMenuOpen(false);
                    if (current) shareMedia(current, 'Share');
                  }}
                  style={s.menuItem}
                >
                  <Text style={s.menuText}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (current) onToggleStar(current.id);
                    setMenuOpen(false);
                  }}
                  style={s.menuItem}
                >
                  <Text style={s.menuText}>{isStarred ? 'Unstar' : 'Star'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {immersive && current && !currentIsVideo ? (
          <View style={s.immersiveOverlay}>
            <ZoomableImage
              uri={current.imageUri}
              mode="level2"
              onExitImmersive={() => setImmersive(false)}
            />
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomableImage({
  uri,
  mode,
  onEnterImmersive,
  onExitImmersive,
}: {
  uri?: string;
  mode: 'level1' | 'level2';
  onEnterImmersive?: () => void;
  onExitImmersive?: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 120 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 120 });
    translateY.value = withTiming(0, { duration: 120 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [uri]);

  const pinch = useMemo(
    () => Gesture.Pinch()
      .onUpdate((event) => {
        const next = savedScale.value * event.scale;
        scale.value = Math.min(Math.max(next, 1), 4);
      })
      .onEnd(() => {
        savedScale.value = scale.value;
        if (scale.value <= 1.02) {
          scale.value = withTiming(1, { duration: 160 });
          savedScale.value = 1;
          translateX.value = withTiming(0, { duration: 160 });
          translateY.value = withTiming(0, { duration: 160 });
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
        }
        if (mode === 'level1' && onEnterImmersive) runOnJS(onEnterImmersive)();
      }),
    [mode, onEnterImmersive, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY],
  );

  const pan = useMemo(
    () => Gesture.Pan()
      .minDistance(2)
      .onUpdate((event) => {
        if (mode !== 'level2' || scale.value <= 1.02) return;
        translateX.value = savedTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
      })
      .onEnd(() => {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }),
    [mode, savedTranslateX, savedTranslateY, scale, translateX, translateY],
  );

  const tap = useMemo(
    () => Gesture.Tap()
      .numberOfTaps(1)
      .onEnd(() => {
        if (mode === 'level2') {
          scale.value = withTiming(1, { duration: 120 });
          savedScale.value = 1;
          translateX.value = withTiming(0, { duration: 120 });
          translateY.value = withTiming(0, { duration: 120 });
          savedTranslateX.value = 0;
          savedTranslateY.value = 0;
          if (onExitImmersive) runOnJS(onExitImmersive)();
        } else if (onEnterImmersive) {
          runOnJS(onEnterImmersive)();
        }
      }),
    [mode, onEnterImmersive, onExitImmersive, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY],
  );

  const imageGesture = useMemo(
    () => (mode === 'level2' ? Gesture.Simultaneous(pinch, pan, tap) : Gesture.Simultaneous(pinch, tap)),
    [mode, pan, pinch, tap],
  );

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  } as any));

  return (
    <GestureDetector gesture={imageGesture}>
      <Animated.View collapsable={false} style={s.zoomFrame}>
        <Animated.Image
          source={{ uri }}
          style={[s.fullImage, animatedImageStyle as any]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}

async function shareMedia(message: ChatMediaMessage, title: string) {
  if (!message.imageUri) return;
  try {
    if (!ShareFile?.share) throw new Error('Native file sharing is unavailable');
    const name = message.body?.trim() || title;
    await ShareFile.share(message.imageUri, message.mediaMime || '*/*', name);
  } catch {
    Alert.alert('Not available', 'No app is available to handle this media.');
  }
}

async function downloadMedia(message: ChatMediaMessage) {
  if (!message.imageUri) return;
  try {
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library permission is required to download this media.');
      return;
    }

    let saveUri = message.imageUri;
    if (!saveUri.startsWith('file://')) {
      const ext = extensionFromUri(saveUri);
      const dest = `${FileSystem.cacheDirectory}emessages_${message.id}_${Date.now()}${ext}`;
      await FileSystem.copyAsync({ from: saveUri, to: dest });
      saveUri = dest;
    }
    await MediaLibrary.saveToLibraryAsync(saveUri);
    ToastAndroid.show('Saved', ToastAndroid.SHORT);
  } catch {
    Alert.alert('Download failed', 'Could not save this media.');
  }
}

function extensionFromUri(uri: string): string {
  const clean = uri.split('?')[0];
  const match = clean.match(/\.(jpg|jpeg|png|gif|webp|heic|mp4|m4v|mov|3gp|3gpp|webm)$/i);
  return match ? match[0] : '.jpg';
}

function isVideoMedia(message?: ChatMediaMessage): boolean {
  const uri = message?.imageUri || '';
  return message?.mediaMime?.startsWith('video/') === true || /\.(mp4|m4v|mov|3gp|3gpp|webm)(\?|$)/i.test(uri);
}

function formatFullDate(date: number): string {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  mediaPage: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
  immersiveOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
    backgroundColor: '#000000',
  },
  zoomFrame: { width: '100%', height: '100%', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.38)',
    zIndex: 10,
    elevation: 10,
  },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0, paddingHorizontal: 4 },
  sender: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  timestamp: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 },
  menu: {
    position: 'absolute',
    top: 44,
    right: 0,
    width: 150,
    borderRadius: 8,
    paddingVertical: 6,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  menuText: { color: '#F9FAFB', fontSize: 15 },
});
