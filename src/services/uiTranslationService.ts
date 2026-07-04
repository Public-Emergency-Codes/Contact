import { getUserLanguage, needsTranslation } from './languageConfig';
import { loadCachedUiDictionary } from './uiDictionaryCache';
import {
  getLanguageDictionary,
  normalizeOfflinePhrase,
} from './uiDictionaryStore';

type DictionaryMap = Record<string, string>;

const runtimeDictionaryCache = new Map<string, DictionaryMap>();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function translateWithDictionary(
  value: string,
  languageCode: string,
  dictionary: DictionaryMap,
): string {
  if (!value || languageCode === 'en') return value;

  const key = normalizeOfflinePhrase(value);
  if (!key) return value;
  if (dictionary[key]) return dictionary[key];

  for (const [templateKey, translatedTemplate] of Object.entries(dictionary)) {
    if (!/\{[^}]+\}/.test(templateKey)) continue;

    const pattern = new RegExp(
      `^${escapeRegex(templateKey).replace(/\\\{[^}]+\\\}/g, '(.+?)')}$`,
    );
    const match = key.match(pattern);
    if (!match) continue;

    let output = translatedTemplate;
    for (let i = 1; i < match.length; i += 1) {
      output = output.replace(/\{[^}]+\}/, match[i]);
    }
    return output;
  }

  return value;
}

async function getRuntimeDictionary(languageCode: string): Promise<DictionaryMap> {
  if (!needsTranslation(languageCode)) return {};
  const cached = runtimeDictionaryCache.get(languageCode);
  if (cached) return cached;

  let cachedDictionary: DictionaryMap = {};
  let offline: DictionaryMap = {};

  try {
    [cachedDictionary, offline] = await Promise.all([
      loadCachedUiDictionary(languageCode),
      getLanguageDictionary(languageCode),
    ]);
  } catch {
    cachedDictionary = {};
    offline = {};
  }

  const merged = { ...offline, ...cachedDictionary };
  runtimeDictionaryCache.set(languageCode, merged);
  return merged;
}

export async function translateRuntimeText(value: string): Promise<string> {
  if (!value || typeof value !== 'string') return value;

  const languageCode = await getUserLanguage();
  if (!needsTranslation(languageCode)) return value;

  const dictionary = await getRuntimeDictionary(languageCode);
  return translateWithDictionary(value, languageCode, dictionary);
}
