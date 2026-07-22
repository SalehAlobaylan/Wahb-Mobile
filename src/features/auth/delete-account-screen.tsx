import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AlertCircle, ArrowLeft, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { clearLocalWahbData } from '@/core/database/reset-local-data';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

import { useAuth } from './auth-provider';

export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const db = useSQLiteContext();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.subject && !auth.isBootstrapping) router.replace('/sign-in');
  }, [auth.isBootstrapping, auth.subject]);

  const submit = async () => {
    if (!password || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      // IAM revokes server credentials before accepting this request. The local
      // account partition is only cleared after that boundary succeeds.
      await auth.requestAccountDeletion(password);
      await clearLocalWahbData(db);
      await auth.resetLocalData();
      router.replace('/');
    } catch {
      setError(t('auth.requestFailed'));
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityLabel={t('auth.back')}
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => router.back()}
            style={styles.back}
          >
            <ArrowLeft color={colors.ink} size={22} />
          </Pressable>
          <View style={styles.heading}>
            <Trash2 color={colors.pressRed} size={30} />
            <Text style={styles.title}>{t('account.deleteTitle')}</Text>
          </View>
          <View style={styles.warning}>
            <AlertCircle color={colors.pressRed} size={22} />
            <Text style={styles.warningText}>{t('account.deleteCopy')}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>{t('auth.password')}</Text>
            <TextInput
              testID="delete-account-password"
              accessibilityLabel={t('account.deletePassword')}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isSubmitting}
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              placeholder={t('account.deletePassword')}
              placeholderTextColor={colors.inkMuted}
              secureTextEntry
              style={styles.input}
              textContentType="password"
              value={password}
            />
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: !password || isSubmitting,
              busy: isSubmitting,
            }}
            disabled={!password || isSubmitting}
            onPress={() => void submit()}
            style={[
              styles.delete,
              (!password || isSubmitting) && styles.disabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.inkInverse} />
            ) : (
              <Trash2 color={colors.inkInverse} size={19} />
            )}
            <Text style={styles.deleteText}>
              {isSubmitting
                ? t('account.deletePending')
                : t('account.deleteConfirm')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.paper, flex: 1 },
  keyboard: { flex: 1 },
  content: { gap: spacing.lg, padding: spacing.md, paddingBottom: spacing.xxl },
  back: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 31,
  },
  warning: {
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.pressRed,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  warningText: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 22,
  },
  field: { gap: spacing.xs },
  label: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 14 },
  input: {
    backgroundColor: colors.inkInverse,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: spacing.sm,
  },
  error: {
    color: colors.pressRed,
    fontFamily: fontFamilies.body,
    fontSize: 14,
  },
  delete: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  disabled: { opacity: 0.55 },
  deleteText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
  },
});
