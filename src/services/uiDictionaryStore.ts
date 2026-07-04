import AsyncStorage from '@react-native-async-storage/async-storage';
import { OFFLINE_UI_PHRASES } from '../constants/offlineUiPhrases';
import { OFFLINE_LANGUAGE_PACKS } from '../data/offlineLanguagePacks';
import { needsTranslation } from './languageConfig';

const OFFLINE_DICT_PREFIX = '@offline_dict_';
const OFFLINE_DICT_META = '@offline_dict_meta';
const DICT_VERSION = 18;

type OfflineMeta = {
  installed: Record<string, { version: number; updatedAt: number; count: number }>;
};

const memoryCache = new Map<string, Record<string, string>>();

export function normalizeOfflinePhrase(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isClearlyTranslated(source: string, translated: string): boolean {
  const a = normalizeOfflinePhrase(source).toLowerCase();
  const b = normalizeOfflinePhrase(translated).toLowerCase();
  if (!b) return false;
  return a !== b;
}

async function getMeta(): Promise<OfflineMeta> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_DICT_META);
    if (!raw) return { installed: {} };
    const parsed = JSON.parse(raw) as OfflineMeta;
    return parsed?.installed ? parsed : { installed: {} };
  } catch {
    return { installed: {} };
  }
}

async function setMeta(meta: OfflineMeta): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_DICT_META, JSON.stringify(meta));
}

async function loadDictionary(code: string): Promise<Record<string, string>> {
  const cached = memoryCache.get(code);
  if (cached) return cached;

  try {
    const raw = await AsyncStorage.getItem(`${OFFLINE_DICT_PREFIX}${code}`);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    memoryCache.set(code, parsed);
    return parsed;
  } catch {
    return {};
  }
}

export async function isOfflineDictionaryInstalled(code: string): Promise<boolean> {
  if (!needsTranslation(code)) return true;
  const meta = await getMeta();
  const entry = meta.installed[code];
  return !!entry && entry.version >= DICT_VERSION;
}

export async function getOfflineDictionaryStatus(): Promise<Record<string, boolean>> {
  const meta = await getMeta();
  const status: Record<string, boolean> = { en: true };
  Object.keys(meta.installed).forEach((code: string) => {
    status[code] = (meta.installed[code]?.version || 0) >= DICT_VERSION;
  });
  return status;
}

export async function downloadOfflineDictionary(
  code: string,
  onProgress?: (progressPercent: number) => void,
): Promise<{ success: boolean; translatedCount: number }> {
  if (!needsTranslation(code)) {
    onProgress?.(100);
    return { success: true, translatedCount: 0 };
  }

  const entries: Record<string, string> = {};
  const total = OFFLINE_UI_PHRASES.length;
  const bundled = OFFLINE_LANGUAGE_PACKS[code] || {};
  let translatedCount = 0;

  for (let i = 0; i < total; i += 1) {
    const phrase = OFFLINE_UI_PHRASES[i];
    const key = normalizeOfflinePhrase(phrase);

    if (bundled[key]) {
      entries[key] = bundled[key];
      if (isClearlyTranslated(phrase, bundled[key])) translatedCount += 1;
      onProgress?.(Math.round(((i + 1) / total) * 100));
      continue;
    }

    // No translation available — keep English for this phrase.
    entries[key] = phrase;
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  // Save whatever bundled coverage is available. AppText falls back to English.
  if (translatedCount < Math.ceil(total * 0.25)) {
    console.warn(`[offlineDict] Low bundled translation coverage for ${code}: ${translatedCount}/${total}`);
  }

  await AsyncStorage.setItem(`${OFFLINE_DICT_PREFIX}${code}`, JSON.stringify(entries));
  memoryCache.set(code, entries);

  const meta = await getMeta();
  meta.installed[code] = {
    version: DICT_VERSION,
    updatedAt: Date.now(),
    count: Object.keys(entries).length,
  };
  await setMeta(meta);

  return { success: true, translatedCount };
}

export async function removeOfflineDictionary(code: string): Promise<void> {
  if (!needsTranslation(code)) return;
  await AsyncStorage.removeItem(`${OFFLINE_DICT_PREFIX}${code}`);
  memoryCache.delete(code);

  const meta = await getMeta();
  delete meta.installed[code];
  await setMeta(meta);
}

export async function getOfflineTranslation(
  code: string,
  englishText: string,
): Promise<string | null> {
  if (!needsTranslation(code)) return englishText;
  const dict = await loadDictionary(code);
  return dict[normalizeOfflinePhrase(englishText)] ?? null;
}

export async function getEnglishFromOfflineTranslation(
  code: string,
  localizedText: string,
): Promise<string | null> {
  if (!needsTranslation(code)) return localizedText;
  const needle = normalizeOfflinePhrase(localizedText).toLowerCase();
  if (!needle) return null;
  const dict = await loadDictionary(code);

  for (const [englishKey, translatedValue] of Object.entries(dict)) {
    if (normalizeOfflinePhrase(translatedValue).toLowerCase() === needle) {
      return englishKey;
    }
  }
  return null;
}

/** Load the full dictionary for a language (uses memory cache after first load). */
export async function getLanguageDictionary(code: string): Promise<Record<string, string>> {
  if (!needsTranslation(code)) return {};

  // If this pack is outdated, refresh it so newly added UI phrases are available.
  const installed = await isOfflineDictionaryInstalled(code);
  if (!installed) {
    try {
      await downloadOfflineDictionary(code);
    } catch {
      // Best-effort refresh; fall back to whatever is currently cached.
    }
  }

  const storedDict = await loadDictionary(code);
  // Always merge bundled OFFLINE_LANGUAGE_PACKS as a floor so newly added
  // auto-translated phrases (from OFFLINE_AUTO_PACKS) are available immediately
  // even if the installed pack predates them. Stored/backend data wins.
  const bundled = OFFLINE_LANGUAGE_PACKS[code] || {};
  return { ...bundled, ...storedDict };
}
