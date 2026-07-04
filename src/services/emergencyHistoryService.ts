/**
 * Emergency History Service (local-device-only)
 *
 * Stores past emergencies locally in AsyncStorage so users can view
 * their emergency history. Also provides scheduled cleanup of old
 * records (90-day purge) on app launch.
 *
 * No server calls — everything stays on the device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface EmergencyHistoryRecord {
  id: string;
  activatedAt: string;          // ISO timestamp
  deactivatedAt?: string;       // ISO timestamp
  latitude: number;
  longitude: number;
  address?: string;
  emergencyType: string;        // 'medical' | 'fire' | 'law_enforcement' | 'general'
  resolutionType?: string;      // 'resolved' | 'false_alarm' | 'cancelled'
  duration?: number;            // seconds
  smsSentCount?: number;
  telemetrySnapshot?: {
    raw_mcc: number | null;
    raw_mnc: number | null;
    raw_lac_tac: number | null;
    raw_cid: number | null;
    cell_resolved_lat: number | null;
    cell_resolved_lon: number | null;
    wifi_resolved_json_array: Array<{ bssid: string; signalStrength: number }>;
  };
}

const STORAGE_KEY = '@emergency_history_v1';
const MAX_HISTORY = 50;
const RETENTION_DAYS = 90;
const CLEANUP_LAST_RUN_KEY = '@emergency_history_cleanup_last_run';

class EmergencyHistoryService {
  private history: EmergencyHistoryRecord[] | null = null;

  /** Load history from AsyncStorage. */
  private async load(): Promise<EmergencyHistoryRecord[]> {
    if (this.history) return this.history;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      this.history = raw ? JSON.parse(raw) : [];
    } catch {
      this.history = [];
    }
    return this.history;
  }

  /** Persist history to AsyncStorage. */
  private async save(): Promise<void> {
    if (!this.history) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.history));
    } catch (e) {
      console.warn('[EmergencyHistory] persist failed:', e);
    }
  }

  /** Get all history records, newest first. */
  async getAll(): Promise<EmergencyHistoryRecord[]> {
    const h = await this.load();
    return [...h].sort(
      (a, b) => new Date(b.activatedAt).getTime() - new Date(a.activatedAt).getTime(),
    );
  }

  /** Get a single record by ID. */
  async getById(id: string): Promise<EmergencyHistoryRecord | null> {
    const h = await this.load();
    return h.find((r) => r.id === id) ?? null;
  }

  /** Add a new emergency record. */
  async addRecord(record: EmergencyHistoryRecord): Promise<void> {
    const h = await this.load();
    h.unshift(record);
    // Keep only the latest MAX_HISTORY records
    if (h.length > MAX_HISTORY) {
      h.length = MAX_HISTORY;
    }
    this.history = h;
    await this.save();
  }

  /** Update an existing record (e.g. when emergency is deactivated). */
  async updateRecord(id: string, updates: Partial<EmergencyHistoryRecord>): Promise<void> {
    const h = await this.load();
    const idx = h.findIndex((r) => r.id === id);
    if (idx !== -1) {
      h[idx] = { ...h[idx], ...updates };
      this.history = h;
      await this.save();
    }
  }

  /** Delete a specific record. */
  async deleteRecord(id: string): Promise<void> {
    const h = await this.load();
    this.history = h.filter((r) => r.id !== id);
    await this.save();
  }

  /** Clear all history. */
  async clearAll(): Promise<void> {
    this.history = [];
    await this.save();
  }

  /**
   * #12 - Scheduled data cleanup (90-day purge).
   * Call this on app launch. Deletes records older than RETENTION_DAYS.
   * Tracks last-run timestamp to avoid running on every cold start.
   */
  async performCleanupIfNeeded(): Promise<number> {
    try {
      const lastRun = await AsyncStorage.getItem(CLEANUP_LAST_RUN_KEY);
      const now = Date.now();

      // Only run cleanup once per day
      if (lastRun && now - parseInt(lastRun, 10) < 86_400_000) {
        return 0;
      }

      const h = await this.load();
      const cutoff = now - RETENTION_DAYS * 86_400_000;
      const before = h.length;
      this.history = h.filter((r) => new Date(r.activatedAt).getTime() > cutoff);
      const purged = before - this.history.length;

      if (purged > 0) {
        console.log(`[EmergencyHistory] Cleanup: purged ${purged} old records`);
        await this.save();
      }

      await AsyncStorage.setItem(CLEANUP_LAST_RUN_KEY, now.toString());
      return purged;
    } catch (e) {
      console.warn('[EmergencyHistory] Cleanup failed:', e);
      return 0;
    }
  }

  /**
   * Clean up any other old AsyncStorage keys.
   * Extensible — add more keys as needed.
   */
  async purgeOldAsyncStorageData(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();

      const keysToCheck = allKeys.filter((key) =>
        key.startsWith('@emergency_') ||
        key.startsWith('@location_history_') ||
        key.startsWith('@calibration_'),
      );

      const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;

      for (const key of keysToCheck) {
        try {
          const raw = await AsyncStorage.getItem(key);
          if (!raw) continue;
          const data = JSON.parse(raw);
          if (Array.isArray(data)) {
            // If it's an array of objects with timestamps, filter old ones
            if (data.length > 0 && typeof data[0] === 'object' && data[0].timestamp) {
              const filtered = data.filter((item: any) => item.timestamp > cutoff);
              if (filtered.length !== data.length) {
                await AsyncStorage.setItem(key, JSON.stringify(filtered));
              }
            }
          }
        } catch {
          // Skip unparseable keys
        }
      }
    } catch (e) {
      console.warn('[EmergencyHistory] AsyncStorage purge failed:', e);
    }
  }
}

export default new EmergencyHistoryService();
