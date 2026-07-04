/**
 * Language Configuration
 * Defines supported languages with their codes, display names,
 * TTS model suffixes (Facebook MMS-TTS), and Helsinki-NLP translation model IDs.
 * All translation is handled in-app via Hugging Face models.
 */

import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_LANGUAGE_KEY = '@user_preferred_language';

export interface LanguageEntry {
  /** ISO 639-1 code (e.g. 'en', 'es') */
  code: string;
  /** Display name in English */
  name: string;
  /** Native name */
  nativeName: string;
  /** Facebook MMS-TTS model suffix (e.g. 'eng', 'spa') — ISO 639-3 */
  ttsSuffix: string;
  /** Helsinki-NLP model for translating FROM this language TO English */
  toEnglishModel: string | null;
  /** Helsinki-NLP model for translating FROM English TO this language */
  fromEnglishModel: string | null;
}

/**
 * Supported languages — English is default, no translation needed.
 * Each non-English language maps to a Helsinki-NLP/opus-mt model pair.
 */
export const SUPPORTED_LANGUAGES: LanguageEntry[] = [
  { code: 'en', name: 'English', nativeName: 'English', ttsSuffix: 'eng',
    toEnglishModel: null, fromEnglishModel: null },
  { code: 'es', name: 'Spanish', nativeName: 'Español', ttsSuffix: 'spa',
    toEnglishModel: 'Helsinki-NLP/opus-mt-es-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-es' },
  { code: 'fr', name: 'French', nativeName: 'Français', ttsSuffix: 'fra',
    toEnglishModel: 'Helsinki-NLP/opus-mt-fr-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-fr' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', ttsSuffix: 'cmn',
    toEnglishModel: 'Helsinki-NLP/opus-mt-zh-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-zh' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', ttsSuffix: 'ara',
    toEnglishModel: 'Helsinki-NLP/opus-mt-ar-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-ar' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', ttsSuffix: 'rus',
    toEnglishModel: 'Helsinki-NLP/opus-mt-ru-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-ru' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', ttsSuffix: 'heb',
    toEnglishModel: 'Helsinki-NLP/opus-mt-he-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-he' },
  { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש', ttsSuffix: 'yid',
    toEnglishModel: 'Helsinki-NLP/opus-mt-yi-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-yi' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', ttsSuffix: 'deu',
    toEnglishModel: 'Helsinki-NLP/opus-mt-de-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-de' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', ttsSuffix: 'por',
    toEnglishModel: 'Helsinki-NLP/opus-mt-tc-big-en-pt', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-pt' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', ttsSuffix: 'kor',
    toEnglishModel: 'Helsinki-NLP/opus-mt-ko-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-ko' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', ttsSuffix: 'jpn',
    toEnglishModel: 'Helsinki-NLP/opus-mt-ja-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-jap' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', ttsSuffix: 'hin',
    toEnglishModel: 'Helsinki-NLP/opus-mt-hi-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-hi' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', ttsSuffix: 'ita',
    toEnglishModel: 'Helsinki-NLP/opus-mt-it-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-it' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', ttsSuffix: 'pol',
    toEnglishModel: 'Helsinki-NLP/opus-mt-pl-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-pl' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', ttsSuffix: 'ukr',
    toEnglishModel: 'Helsinki-NLP/opus-mt-uk-en', fromEnglishModel: 'Helsinki-NLP/opus-mt-en-uk' },
];

/** Look up a language entry by its ISO code */
export function getLanguage(code: string): LanguageEntry | undefined {
  return SUPPORTED_LANGUAGES.find(l => l.code === code);
}

/** Returns true when the language is NOT English and needs translation */
export function needsTranslation(code: string): boolean {
  return code !== 'en';
}

/**
 * Detect the device's system language
 * Returns the ISO 639-1 language code (e.g. 'en', 'es', 'fr')
 * Falls back to 'en' if detection fails
 */
export function getSystemLanguage(): string {
  try {
    // Try to get language from Settings module (Android) or Localization (iOS)
    const locale = Platform.OS === 'android'
      ? NativeModules.I18nManager?.localeIdentifier
      : NativeModules.SettingsManager?.settings?.AppleLocale;

    if (locale) {
      // Extract language code from locale string
      // Handles formats like: "en-US", "es_ES", "fr-FR", "zh-CN", etc.
      const langCode = locale.split(/[-_]/)[0].toLowerCase();

      // Check if this language is supported by the app
      if (SUPPORTED_LANGUAGES.find(l => l.code === langCode)) {
        return langCode;
      }
    }
  } catch {
    // Silently fail if detection fails
  }

  return 'en'; // Default fallback
}

/** Persist the user's preferred language */
export async function saveUserLanguage(code: string): Promise<void> {
  await AsyncStorage.setItem(USER_LANGUAGE_KEY, code);
}

/** Load previously saved language, or detect system language on first launch (defaults to 'en') */
export async function getUserLanguage(): Promise<string> {
  try {
    const code = await AsyncStorage.getItem(USER_LANGUAGE_KEY);

    // If user has already set a preference, use it
    if (code) {
      return code;
    }

    // On first launch, detect system language
    const systemLang = getSystemLanguage();
    // Save the detected system language so we don't detect it again
    await AsyncStorage.setItem(USER_LANGUAGE_KEY, systemLang);
    return systemLang;
  } catch {
    return 'en';
  }
}
