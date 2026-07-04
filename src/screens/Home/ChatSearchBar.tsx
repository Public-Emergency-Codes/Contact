import React from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onClose: () => void;
  colors: any;
}

export default function ChatSearchBar({ searchQuery, setSearchQuery, onClose, colors }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search in conversation..."
        placeholderTextColor={colors.textSecondary}
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontSize: 14,
          backgroundColor: colors.inputBackground,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderWidth: 1,
          borderColor: colors.inputBorder,
        }}
        autoFocus
        returnKeyType="search"
      />
      <TouchableOpacity onPress={onClose} style={{ padding: 8, marginLeft: 6 }}>
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}
