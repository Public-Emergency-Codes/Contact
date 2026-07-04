import React from 'react';
import {
  ActivityIndicator, Image, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PendingAttachment } from '../../hooks/useAttachmentPicker';

interface Props {
  text: string;
  setText: (t: string) => void;
  onSend: () => void;
  pickerOpen: boolean;
  setPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pickImage: () => void;
  pickVideo: () => void;
  pickDocument: () => void;
  handlePickContact: () => void;
  keyboardHeight: number;
  colors: any;
  styles: any;
  pendingAttachments: PendingAttachment[];
  clearAttachments: () => void;
  sending: boolean;
}

export default function ChatInputBar({
  text, setText, onSend,
  pickerOpen, setPickerOpen,
  pickImage, pickVideo, pickDocument, handlePickContact,
  keyboardHeight, colors, styles: s,
  pendingAttachments, clearAttachments, sending,
}: Props) {
  const hasPending = pendingAttachments.length > 0;
  return (
    <View style={[s.bottomInputArea, { marginBottom: keyboardHeight }]}>
      {/* Pending attachment previews */}
      {hasPending && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 4, gap: 6, alignItems: 'center' }}>
          {pendingAttachments.map((att, i) => (
            <View key={i} style={{ position: 'relative' }}>
              <Image
                source={{ uri: att.uri }}
                style={{ width: 48, height: 48, borderRadius: 6, backgroundColor: colors.border }}
                resizeMode="cover"
              />
              <TouchableOpacity
                onPress={() => {
                  // We need a way to remove one — for now just clear all and re-add
                  clearAttachments();
                }}
                style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.surface, borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close-circle" size={18} color={colors.error || 'red'} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={clearAttachments} style={{ marginLeft: 4 }}>
            <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}

      <View style={s.chatInputWrap}>
        <TouchableOpacity
          style={{ position: 'absolute', left: 8, top: 0, bottom: 0, justifyContent: 'center', zIndex: 4, paddingHorizontal: 6 }}
          onPress={() => setPickerOpen(p => !p)}
        >
          <Ionicons name="add" size={20} color={colors.textPrimary} />
        </TouchableOpacity>

        {pickerOpen && (
          <View style={{ position: 'absolute', left: 8, bottom: 56, backgroundColor: colors.surface, borderRadius: 10, padding: 8, flexDirection: 'row', zIndex: 5, elevation: 6 }}>
            <TouchableOpacity onPress={pickImage} style={{ padding: 8 }}>
              <Ionicons name="image-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={pickVideo} style={{ padding: 8 }}>
              <Ionicons name="videocam-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={pickDocument} style={{ padding: 8 }}>
              <Ionicons name="document-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickContact} style={{ padding: 8 }}>
              <Ionicons name="person-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        )}

        <TextInput
          value={text}
          onChangeText={setText}
          style={[s.chatInput, { paddingLeft: 44 }]}
          multiline
          placeholder="Type a message..."
          placeholderTextColor={colors.inputPlaceholder}
          cursorColor="rgba(255,255,255,0.3)"
          selectionColor="rgba(255,255,255,0.3)"
          blurOnSubmit={false}
          returnKeyType="send"
          onSubmitEditing={onSend}
        />
        <TouchableOpacity
          style={s.chatSendIconButton}
          onPress={onSend}
          disabled={sending || (!text.trim() && !hasPending)}
        >
          {sending ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
          ) : (
            <Ionicons
              name="send"
              size={18}
              color="rgba(255,255,255,0.7)"
              style={!text.trim() && !hasPending ? { opacity: 0.3 } : undefined}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
