import React, { useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PERMISSIONS_LIST, isGranted } from '../utils/appPermissions';

import PermissionOnboardingScreen from '../screens/Auth/PermissionOnboardingScreen';
import PermissionManagementScreen from '../screens/Settings/PermissionManagementScreen';
import TabContainer from './TabContainer';
import EmergencyContactsScreen from '../screens/Settings/EmergencyContactsScreen';
import RecordingLibraryScreen from '../screens/Recordings/RecordingLibraryScreen';
import EmergencyCallScreen from '../screens/EmergencyCall/EmergencyCallScreen';
import CheckInSettingsScreen from '../screens/CheckIn/CheckInSettingsScreen';
import CheckInAlarmScreen from '../screens/CheckIn/CheckInAlarmScreen';
import SavedAddressesScreen from '../screens/Settings/SavedAddressesScreen';
import AddressEditorScreen from '../screens/Settings/AddressEditorScreen';
import EditProfileScreen from '../screens/Profile/EditProfileScreen';
import ChatWindow from '../screens/Home/ChatWindow';
import ContactDetailsScreen from '../screens/Home/ContactDetailsScreen';

export type RootStackParamList = {
  Setup: undefined;
  Permissions: undefined;
  Home: { initialPage?: 'home' | 'record' | 'settings'; initialHomeTab?: 'chat'; initialHomeTabRequestId?: number; pendingShare?: { mimeType: string; text?: string; uris?: string[]; subject?: string } } | undefined;
  EmergencyContacts: undefined;
  Recordings: undefined;
  E911Call: {
    prefill?: string;
    emergencyNumber?: string;
    showInitiateCallButton?: boolean;
    callInitiated?: boolean;
    autoInitiateCall?: boolean;
    withVideo?: boolean;
    startNewSession?: boolean;
    e911ActionId?: number;
    source?: string;
  };
  CheckInSettings: undefined;
  CheckInAlarm: undefined;
  SavedAddresses: undefined;
  AddEditAddress: undefined;
  EditProfile: undefined;
  ChatWindow: { threadId: string; address: string; contactName?: string };
  ContactDetails: { threadId: string; address: string; contactName?: string };
};

const Stack = createStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    const determineRoute = async () => {
      const setupDone = await AsyncStorage.getItem('setup_complete');
      if (setupDone !== 'true') { setInitialRoute('Setup'); return; }
      const criticalPerms = PERMISSIONS_LIST.filter((p: any) => p.critical);
      const checks = await Promise.all(
        criticalPerms.map(async (p: any) => {
          try { return isGranted(await p.checkPerm()); } catch { return false; }
        })
      );
      if (checks.some((ok: boolean) => !ok)) {
        await AsyncStorage.removeItem('setup_complete');
        setInitialRoute('Setup');
      } else {
        setInitialRoute('Home');
      }
    };
    determineRoute();
  }, []);

  if (!initialRoute) return null;

  return (
    <Stack.Navigator id="root-stack" initialRouteName={initialRoute} screenOptions={{ headerShown: false, animation: 'none' }}>
      <Stack.Screen name="Setup" component={PermissionOnboardingScreen} />
      <Stack.Screen name="Permissions" component={PermissionManagementScreen} />
      <Stack.Screen name="Home" component={TabContainer} />
      <Stack.Screen name="EmergencyContacts" component={EmergencyContactsScreen} />
      <Stack.Screen name="Recordings" component={RecordingLibraryScreen} />
      <Stack.Screen name="E911Call" component={EmergencyCallScreen} />
      <Stack.Screen name="CheckInSettings" component={CheckInSettingsScreen} />
      <Stack.Screen name="CheckInAlarm" component={CheckInAlarmScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="SavedAddresses" component={SavedAddressesScreen} />
      <Stack.Screen name="AddEditAddress" component={AddressEditorScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ChatWindow" component={ChatWindow} />
      <Stack.Screen name="ContactDetails" component={ContactDetailsScreen} />
    </Stack.Navigator>
  );
}
