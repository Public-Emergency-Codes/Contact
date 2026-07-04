import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// @ts-ignore
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export type TabKey = 'emergency' | 'chat' | 'recent' | 'keypad' | 'contacts';

export interface TabDef {
  key: TabKey;
  label: string;
  icon: string;
  iconFamily: 'Ionicons' | 'MaterialCommunityIcons';
}

export const TABS: TabDef[] = [
  { key: 'emergency', label: 'Emergency', icon: 'alert-circle', iconFamily: 'Ionicons' },
  { key: 'chat',      label: 'Chat',      icon: 'chatbox',       iconFamily: 'Ionicons' },
  { key: 'recent',    label: 'Recent',    icon: 'call-outline',  iconFamily: 'Ionicons' },
  { key: 'keypad',    label: 'Keypad',    icon: 'keypad',        iconFamily: 'Ionicons' },
  { key: 'contacts',  label: 'Contacts',  icon: 'people',        iconFamily: 'Ionicons' },
];

export const TAB_KEYS: TabKey[] = TABS.map((t) => t.key);

interface FloatingTabBarProps {
  activeTab: TabKey;
  onTabPress: (key: TabKey) => void;
}

export default function FloatingTabBar({ activeTab, onTabPress }: FloatingTabBarProps) {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  return (
    <View style={s.pillBarWrap} pointerEvents="box-none">
      <View style={s.pillBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          const isEmergency = tab.key === 'emergency';

          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.pillTab, active && s.pillTabActive]}
              onPress={() => onTabPress(tab.key)}
              activeOpacity={0.75}
            >
              {tab.iconFamily === 'MaterialCommunityIcons' ? (
                <MaterialCommunityIcons
                  name={tab.icon as any}
                  size={22}
                  color={isEmergency ? '#ef4444' : (active ? '#fff' : 'rgba(255,255,255,0.45)')}
                />
              ) : (
                <Ionicons
                  name={tab.icon as any}
                  size={20}
                  color={isEmergency ? '#ef4444' : (active ? '#fff' : 'rgba(255,255,255,0.45)')}
                />
              )}
              <Text
                style={[
                  s.pillTabLabel,
                  active && s.pillTabLabelActive,
                  isEmergency && { color: '#ef4444' },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
  pillBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
    zIndex: 10,
  },
  pillBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 40,
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pillTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 34,
    gap: 3,
  },
  pillTabActive: {
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  pillTabLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  pillTabLabelActive: {
    color: '#fff',
  },
});
