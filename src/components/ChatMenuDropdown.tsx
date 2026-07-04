import React, { useEffect, useRef } from 'react';
import {
  Pressable, ScrollView, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from './AppText';

export interface MenuItem {
  key: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
}

const Text = AppText;

export default function ChatMenuDropdown({ visible, onClose, items }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0 }), 50);
    }
  }, [visible]);

  if (!visible) return null;

  const topOffset = insets.top + 56;

  return (
    <Pressable style={s.backdrop} onPress={onClose}>
      <View
        style={[
          s.menu,
          {
            top: topOffset,
            backgroundColor: '#1c1c1e',
            borderColor: 'rgba(255,255,255,0.12)',
            shadowColor: '#000',
          },
        ]}
      >
        <ScrollView ref={scrollRef} bounces={false} keyboardShouldPersistTaps="handled">
          {items.map((item, idx) => (
            <TouchableOpacity
              key={item.key}
              style={[
                s.menuItem,
                idx < items.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: 'rgba(255,255,255,0.1)',
                },
              ]}
              onPress={() => {
                onClose();
                setTimeout(item.onPress, 200);
              }}
              activeOpacity={0.6}
            >
              <Text
                style={[
                  s.menuLabel,
                  item.destructive && s.destructive,
                  { color: item.destructive ? '#ef4444' : '#FFFFFF' },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999,
  },
  menu: {
    position: 'absolute',
    right: 12,
    width: 240,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 400,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 20,
    zIndex: 1000,
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  destructive: {
    color: '#ef4444',
  },
});
