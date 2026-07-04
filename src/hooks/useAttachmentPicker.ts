import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Contacts from 'expo-contacts/legacy';

export type PendingAttachment = { uri: string; mimeType: string };

export function useAttachmentPicker(_address: string) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Pending MMS attachments that will be sent together with the next text message
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const addAttachment = useCallback((uri: string, mimeType: string) => {
    if (!uri) return;
    setPendingAttachments(prev => [...prev, { uri, mimeType }]);
    console.log('[ChatWindow] Attachment queued:', uri, mimeType);
  }, []);

  const clearAttachments = useCallback(() => {
    setPendingAttachments([]);
  }, []);

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow access to photos'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    // @ts-ignore
    const uri = (res.assets && res.assets[0]?.uri) || (res as any).uri;
    if (uri) addAttachment(uri, 'image/*');
    setPickerOpen(false);
  }, [addAttachment]);

  const pickVideo = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow access to videos'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.8 });
    // @ts-ignore
    const uri = (res.assets && res.assets[0]?.uri) || (res as any).uri;
    if (uri) addAttachment(uri, 'video/*');
    setPickerOpen(false);
  }, [addAttachment]);

  const pickDocument = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
    if (!res.canceled && res.assets[0]) {
      addAttachment(res.assets[0].uri, res.assets[0].mimeType || '');
    }
    setPickerOpen(false);
  }, [addAttachment]);

  const pickContact = useCallback(async (): Promise<string | undefined> => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow access to contacts'); return undefined; }
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name], pageSize: 50 });
    if (!data || data.length === 0) { Alert.alert('No contacts', 'No contacts found'); return undefined; }
    const withPhone = data.find(c => c.phoneNumbers && c.phoneNumbers.length);
    if (!withPhone) { Alert.alert('No phone numbers', 'No contact with phone number found'); return undefined; }
    return withPhone.phoneNumbers[0].number;
  }, []);

  return { pickerOpen, setPickerOpen, pickImage, pickVideo, pickDocument, pickContact, addAttachment, pendingAttachments, clearAttachments };
}
