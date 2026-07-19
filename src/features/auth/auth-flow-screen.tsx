import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { ArrowLeft, MailCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { HttpError } from '@/core/api';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

import { useAuth } from './auth-provider';

type Flow =
  | 'sign-in'
  | 'register'
  | 'check-email'
  | 'forgot-password'
  | 'reset-password'
  | 'verify-email';

function errorKey(error: unknown): string {
  if (error instanceof HttpError && error.context.status === 401) {
    return 'auth.invalidCredentials';
  }
  return 'auth.requestFailed';
}

function PasswordField({
  onChange,
  value,
}: {
  onChange(value: string): void;
  value: string;
}) {
  const { t } = useTranslation();
  return (
    <TextInput
      accessibilityLabel={t('auth.password')}
      autoCapitalize="none"
      autoComplete="password"
      onChangeText={onChange}
      placeholder={t('auth.password')}
      placeholderTextColor={colors.inkMuted}
      secureTextEntry
      style={styles.input}
      value={value}
    />
  );
}

export function AuthFlowScreen({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    email?: string;
    delivery?: string;
    reset?: string;
    token?: string;
    verified?: string;
  }>();
  const auth = useAuth();
  const [email, setEmail] = useState(params.email ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const title = useMemo(() => t(`auth.${flow}.title`), [flow, t]);
  const linkNotice =
    flow === 'sign-in' && params.verified === 'true'
      ? t('auth.sign-in.verified')
      : flow === 'sign-in' && params.reset === 'true'
        ? t('auth.sign-in.resetComplete')
        : null;

  useEffect(() => {
    if (resendSeconds <= 0) {
      return;
    }
    const interval = setInterval(
      () => setResendSeconds((value) => Math.max(0, value - 1)),
      1_000,
    );
    return () => clearInterval(interval);
  }, [resendSeconds]);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (
      (flow === 'reset-password' || flow === 'register') &&
      password !== confirmPassword
    ) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (
      (flow === 'reset-password' || flow === 'verify-email') &&
      !params.token
    ) {
      setError(t('auth.invalidLink'));
      return;
    }
    setIsSubmitting(true);
    try {
      if (flow === 'sign-in') {
        await auth.login(email, password);
        router.replace('/');
      } else if (flow === 'register') {
        const registration = await auth.register({ email, password, username });
        router.replace({
          pathname: '/check-email',
          params: {
            email,
            ...(registration.verification_delivery === 'pending'
              ? { delivery: 'pending' }
              : {}),
          },
        });
      } else if (flow === 'check-email') {
        await auth.resendVerification(email);
        setResendSeconds(60);
        setNotice(t('auth.checkEmail.resent'));
      } else if (flow === 'forgot-password') {
        await auth.requestPasswordReset(email);
        setNotice(t('auth.forgot-password.confirmation'));
      } else if (flow === 'reset-password') {
        await auth.resetPassword(params.token!, password);
        router.replace({ pathname: '/sign-in', params: { reset: 'true' } });
      } else {
        await auth.verifyEmail(params.token!);
        router.replace({ pathname: '/sign-in', params: { verified: 'true' } });
      }
    } catch (nextError) {
      setError(t(errorKey(nextError)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const emailInput = (
    <TextInput
      accessibilityLabel={t('auth.email')}
      autoCapitalize="none"
      autoComplete="email"
      autoCorrect={false}
      inputMode="email"
      keyboardType="email-address"
      onChangeText={setEmail}
      placeholder={t('auth.email')}
      placeholderTextColor={colors.inkMuted}
      style={styles.input}
      value={email}
    />
  );

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityLabel={t('auth.back')}
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.back}
          >
            <ArrowLeft color={colors.ink} size={22} />
          </Pressable>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>WAHB</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>
              {t(`auth.${flow}.description`)}
            </Text>
          </View>
          {flow === 'check-email' ? (
            <View style={styles.checkEmail}>
              <MailCheck color={colors.pressRed} size={38} />
              <Text style={styles.checkEmailAddress}>{email}</Text>
            </View>
          ) : null}
          {flow === 'check-email' && params.delivery === 'pending' ? (
            <Text accessibilityLiveRegion="polite" style={styles.deliveryHelp}>
              {t('auth.checkEmail.deliveryHelp')}
            </Text>
          ) : null}
          {flow === 'register' ? (
            <TextInput
              accessibilityLabel={t('auth.username')}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setUsername}
              placeholder={t('auth.username')}
              placeholderTextColor={colors.inkMuted}
              style={styles.input}
              value={username}
            />
          ) : null}
          {['sign-in', 'register', 'check-email', 'forgot-password'].includes(
            flow,
          )
            ? emailInput
            : null}
          {['sign-in', 'register', 'reset-password'].includes(flow) ? (
            <PasswordField onChange={setPassword} value={password} />
          ) : null}
          {['register', 'reset-password'].includes(flow) ? (
            <TextInput
              accessibilityLabel={t('auth.confirmPassword')}
              autoCapitalize="none"
              autoComplete="password-new"
              onChangeText={setConfirmPassword}
              placeholder={t('auth.confirmPassword')}
              placeholderTextColor={colors.inkMuted}
              secureTextEntry
              style={styles.input}
              value={confirmPassword}
            />
          ) : null}
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          ) : null}
          {notice || linkNotice ? (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              {notice || linkNotice}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={
              isSubmitting || (flow === 'check-email' && resendSeconds > 0)
            }
            onPress={() => void submit()}
            style={[
              styles.primary,
              (isSubmitting || (flow === 'check-email' && resendSeconds > 0)) &&
                styles.disabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.inkInverse} />
            ) : (
              <Text style={styles.primaryText}>
                {flow === 'check-email' && resendSeconds > 0
                  ? t('auth.checkEmail.cooldown', { count: resendSeconds })
                  : t(`auth.${flow}.submit`)}
              </Text>
            )}
          </Pressable>
          {flow === 'sign-in' ? (
            <View style={styles.links}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/forgot-password')}
              >
                <Text style={styles.link}>
                  {t('auth.forgot-password.link')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/register')}
              >
                <Text style={styles.link}>{t('auth.register.link')}</Text>
              </Pressable>
            </View>
          ) : null}
          {flow === 'check-email' ? (
            <View style={styles.links}>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.replace({ pathname: '/register', params: { email } })
                }
              >
                <Text style={styles.link}>
                  {t('auth.checkEmail.changeEmail')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/sign-in')}
              >
                <Text style={styles.link}>
                  {t('auth.checkEmail.backToSignIn')}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {flow === 'forgot-password' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/sign-in')}
            >
              <Text style={styles.link}>{t('auth.backToSignIn')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.paper, flex: 1 },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
  back: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  heading: { marginTop: spacing.lg },
  eyebrow: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 34,
    lineHeight: 42,
    marginTop: spacing.xs,
  },
  description: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.sm,
  },
  input: {
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderRadius: radii.compact,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  disabled: { opacity: 0.55 },
  primaryText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
  },
  error: {
    color: colors.pressRed,
    fontFamily: fontFamilies.body,
    fontSize: 14,
    lineHeight: 20,
  },
  notice: {
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 14,
    lineHeight: 20,
    padding: spacing.sm,
  },
  links: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  link: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  checkEmail: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  checkEmailAddress: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
  },
  deliveryHelp: {
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.body,
    fontSize: 14,
    lineHeight: 20,
    padding: spacing.sm,
  },
});
