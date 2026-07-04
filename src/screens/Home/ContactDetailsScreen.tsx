import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Linking, NativeModules, ScrollView,
  StyleSheet, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { formatPhoneNumber } from '../../utils/phoneFormat';
import { placeContactCall } from '../../services/contactActionService';

const Text = AppText;
const { SmsWriter } = NativeModules;

interface Props {
  navigation: any;
  route: {
    params: {
      threadId: string;
      address: string;
      contactName?: string;
    };
  };
}

export default function ContactDetailsScreen({ navigation, route }: Props) {
  const { address, contactName } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [isBlocked, setIsBlocked] = useState(false);
  const title = contactName || address;

  useEffect(() => {
    if (SmsWriter) {
      SmsWriter.isBlocked(address)
        .then(setIsBlocked)
        .catch(() => {});
    }
  }, [address]);

  const handleCall = useCallback(() => {
    void placeContactCall(address);
  }, [address]);

  const handleSms = useCallback(() => {
    Linking.openURL(`sms:${address}`).catch(() => {});
  }, [address]);

  const handleBlock = useCallback(async () => {
    if (!SmsWriter) {
      Alert.alert('Not available', 'Blocking is not available on this device.');
      return;
    }
    Alert.alert(
      isBlocked ? 'Unblock Number' : 'Block Number',
      isBlocked
        ? `Unblock ${address}?`
        : `Block ${address}? They will not be able to call or text you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (isBlocked) {
                Alert.alert('Info', 'To unblock, go to your phone\'s Settings > Blocked numbers.');
              } else {
                await SmsWriter.blockNumber(address);
                setIsBlocked(true);
                Alert.alert('Blocked', `${address} has been blocked.`);
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Operation failed.');
            }
          },
        },
      ],
    );
  }, [address, isBlocked]);

  const rowStyle = useMemo(
    () => ({
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    }),
    [colors.border],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['left', 'right', 'bottom']}>
      <View style={{ paddingTop: insets.top + 6, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 30, lineHeight: 30, color: colors.textPrimary }}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary }}>Contact Details</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 20 }}>
        {/* Avatar + Name */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 24 }}>
              {(contactName || address)[0].toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600' }}>{title}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>{formatPhoneNumber(address)}</Text>
        </View>

        {/* Action rows */}
        <TouchableOpacity style={rowStyle} onPress={handleCall}>
          <Ionicons name="call-outline" size={20} color={colors.textPrimary} style={{ marginRight: 14 }} />
          <View>
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>Call</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{formatPhoneNumber(address)}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={rowStyle} onPress={handleSms}>
          <Ionicons name="chatbox" size={20} color={colors.textPrimary} style={{ marginRight: 14 }} />
          <View>
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>Send Message</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{formatPhoneNumber(address)}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={rowStyle} onPress={handleBlock}>
          <Ionicons
            name={isBlocked ? 'shield-checkmark' : 'shield-outline'}
            size={20}
            color={isBlocked ? '#ef4444' : colors.textPrimary}
            style={{ marginRight: 14 }}
          />
          <View>
            <Text style={{ color: isBlocked ? '#ef4444' : colors.textPrimary, fontSize: 15 }}>
              {isBlocked ? 'Blocked' : 'Block Number'}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {isBlocked ? 'This number is blocked' : 'Prevent calls and messages'}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
