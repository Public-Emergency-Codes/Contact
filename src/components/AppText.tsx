/**
 * AppText — drop-in replacement for <Text> that respects the global text-scale
 * preference and the active app language (instant synchronous translation via
 * the offline dictionary loaded in AppLanguageContext).
 *
 * Usage:  import AppText from '../../components/AppText';
 *         Replace <Text style={styles.foo}> with <AppText style={styles.foo}>
 */
import React, { useMemo } from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useTextScale } from '../context/TextScaleContext';
import { useAppLanguage } from '../context/AppLanguageContext';
import { normalizeOfflinePhrase } from '../services/uiDictionaryStore';

function translateStringChild(
  value: string,
  languageCode: string,
  dictionary: Record<string, string>,
) {
  if (languageCode === 'en') return value;
  const trimmed = value.trim();
  if (!trimmed || !/[A-Za-z]/.test(trimmed)) return value;
  const key = normalizeOfflinePhrase(value);
  return dictionary[key] || value;
}

function translateChildren(
  children: React.ReactNode,
  languageCode: string,
  dictionary: Record<string, string>,
): React.ReactNode {
  if (typeof children === 'string') {
    return translateStringChild(children, languageCode, dictionary);
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <React.Fragment key={index}>
        {translateChildren(child, languageCode, dictionary)}
      </React.Fragment>
    ));
  }

  return children;
}

export default function AppText({ style, children, ...props }: TextProps) {
  const { textScale } = useTextScale();
  const { languageCode, dictionary } = useAppLanguage();

  const scaledStyle = useMemo(() => {
    if (textScale === 1) return style;
    const flat = StyleSheet.flatten(style);
    if (!flat?.fontSize) return style;
    return [style, { fontSize: flat.fontSize * textScale }];
  }, [style, textScale]);

  const displayChildren = useMemo(() => {
    return translateChildren(children, languageCode, dictionary);
  }, [children, languageCode, dictionary]);

  return (
    <Text style={scaledStyle} {...props}>
      {displayChildren}
    </Text>
  );
}
