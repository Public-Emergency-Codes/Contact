import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { getUserLanguage, saveUserLanguage } from '../services/languageConfig';
import { getLanguageDictionary } from '../services/uiDictionaryStore';
import { loadCachedUiDictionary } from '../services/uiDictionaryCache';

interface AppLanguageContextValue {
  languageCode: string;
  setLanguageCode: (code: string) => Promise<void>;
  dictionary: Record<string, string>;
}

const AppLanguageContext = createContext<AppLanguageContextValue>({
  languageCode: 'en',
  setLanguageCode: async () => {},
  dictionary: {},
});

export function AppLanguageProvider({ children }: { children: React.ReactNode }) {
  const [languageCode, setLanguageCodeState] = useState('en');
  const [dictionary, setDictionary] = useState<Record<string, string>>({});

  useEffect(() => {
    getUserLanguage()
      .then((code) => setLanguageCodeState(code || 'en'))
      .catch(() => setLanguageCodeState('en'));
  }, []);

  // Load the full phrase dictionary whenever the language changes.
  // getLanguageDictionary hits an in-memory cache after the first call,
  // so this is effectively synchronous after the pack is downloaded.
  const loadDictionary = useCallback((code: string) => {
    if (code === 'en') {
      setDictionary({});
      return;
    }
    Promise.all([
      loadCachedUiDictionary(code),
      getLanguageDictionary(code),
    ])
      .then(([cachedDictionary, offlineDictionary]) => {
        setDictionary({ ...offlineDictionary, ...cachedDictionary });
      })
      .catch(() => setDictionary({}));
  }, []);

  useEffect(() => { loadDictionary(languageCode); }, [languageCode]);

  const setLanguageCode = useCallback(async (code: string) => {
    const next = code || 'en';
    setLanguageCodeState(next);
    await saveUserLanguage(next);
  }, []);

  const value = useMemo(
    () => ({ languageCode, setLanguageCode, dictionary }),
    [languageCode, setLanguageCode, dictionary],
  );

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}

export function useAppLanguage(): AppLanguageContextValue {
  return useContext(AppLanguageContext);
}
