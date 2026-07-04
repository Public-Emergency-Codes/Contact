/**
 * Location History Service (local-device-only)
 *
 * Stores recent GPS breadcrumbs locally so they can be attached to an
 * emergency. Unlike the in-memory tracking during an active call, this
 * service persists the last N location points to AsyncStorage so they
 * survive app restarts and are available for attaching to emergency
 * records.
 *
 * No server calls — everything stays on the device.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EnhancedLocation } from './locationModels';

export interface LocationBreadcrumb {
  latitude: number;
  longitude: number;
  accuracy: number;
  method: string;
  timestamp: number;
  /** Cell tower telemetry at this point */
  raw_mcc?: number | null;
  raw_mnc?: number | null;
  raw_lac_tac?: number | null;
  raw_cid?: number | null;
  cell_resolved_lat?: number | null;
  cell_resolved_lon?: number | null;
  /** WiFi networks observed at this point */
  wifiNetworks?: Array<{ bssid: string; signalStrength: number }>;
}

const STORAGE_KEY = '@location_history_v1';
const MAX_BREADCRUMBS = 500;
const FLUSH_INTERVAL_MS = 60_000; // Flush to disk at most once per minute

class LocationHistoryService {
  private buffer: LocationBreadcrumb[] = [];
  private loaded = false;
  private lastFlush = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /** Load persisted breadcrumbs from disk. */
  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LocationBreadcrumb[];
        this.buffer = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      this.buffer = [];
    }
    this.loaded = true;
  }

  /** Persist breadcrumbs to AsyncStorage (debounced). */
  private async flush(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFlush < FLUSH_INTERVAL_MS) {
      // Schedule a flush if one isn't already pending
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          this.flush();
        }, FLUSH_INTERVAL_MS);
      }
      return;
    }
    this.lastFlush = now;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.buffer));
    } catch (e) {
      console.warn('[LocationHistory] flush failed:', e);
    }
  }

  /**
   * Record a new location breadcrumb.
   * Call this from the location tracking callback.
   */
  async recordLocation(location: EnhancedLocation): Promise<void> {
    await this.load();

    const crumb: LocationBreadcrumb = {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      method: location.method,
      timestamp: location.timestamp || Date.now(),
      raw_mcc: location.raw_mcc,
      raw_mnc: location.raw_mnc,
      raw_lac_tac: location.raw_lac_tac,
      raw_cid: location.raw_cid,
      cell_resolved_lat: location.cell_resolved_lat,
      cell_resolved_lon: location.cell_resolved_lon,
      wifiNetworks: location.wifiNetworks,
    };

    this.buffer.push(crumb);

    // Keep only the latest MAX_BREADCRUMBS
    if (this.buffer.length > MAX_BREADCRUMBS) {
      this.buffer = this.buffer.slice(this.buffer.length - MAX_BREADCRUMBS);
    }

    await this.flush();
  }

  /**
   * Get the most recent N breadcrumbs for attaching to an emergency.
   * @param count Maximum number of breadcrumbs to return (default 50)
   * @param since Only return breadcrumbs after this timestamp (default 24h ago)
   */
  async getRecentBreadcrumbs(
    count: number = 50,
    since: number = Date.now() - 86_400_000, // last 24 hours
  ): Promise<LocationBreadcrumb[]> {
    await this.load();
    return this.buffer
      .filter((b) => b.timestamp >= since)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count);
  }

  /**
   * Get breadcrumbs specifically for an emergency event window.
   * Returns points from a few minutes before to the end of the event.
   */
  async getBreadcrumbsForTimeRange(
    fromTime: number,
    toTime: number,
    maxPoints: number = 100,
  ): Promise<LocationBreadcrumb[]> {
    await this.load();
    return this.buffer
      .filter((b) => b.timestamp >= fromTime && b.timestamp <= toTime)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-maxPoints);
  }

  /** Get the total count of stored breadcrumbs. */
  async getCount(): Promise<number> {
    await this.load();
    return this.buffer.length;
  }

  /** Clear all stored breadcrumbs. */
  async clearAll(): Promise<void> {
    this.buffer = [];
    this.loaded = true;
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Force an immediate flush to disk.
   * Call this before an emergency activation to ensure recent points are saved.
   */
  async forceFlush(): Promise<void> {
    this.lastFlush = 0;
    await this.flush();
  }
}

export default new LocationHistoryService();
