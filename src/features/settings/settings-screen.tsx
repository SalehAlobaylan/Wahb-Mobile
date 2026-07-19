import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

import {
  defaultLanguagePreferences,
  readLanguagePreferences,
  writeLanguagePreferences,
  type ContentLanguage,
  type UiLanguage,
} from './language-preferences';

export function SettingsScreen() {
  const { t } = useTranslation();
  const stored = useQuery({ queryKey: ['language-preferences'], queryFn: readLanguagePreferences });
  const [override, setOverride] = useState<{
    uiLanguage?: UiLanguage;
    contentLanguage?: ContentLanguage;
  }>({});
  const current = { ...defaultLanguagePreferences(), ...stored.data, ...override };
  const update = (next: Partial<typeof current>) => {
    const preferences = { ...current, ...next };
    setOverride(preferences);
    void writeLanguagePreferences(preferences);
  };
  return <SafeAreaView style={styles.root}><View style={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><ChevronLeft color={colors.ink} size={24} /></Pressable>
    <Text style={styles.title}>{t('settings.title')}</Text>
    <Text style={styles.label}>{t('settings.uiLanguage')}</Text>
    <Choice value="ar" selected={current.uiLanguage} label={t('settings.arabic')} onPress={() => update({ uiLanguage: 'ar' })} />
    <Choice value="en" selected={current.uiLanguage} label={t('settings.english')} onPress={() => update({ uiLanguage: 'en' })} />
    <Text style={styles.note}>{t('settings.rtlNote')}</Text>
    <Text style={styles.label}>{t('settings.contentLanguage')}</Text>
    <Choice value="ar" selected={current.contentLanguage} label={t('settings.arabic')} onPress={() => update({ contentLanguage: 'ar' })} />
    <Choice value="en" selected={current.contentLanguage} label={t('settings.english')} onPress={() => update({ contentLanguage: 'en' })} />
    <Choice value="both" selected={current.contentLanguage} label={t('settings.both')} onPress={() => update({ contentLanguage: 'both' })} />
    <Text style={styles.note}>{t('settings.contentNote')}</Text>
  </View></SafeAreaView>;
}

function Choice({ value, selected, label, onPress }: { value: string; selected: string; label: string; onPress: () => void }) {
  const active = value === selected;
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><View style={[styles.dot, active && styles.dotActive]} /><Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({ root: { backgroundColor: colors.paper, flex: 1 }, content: { gap: spacing.sm, padding: spacing.md }, back: { alignItems: 'center', borderColor: colors.ink, borderRadius: radii.compact, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, title: { color: colors.ink, fontFamily: fontFamilies.editorial, fontSize: 32, marginBottom: spacing.lg }, label: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 15, marginTop: spacing.md }, choice: { alignItems: 'center', borderColor: colors.ink, borderRadius: radii.compact, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.sm }, choiceActive: { backgroundColor: colors.ink }, dot: { borderColor: colors.ink, borderRadius: radii.round, borderWidth: 1, height: 14, width: 14 }, dotActive: { backgroundColor: colors.pressRed, borderColor: colors.inkInverse }, choiceText: { color: colors.ink, fontFamily: fontFamilies.bodyMedium }, choiceTextActive: { color: colors.inkInverse }, note: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13, lineHeight: 19 } });
