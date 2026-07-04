import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import AppText from '../../components/AppText';
const Text = AppText; // global text scale
import AsyncStorage from '@react-native-async-storage/async-storage';
import psapMessagingService from '../../services/psap/psapMessagingService';
import emergencyMessagingService from '../../services/emergencyMessagingService';
import { localContacts } from '../../services/localContactsService';
import { EMERGENCY_TEST_NUMBER } from '../../services/runtimeConfig';
import { useAppLanguage } from '../../context/AppLanguageContext';
import { translateWithDictionary } from '../../services/uiTranslationService';

type EmergencyType = 'Medical' | 'Fire' | 'Law Enforcement (Police)';

type EmergencyTypeBubbleProps = {
  visible: boolean;
  latitude: number | null;
  longitude: number | null;
  psapSmsCapable: { capable?: boolean; smsCapable?: boolean } | null;
  enlargedText?: number;
  userName?: string;
  onSelection: (type: EmergencyType) => void;
  onSendFailed?: (failed: boolean) => void;
  onRetryRef?: React.MutableRefObject<(() => void) | null>;
  triggerSelectRef?: React.MutableRefObject<((type: EmergencyType) => void) | null>;
};

const EMERGENCY_TYPES: EmergencyType[] = [
  'Medical',
  'Fire',
  'Law Enforcement (Police)',
];

const EmergencyTypeBubble: React.FC<EmergencyTypeBubbleProps> = ({
  visible,
  psapSmsCapable,
  enlargedText,
  userName,
  onSelection,
  onSendFailed,
  onRetryRef,
  triggerSelectRef,
}) => {
  const [selectedType, setSelectedType] = useState<EmergencyType | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [, setSendFailed] = useState(false);
  const { languageCode, dictionary } = useAppLanguage();

  const fs = (size: number) =>
    enlargedText ? Math.round(size * enlargedText) : size;

  const t = (value: string) => translateWithDictionary(value, languageCode, dictionary);

  const TYPE_LABELS: Record<EmergencyType, string> = {
    'Medical': 'This is a medical emergency',
    'Fire': 'This is a fire emergency',
    'Law Enforcement (Police)': 'I need law enforcement (police)',
  };

  // These must be defined BEFORE the visibility guard so handlePress/handleRetry can call them
  // even when visible=false (component is mounted hidden to keep refs wired).
  const notifyEmergencyContacts = async (type: EmergencyType) => {
    try {
      const contactsRes = await localContacts.getEmergencyContacts();
      const allContacts = contactsRes.data.contacts || [];
      const smsContacts = allContacts
        .filter((c: any) => c.contact_phone && c.notify_sms !== false)
        .map((c: any) => ({ name: c.contact_name, phone: c.contact_phone }));
      if (smsContacts.length > 0) {
        const name = userName || 'A user';
        await emergencyMessagingService.sendEmergencySms({
          contacts: smsContacts,
          userName: name,
          customMessage: `\u{1F6A8} ${name}: ${TYPE_LABELS[type]}`,

        });
      }
    } catch (e) {
      console.warn('Emergency contacts notification failed:', e);
    }
  };

  const notifyPsap = async (message: string): Promise<boolean> => {
    try {
      // 1. Try native phone SMS — in dev with override, bypass psapSmsCapable gate
      //    (it may not be set yet if the button is tapped before sendLocationUpdate completes)
      let devOverride: string | null = null;
      if (__DEV__) {
        try { devOverride = await AsyncStorage.getItem('dev_emergency_override_number'); } catch (_) {}
      }
      if (
        (devOverride || psapSmsCapable?.capable || psapSmsCapable?.smsCapable || psapSmsCapable === null) &&
        psapMessagingService.isAvailable()
      ) {
        const result = await psapMessagingService.sendMessage(message, EMERGENCY_TEST_NUMBER);
        if (result.success) return true;
      }

      // Local-device-only: no backend or speech fallback.
      return false;
    } catch (e) {
      console.warn('Emergency type PSAP notification failed:', e);
      return false;
    }
  };

  const handlePress = async (type: EmergencyType) => {
    setSelectedType(type);
    setSending(true);
    setSendFailed(false);
    onSelection(type);

    const message = TYPE_LABELS[type];
    const success = await notifyPsap(message);

    // Also notify emergency contacts
    notifyEmergencyContacts(type);

    setSending(false);
    if (success) {
      setSent(true);
      onSendFailed?.(false);
    } else {
      setSendFailed(true);
      onSendFailed?.(true);
    }
  };

  const handleRetry = async () => {
    if (!selectedType) return;
    setSendFailed(false);
    onSendFailed?.(false);
    setSending(true);

    const message = TYPE_LABELS[selectedType];
    const success = await notifyPsap(message);

    setSending(false);
    if (success) {
      setSent(true);
      onSendFailed?.(false);
    } else {
      setSendFailed(true);
      onSendFailed?.(true);
    }
  };

  // Expose handlers to parent — must be before visibility guard so refs work when visible=false
  if (onRetryRef) onRetryRef.current = handleRetry;
  if (triggerSelectRef) triggerSelectRef.current = handlePress;

  if (!visible) return null;

  return (
    <>
      {/* Main question bubble */}
      <View style={s.previewCard}>
        <View style={s.chatSection}>
          <View style={s.chatRowLeft}>
            <View style={s.chatBubbleLeft}>
              <Text
                style={[
                  s.leftText,
                  { fontSize: fs(13), lineHeight: fs(18) },
                ]}
              >
                What category is your emergency?
              </Text>

              {/* Show buttons only when no selection has been made */}
              {!selectedType && (
                <View style={s.btnRow}>
                  {EMERGENCY_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={s.typeBtn}
                      onPress={() => handlePress(type)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.typeBtnText, { fontSize: fs(13) }]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Sending state */}
              {sending && (
                <Text
                  style={[
                    s.leftText,
                    {
                      marginTop: 8,
                      fontStyle: 'italic',
                    fontSize: fs(13),
                    lineHeight: fs(18),
                    },
                  ]}
                >
                  {t('Notifying dispatcher of')}{' '}
                  <Text style={{ fontWeight: '600' }}>{selectedType ? t(selectedType) : ''}</Text>{' '}
                  {t('emergency...')}
                </Text>
              )}

              {/* Sent confirmation */}
              {sent && !sending && (
                <Text
                  style={[
                    s.leftText,
                  { marginTop: 8, fontSize: fs(13), lineHeight: fs(18) },
                  ]}
                >
                  {t('Dispatcher has been notified of your')}{' '}
                  <Text style={{ fontWeight: '600' }}>{selectedType ? t(selectedType) : ''}</Text>{' '}
                  {t('emergency.')}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

    </>
  );
};

const s = StyleSheet.create({
  previewCard: {
    backgroundColor: '#000000',
    borderRadius: 0,
    padding: 0,
    marginTop: 0,
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  chatSection: {
    width: '100%',
    marginBottom: 0,
  },
  chatRowLeft: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  chatBubbleLeft: {
    backgroundColor: '#374151',
    borderRadius: 14,
    borderTopLeftRadius: 4,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 12,
    maxWidth: '80%',
    overflow: 'hidden',
  },
  leftText: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'left',
  },
  btnRow: {
    marginTop: 10,
    gap: 8,
  },
  typeBtn: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  typeBtnText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '500',
  },
  retryBtn: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
});

export default EmergencyTypeBubble;
