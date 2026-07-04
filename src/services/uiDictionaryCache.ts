import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@backend_ui_dict_';

type DictMap = Record<string, string>;

export async function readCachedUiDictionary(langCode: string): Promise<DictMap> {
  if (!langCode || langCode === 'en') return {};
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${langCode}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DictMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeCachedUiDictionary(
  langCode: string,
  dictionary: DictMap,
): Promise<void> {
  if (!langCode || langCode === 'en') return;
  await AsyncStorage.setItem(`${CACHE_PREFIX}${langCode}`, JSON.stringify(dictionary || {}));
}

export async function loadCachedUiDictionary(langCode: string): Promise<DictMap> {
  if (!langCode || langCode === 'en') return {};
  return readCachedUiDictionary(langCode);
}
