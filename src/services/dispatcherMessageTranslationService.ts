/**
 * Translation Service (local-device-only)
 * Translates text between the user's language and English for E911 dispatcher
 * communication using ONLY the bundled/offline dictionaries — no network calls.
 *
 * Flow:
 *   User types in their language → mapped to English → sent to PSAP
 *   Dispatcher's English text → mapped to user's language → shown on screen
 *
 * Coverage is limited to phrases present in the bundled offline language packs
 * (see data/offlineLanguagePacks). Free-form text that is not in a pack is
 * passed through unchanged (graceful degradation) since arbitrary-language
 * machine translation cannot run fully offline without bundling large ML models.
 */

import { needsTranslation } from './languageConfig';
import {
  getOfflineTranslation,
  getEnglishFromOfflineTranslation,
} from './uiDictionaryStore';

interface TranslationResult {
  success: boolean;
  translatedText: string;
  originalText: string;
  error?: string;
}

/**
 * Translate the user's text TO English (for sending to the dispatcher).
 * Returns the original text unchanged if the language is English or no offline
 * mapping exists for the phrase.
 */
export async function translateToEnglish(
  text: string,
  userLangCode: string,
): Promise<TranslationResult> {
  if (!needsTranslation(userLangCode) || !text.trim()) {
    return { success: true, translatedText: text, originalText: text };
  }

  try {
    const english = await getEnglishFromOfflineTranslation(userLangCode, text);
    if (english) {
      return { success: true, translatedText: english, originalText: text };
    }
    // No offline mapping — pass the original through; dispatcher may still understand.
    return { success: false, translatedText: text, originalText: text, error: 'OFFLINE_NO_MATCH' };
  } catch (error: any) {
    return { success: false, translatedText: text, originalText: text, error: error?.message };
  }
}

/**
 * Translate English text FROM English to the user's language (for showing
 * dispatcher messages). Returns the original text unchanged if the language is
 * English or no offline mapping exists for the phrase.
 */
export async function translateFromEnglish(
  text: string,
  userLangCode: string,
): Promise<TranslationResult> {
  if (!needsTranslation(userLangCode) || !text.trim()) {
    return { success: true, translatedText: text, originalText: text };
  }

  try {
    const localized = await getOfflineTranslation(userLangCode, text);
    if (localized) {
      return { success: true, translatedText: localized, originalText: text };
    }
    return { success: false, translatedText: text, originalText: text, error: 'OFFLINE_NO_MATCH' };
  } catch (error: any) {
    return { success: false, translatedText: text, originalText: text, error: error?.message };
  }
}

export default {
  translateToEnglish,
  translateFromEnglish,
};
