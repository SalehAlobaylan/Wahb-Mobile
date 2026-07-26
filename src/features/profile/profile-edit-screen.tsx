import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppSubpageHeader } from '@/components/navigation/app-subpage-header';
import {
  colors,
  layoutMetrics,
  radii,
  spacing,
  typeScale,
} from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';
import { useAuth } from '@/features/auth/auth-provider';

const usernamePattern = /^[A-Za-z0-9._-]{3,50}$/;
const maxBioLength = 500;

export function ProfileEditScreen() {
  const { t } = useTranslation();
  const { clients, subject } = useAuth();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['profile', subject?.id],
    enabled: Boolean(subject),
    queryFn: () => clients.iam.getProfile(),
  });
  const [username, setUsername] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      clients.iam.updateProfile({
        username: username?.trim(),
        bio: bio?.trim(),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(['profile', subject?.id], next);
      router.back();
    },
    onError: () => setError(t('profile.editFailed')),
  });

  if (!subject) {
    router.replace('/sign-in');
    return null;
  }
  const currentUsername = username ?? profile.data?.username ?? '';
  const currentBio = bio ?? profile.data?.bio ?? '';
  const submit = () => {
    if (!usernamePattern.test(currentUsername.trim())) {
      setError(t('profile.usernameRule'));
      return;
    }
    setError(null);
    save.mutate();
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <AppSubpageHeader fallback="/profile" title={t('profile.edit')} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={[
            styles.label,
            { color: theme.foreground, fontFamily: font('bold') },
          ]}
        >
          {t('auth.username')}
        </Text>
        <TextInput
          accessibilityLabel={t('auth.username')}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={50}
          onChangeText={setUsername}
          placeholder="wahb_member"
          placeholderTextColor={theme.mutedForeground}
          style={[
            styles.input,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              color: theme.foreground,
              fontFamily: font('body'),
            },
          ]}
          value={currentUsername}
        />
        <Text
          style={[
            styles.help,
            { color: theme.mutedForeground, fontFamily: font('body') },
          ]}
        >
          {t('profile.usernameRule')}
        </Text>
        <Text
          style={[
            styles.label,
            { color: theme.foreground, fontFamily: font('bold') },
          ]}
        >
          {t('profile.bio')}
        </Text>
        <TextInput
          accessibilityLabel={t('profile.bio')}
          maxLength={maxBioLength}
          multiline
          onChangeText={setBio}
          placeholder={t('profile.bioPlaceholder')}
          placeholderTextColor={theme.mutedForeground}
          style={[
            styles.input,
            styles.bio,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              color: theme.foreground,
              fontFamily: font('body'),
            },
          ]}
          textAlignVertical="top"
          value={currentBio}
        />
        <Text
          style={[
            styles.count,
            { color: theme.mutedForeground, fontFamily: font('mono') },
          ]}
        >
          {currentBio.length}/{maxBioLength}
        </Text>
        {error ? (
          <Text
            style={[
              styles.error,
              { color: theme.accent, fontFamily: font('body') },
            ]}
          >
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={save.isPending || profile.isLoading}
          onPress={submit}
          style={[
            styles.save,
            { backgroundColor: theme.accent },
            (save.isPending || profile.isLoading) && styles.disabled,
          ]}
        >
          <Text style={[styles.saveText, { fontFamily: font('bold') }]}>
            {save.isPending ? t('profile.saving') : t('profile.save')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: layoutMetrics.pageGutter,
    paddingBottom: layoutMetrics.pageBottom,
  },
  label: { ...typeScale.body, marginTop: spacing.md },
  input: {
    borderRadius: radii.compact,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: spacing.sm,
    ...typeScale.body,
    marginTop: spacing.xs,
  },
  bio: { minHeight: 132, paddingTop: spacing.sm },
  help: { ...typeScale.meta, marginTop: spacing.xs },
  count: { ...typeScale.meta, alignSelf: 'flex-end', marginTop: spacing.xs },
  error: { ...typeScale.meta, marginTop: spacing.md },
  save: {
    alignItems: 'center',
    borderRadius: radii.compact,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 48,
  },
  saveText: { color: colors.inkInverse, ...typeScale.body },
  disabled: { opacity: 0.55 },
});
