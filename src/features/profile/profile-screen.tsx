import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, fontFamilies, radii, spacing } from '@/design/tokens';
import { useAuth } from '@/features/auth/auth-provider';

export function ProfileScreen() {
  const { t } = useTranslation();
  const { clients, subject } = useAuth();
  const profile = useQuery({ queryKey: ['profile', subject?.id], enabled: Boolean(subject), queryFn: () => clients.iam.getProfile() });
  const [draft, setDraft] = useState<{ username: string; bio: string } | null>(null);
  const username = draft?.username ?? profile.data?.username ?? '';
  const bio = draft?.bio ?? profile.data?.bio ?? '';
  const update = useMutation({ mutationFn: () => clients.iam.updateProfile({ username, bio }), onSuccess: () => { setDraft(null); return profile.refetch(); } });
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><ChevronLeft color={colors.ink} size={24} /></Pressable>
    <Text style={styles.title}>{t('profile.title')}</Text>
    {profile.isLoading ? <ActivityIndicator color={colors.pressRed} /> : <>
      <Text style={styles.label}>{t('auth.username')}</Text><TextInput accessibilityLabel={t('auth.username')} autoCapitalize="none" onChangeText={(value) => setDraft((current) => ({ username: value, bio: current?.bio ?? bio }))} style={styles.input} value={username} />
      <Text style={styles.label}>{t('profile.bio')}</Text><TextInput accessibilityLabel={t('profile.bio')} multiline onChangeText={(value) => setDraft((current) => ({ username: current?.username ?? username, bio: value }))} style={[styles.input, styles.bio]} value={bio} />
      <Pressable accessibilityRole="button" disabled={update.isPending} onPress={() => update.mutate()} style={[styles.save, update.isPending && styles.disabled]}><Text style={styles.saveText}>{t('profile.save')}</Text></Pressable>
      {update.isSuccess ? <Text style={styles.notice}>{t('profile.saved')}</Text> : null}
    </>}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ root: { backgroundColor: colors.paper, flex: 1 }, content: { gap: spacing.sm, padding: spacing.md }, back: { alignItems: 'center', borderColor: colors.ink, borderRadius: radii.compact, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, title: { color: colors.ink, fontFamily: fontFamilies.editorial, fontSize: 32, marginBottom: spacing.lg }, label: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 14, marginTop: spacing.sm }, input: { backgroundColor: colors.inkInverse, borderColor: colors.ink, borderRadius: radii.compact, borderWidth: 1, color: colors.ink, fontFamily: fontFamilies.body, fontSize: 16, minHeight: 48, paddingHorizontal: spacing.sm }, bio: { minHeight: 120, paddingTop: spacing.sm, textAlignVertical: 'top' }, save: { alignItems: 'center', backgroundColor: colors.pressRed, borderRadius: radii.compact, justifyContent: 'center', marginTop: spacing.md, minHeight: 52 }, disabled: { opacity: .6 }, saveText: { color: colors.inkInverse, fontFamily: fontFamilies.bodyBold, fontSize: 16 }, notice: { color: colors.inkMuted, fontFamily: fontFamilies.body, textAlign: 'center' } });
