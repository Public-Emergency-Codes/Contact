/**
 * AppTextInput — drop-in replacement for <TextInput> that automatically
 * translates its `placeholder` prop using the active app language dictionary.
 *
 * Usage:  import AppTextInput from '../../components/AppTextInput';
 *         Replace <TextInput placeholder="Email" ...> with <AppTextInput placeholder="Email" ...>
 */
import React from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { useAppLanguage } from '../context/AppLanguageContext';
import { normalizeOfflinePhrase } from '../services/uiDictionaryStore';

export default function AppTextInput({ placeholder, ...props }: TextInputProps) {
  const { languageCode, dictionary } = useAppLanguage();

  const translatedPlaceholder = React.useMemo(() => {
    if (!placeholder || typeof placeholder !== 'string') return placeholder;
    if (languageCode === 'en') return placeholder;
    const key = normalizeOfflinePhrase(placeholder);
    return dictionary[key] || placeholder;
  }, [placeholder, languageCode, dictionary]);

  return <TextInput placeholder={translatedPlaceholder} {...props} />;
}
