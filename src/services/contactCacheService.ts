/**
 * Emergency Contact Cache Service
 *
 * Caches emergency contacts in AsyncStorage so they are available
 * even when the backend is unreachable during an emergency.
 * Contacts are synced whenever they are successfully fetched from the API.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localContacts } from './localContactsService';

const CACHE_KEY = '@emergency_contacts_cache';

export interface CachedContact {
  id: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  relationship?: string;
  priority: number;
  notify_sms: boolean;
  include_address_in_sms?: boolean;
  is_check_in_contact?: boolean;
}

class ContactCacheService {
  /**
   * Save contacts to local storage.
   * Called whenever contacts are successfully fetched from the API.
   */
  async cacheContacts(contacts: CachedContact[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(contacts));
      console.log(`[ContactCache] Cached ${contacts.length} contacts locally`);
    } catch (err) {
      console.warn('[ContactCache] Failed to cache contacts:', err);
    }
  }

  /** Retrieve contacts from local cache. */
  async getCachedContacts(): Promise<CachedContact[]> {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as CachedContact[];
    } catch {
      return [];
    }
  }

  /**
   * Fetch contacts from API with local-cache fallback.
   * On success the cache is refreshed automatically.
   * On failure the last cached contacts are returned so SMS can still be sent.
   */
  async getContactsWithFallback(): Promise<CachedContact[]> {
    try {
      const response = await localContacts.getEmergencyContacts();
      const contacts: CachedContact[] = response.data.contacts || [];
      await this.cacheContacts(contacts);
      return contacts;
    } catch (_apiError) {
      console.warn('[ContactCache] Local contacts unavailable, using cached contacts');
      return this.getCachedContacts();
    }
  }

  /** Clear the local cache (e.g. on logout). */
  async clearCache(): Promise<void> {
    await AsyncStorage.removeItem(CACHE_KEY);
  }
}

const contactCacheService = new ContactCacheService();
export default contactCacheService;
