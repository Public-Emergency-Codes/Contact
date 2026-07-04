import React from 'react';
import { View } from 'react-native';
import AppText from '../../components/AppText';
import { AppColors } from '../../utils/themeColors';
import { CheckInConfig } from '../../store/slices/checkInSlice';
import ToggleSwitch from '../../components/ToggleSwitch';
import { CheckInSettingsStyles, TranslateFn } from './checkInSettingsTypes';

const Text = AppText;

interface CheckInEscalationSectionProps {
  styles: CheckInSettingsStyles;
  colors: AppColors;
  localConfig: CheckInConfig;
  update: (key: 'alertEmergencyContacts' | 'silentCheckIn', value: boolean) => void;
  t: TranslateFn;
}

export function CheckInEscalationSection({
  styles,
  localConfig,
  update,
  t,
}: CheckInEscalationSectionProps) {
  return (
    <View style={styles.scheduleCard}>
      <Text style={styles.scheduleHeader}>{t('When I Miss a Check-In')}</Text>

      {/* Only Alert Emergency Contacts */}
      <View style={[styles.intervalCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.intervalLabel, { flex: 1 }]}>{t('Only Alert Emergency Contacts')}</Text>
          <ToggleSwitch
            value={localConfig.alertEmergencyContacts}
            onValueChange={(value) => {
              update('alertEmergencyContacts', value);
              if (value) update('silentCheckIn', false);
            }}
          />
        </View>
        <Text style={[styles.intervalHint, { marginTop: 6 }]}>
          {t('Missed check-ins text your contacts — 911 is not called.')}
        </Text>
      </View>

      {/* Silent Check-In */}
      <View style={[styles.intervalCard, { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.intervalLabel, { flex: 1 }]}>{t('Silent Check-In')}</Text>
          <ToggleSwitch
            value={localConfig.silentCheckIn}
            onValueChange={(value) => {
              update('silentCheckIn', value);
              if (value) update('alertEmergencyContacts', false);
            }}
          />
        </View>
        <Text style={[styles.intervalHint, { marginTop: 6 }]}>
          {t('No alarm sounds and 911 is never called. Your contacts get a quiet text and can decide whether to send help.')}
        </Text>
      </View>
    </View>
  );
}
