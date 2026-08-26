import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../../components/AppText';
import { useTheme } from '../../context/ThemeContext';
import { LEGAL_LINKS } from './legalContent';

const Text = AppText;

export default function LegalHubScreen({ navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors, insets.top), [colors, insets.top]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>About & Legal</Text>
        <View style={styles.spacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Important information about privacy, emergency use, your local data, and open-source software.</Text>
        {LEGAL_LINKS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={styles.card}
            onPress={() => navigation.navigate('LegalDocument', { document: item.key })}
            accessibilityRole="button"
          >
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDescription}>{item.description}</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.version}>Contact 1.0.2 · Public Emergency Codes</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, topInset: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: topInset + 12, paddingBottom: 16, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: 34, lineHeight: 36 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  spacer: { width: 42 },
  content: { padding: 18, paddingBottom: 40 },
  intro: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, marginBottom: 14 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cardText: { flex: 1, marginRight: 12 },
  cardTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cardDescription: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  arrow: { color: colors.textMuted, fontSize: 28 },
  version: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 12 },
});
