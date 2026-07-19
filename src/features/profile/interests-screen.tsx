import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, fontFamilies, radii, spacing } from '@/design/tokens';
import { useAuth } from '@/features/auth/auth-provider';

export function InterestsScreen() {
  const { t, i18n } = useTranslation();
  const { clients, subject } = useAuth();
  const picker = useQuery({ queryKey: ['topic-picker'], queryFn: () => clients.cms.getTopicPicker() });
  const preferences = useQuery({ queryKey: ['preferences', subject?.id], enabled: Boolean(subject), queryFn: () => clients.cms.getPreferences() });
  const [selectionOverride, setSelectionOverride] = useState<string[] | null>(null);
  const selected = selectionOverride ?? preferences.data?.declared.map((topic) => topic.id) ?? [];
  const save = useMutation({ mutationFn: () => clients.cms.updateDeclaredTopics(selected), onSuccess: () => void preferences.refetch() });
  const toggle = (id: string) => setSelectionOverride((current) => { const next = current ?? selected; return next.includes(id) ? next.filter((value) => value !== id) : [...next, id]; });
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><ChevronLeft color={colors.ink} size={24} /></Pressable>
    <Text style={styles.title}>{t('profile.interestsTitle')}</Text><Text style={styles.copy}>{t('profile.interestsCopy')}</Text>
    {picker.isLoading || preferences.isLoading ? <ActivityIndicator color={colors.pressRed} /> : <View style={styles.topics}>{picker.data?.topics.map((topic) => { const active = selected.includes(topic.id); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: active }} key={topic.id} onPress={() => toggle(topic.id)} style={[styles.topic, active && styles.topicActive]}>{active ? <Check color={colors.inkInverse} size={15} /> : null}<Text style={[styles.topicText, active && styles.topicTextActive]}>{i18n.language === 'ar' ? topic.label_ar : topic.label_en}</Text></Pressable>; })}</View>}
    <Pressable accessibilityRole="button" disabled={save.isPending} onPress={() => save.mutate()} style={[styles.save, save.isPending && styles.disabled]}><Text style={styles.saveText}>{t('profile.saveInterests')}</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ root: { backgroundColor: colors.paper, flex: 1 }, content: { gap: spacing.md, padding: spacing.md }, back: { alignItems: 'center', borderColor: colors.ink, borderRadius: radii.compact, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, title: { color: colors.ink, fontFamily: fontFamilies.editorial, fontSize: 30 }, copy: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 15, lineHeight: 22 }, topics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, topic: { alignItems: 'center', borderColor: colors.ink, borderRadius: radii.round, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingVertical: 9 }, topicActive: { backgroundColor: colors.ink }, topicText: { color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 14 }, topicTextActive: { color: colors.inkInverse }, save: { alignItems: 'center', backgroundColor: colors.pressRed, borderRadius: radii.compact, justifyContent: 'center', minHeight: 52 }, disabled: { opacity: .6 }, saveText: { color: colors.inkInverse, fontFamily: fontFamilies.bodyBold, fontSize: 16 } });
