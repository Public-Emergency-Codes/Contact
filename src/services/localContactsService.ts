import AsyncStorage from '@react-native-async-storage/async-storage';

// On-device emergency contacts (no accounts / no backend).
// Stored shape mirrors the snake_case rows the screens already read, so the UI
// code stays unchanged after swapping the old userAPI calls for this service.
const CONTACTS_KEY = '@emergency_contacts_v1';

type StoredContact = {
  id: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  relationship: string | null;
  priority: number;
  can_view_live_stream: boolean;
  notify_sms: boolean;
  contact_notes: string | null;
  include_address_in_sms: boolean;
  is_check_in_contact: boolean;
};

const genId = () =>
  `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

async function readAll(): Promise<StoredContact[]> {
  try {
    const raw = await AsyncStorage.getItem(CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(contacts: StoredContact[]): Promise<void> {
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

function toStored(data: any): Omit<StoredContact, 'id'> {
  return {
    contact_name: data.contactName,
    contact_phone: data.contactPhone,
    contact_email: data.contactEmail || null,
    relationship: data.relationship || null,
    priority: data.priority ?? 1,
    can_view_live_stream: data.canViewLiveStream !== false,
    notify_sms: data.notifySms !== false,
    contact_notes: data.contactNotes || null,
    include_address_in_sms: data.includeAddressInSms !== false,
    is_check_in_contact: data.isCheckInContact === true,
  };
}

export const localContacts = {
  getEmergencyContacts: async () => {
    const contacts = await readAll();
    contacts.sort((a, b) => (a.priority || 0) - (b.priority || 0));
    return { data: { contacts } };
  },
  addEmergencyContact: async (data: any) => {
    const contacts = await readAll();
    const contact: StoredContact = { id: genId(), ...toStored(data) };
    contacts.push(contact);
    await writeAll(contacts);
    return { data: { contact } };
  },
  updateEmergencyContact: async (id: string, data: any) => {
    const contacts = await readAll();
    const idx = contacts.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Contact not found');
    contacts[idx] = { id, ...toStored(data) };
    await writeAll(contacts);
    return { data: { contact: contacts[idx] } };
  },
  deleteEmergencyContact: async (id: string) => {
    const contacts = await readAll();
    await writeAll(contacts.filter((c) => c.id !== id));
    return { data: { success: true } };
  },
};

export default localContacts;
