import React from 'react';
import { Modal, Pressable, TouchableOpacity } from 'react-native';
import AppText from '../../components/AppText';
import { AppColors } from '../../utils/themeColors';
import { CheckInSettingsStyles, TranslateFn } from './checkInSettingsTypes';

// @ts-ignore
import { Ionicons } from '@expo/vector-icons';

const Text = AppText;

interface CheckInSettingsInfoModalProps {
  visible: boolean;
  onClose: () => void;
  styles: CheckInSettingsStyles;
  colors: AppColors;
  t: TranslateFn;
}

export function CheckInSettingsInfoModal({ visible, onClose, styles, colors, t }: CheckInSettingsInfoModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay}>
        <Pressable style={styles.infoModal} onPress={(event) => event.stopPropagation()}>
          <TouchableOpacity style={styles.infoClose} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.infoText}>
            {t('The countdown starts when you lock your screen. It resets every time you unlock your phone — so you\'ll only be prompted if you haven\'t unlocked your phone for the full interval.')}
            {'\n\n'}
            {t('If you don\'t dismiss the alarm within the grace period, the app can call 911 and alert your emergency contacts.')}
            {'\n\n'}
            {t('You can configure separate daytime and nighttime intervals, a grace period for dismissing the alarm, and additional notes for dispatchers or contacts.')}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
