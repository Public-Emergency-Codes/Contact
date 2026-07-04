/**
 * SilentCallChat
 * Text-only chat interface for silent/low-volume E911 calls.
 * User typed messages are sent to the dispatcher as text (Text-to-911).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  Animated,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import AppText from '../../components/AppText';
import AppTextInput from '../../components/AppTextInput';
const Text = AppText; // global text scale
const TextInput = AppTextInput; // global placeholder translation
import silentCallService from '../../services/silentCallService';
import { translateToEnglish } from '../../services/dispatcherMessageTranslationService';
import { getUserLanguage, needsTranslation } from '../../services/languageConfig';
import { getEnglishFromOfflineTranslation } from '../../services/uiDictionaryStore';
import {
  ChatMessage,
  SilentCallChatProps,
  QUICK_RESPONSES,
  getTtsStatusLabel,
} from './silentCallChatConfig';
import { silentCallChatStyles as styles } from './silentCallChatStyles';

const SilentCallChat: React.FC<SilentCallChatProps> = ({
  sendPsapMessage,
  textScale = 1,
  onUserMessage,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [userLang, setUserLang] = useState('en');
  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const fs = (size: number) => size * textScale;

  // Load user's preferred language
  useEffect(() => {
    getUserLanguage().then(setUserLang);
  }, []);

  // Pulse animation for "call active" indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Listen for status messages
  useEffect(() => {
    const unsub = silentCallService.onStatus((status) => {
      const msg: ChatMessage = {
        id: `sys-${Date.now()}`,
        text: status,
        direction: 'system',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, msg]);
      scrollToBottom();
    });
    return unsub;
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 200);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    const msgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: msgId,
      text,
      direction: 'user',
      timestamp: Date.now(),
      ttsStatus: 'pending',
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setShowQuick(false);
    Keyboard.dismiss();
    scrollToBottom();
    setSending(true);

    try {
      // Translate user message to English for the dispatcher
      let englishText = text;
      if (needsTranslation(userLang)) {
        const tr = await translateToEnglish(text, userLang);
        englishText = tr.translatedText;
        if (!tr.success) {
          const packFallback = await getEnglishFromOfflineTranslation(userLang, text);
          if (packFallback) englishText = packFallback;
        }
      }

      // Send English text via SMS to PSAP
      const ok = await sendPsapMessage(englishText);

      setMessages(prev =>
        prev.map(m => m.id === msgId ? { ...m, ttsStatus: ok ? 'sent' : 'failed' } : m)
      );
      onUserMessage?.(text);
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === msgId ? { ...m, ttsStatus: 'failed' } : m)
      );
    } finally {
      setSending(false);
    }
  }, [sending, sendPsapMessage, onUserMessage, scrollToBottom]);

  return (
    <View style={styles.container}>
      {/* Call-active indicator */}
      <View style={styles.callActiveBar}>
        <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
        <Text style={[styles.callActiveText, { fontSize: fs(10) }]}>
          Call active - dispatcher can hear background sounds
        </Text>
      </View>

      {/* Messages */}
      <ScrollView ref={scrollRef} style={styles.messageList} contentContainerStyle={styles.messageContent}>
        {messages.map((msg) => (
          <View key={msg.id} style={[
            styles.msgBubble,
            msg.direction === 'user' && styles.userBubble,
            msg.direction === 'dispatcher' && styles.dispatcherBubble,
            msg.direction === 'system' && styles.systemBubble,
          ]}>
            {msg.direction === 'dispatcher' && (
              <Text style={[styles.senderLabel, { fontSize: fs(9) }]}>Dispatcher:</Text>
            )}
            <Text style={[
              styles.msgText,
              { fontSize: fs(13) },
              msg.direction === 'system' && styles.systemText,
            ]}>
              {msg.text}
            </Text>
            {msg.ttsStatus && msg.direction === 'user' && (
              <Text style={[styles.ttsLabel, { fontSize: fs(9) }]}>
                {getTtsStatusLabel(msg.ttsStatus)}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Quick responses */}
      {showQuick && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickBar}>
          {QUICK_RESPONSES.map((qr, i) => (
            <TouchableOpacity key={i} style={styles.quickBtn} onPress={() => sendMessage(qr.text)}>
              <Text style={[styles.quickText, { fontSize: fs(11) }]}>{qr.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          style={[styles.input, { fontSize: fs(13) }]}
          placeholder="Type message (sent to dispatcher as text)..."
          placeholderTextColor="#6B7280"
          multiline
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendDisabled]}
          onPress={() => sendMessage(inputText)}
          disabled={!inputText.trim() || sending}
        >
          {sending
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Text style={styles.sendIcon}>{'>'}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default SilentCallChat;
