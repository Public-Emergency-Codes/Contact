import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from './legalContent';

const Text = AppText;

export default function LegalDocumentScreen({ navigation, route }: any) {
  const key = route?.params?.document as LegalDocumentKey;
  const document = LEGAL_DOCUMENTS[key] ?? LEGAL_DOCUMENTS.privacy;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text numberOfLines={2} style={styles.title}>{document.title}</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated: {document.updated}</Text>
        <Text style={styles.summary}>{document.summary}</Text>
        {document.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.paragraphs.map((paragraph) => <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>)}
            {section.bullets?.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, topInset: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: topInset + 12, paddingBottom: 16, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: 34, lineHeight: 36 },
  title: { flex: 1, color: colors.textPrimary, fontSize: 19, lineHeight: 23, fontWeight: '700', textAlign: 'center' },
  spacer: { width: 42 },
  content: { padding: 20, paddingBottom: 48 },
  updated: { color: colors.textMuted, fontSize: 12, marginBottom: 10 },
  summary: { color: colors.textPrimary, fontSize: 16, lineHeight: 24, fontWeight: '600', marginBottom: 22 },
  section: { marginBottom: 22 },
  heading: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  paragraph: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginBottom: 10 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, paddingRight: 4 },
  bullet: { color: colors.textPrimary, fontSize: 16, lineHeight: 22, width: 20 },
  bulletText: { flex: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
});
