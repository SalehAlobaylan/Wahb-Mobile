import { router } from 'expo-router';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  BookMarked,
  Clock3,
  LogOut,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import {
  colors,
  fontFamilies,
  layoutMetrics,
  radii,
  spacing,
} from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';
import { goBackOrReplace } from '@/core/navigation/go-back';

import { useAuth } from './auth-provider';

export function AccountScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const reset = () => {
    Alert.alert(t('account.resetTitle'), t('account.resetCopy'), [
      { style: 'cancel', text: t('account.cancel') },
      {
        style: 'destructive',
        text: t('account.resetAction'),
        onPress: () =>
          void auth.resetLocalData().then(() => router.replace('/')),
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Pressable
          accessibilityLabel={t('auth.back')}
          accessibilityRole="button"
          onPress={() => goBackOrReplace('/')}
          style={styles.back}
        >
          <ArrowLeft color={theme.foreground} size={22} />
        </Pressable>
        <View style={styles.heading}>
          <UserRound color={colors.pressRed} size={30} />
          <Text
            style={[
              styles.title,
              { color: theme.foreground, fontFamily: font('editorial') },
            ]}
          >
            {t('account.title')}
          </Text>
        </View>
        {auth.subject ? (
          <>
            <Text
              style={[
                styles.email,
                { color: theme.mutedForeground, fontFamily: font('body') },
              ]}
            >
              {auth.subject.email || t('account.signedIn')}
            </Text>
            <Pressable
              testID="account-profile"
              accessibilityRole="button"
              onPress={() => router.push('/profile')}
              style={styles.action}
            >
              <UserRound color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.profile')}</Text>
            </Pressable>
            <Pressable
              testID="account-interests"
              accessibilityRole="button"
              onPress={() => router.push('/interests')}
              style={styles.action}
            >
              <SlidersHorizontal color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.interests')}</Text>
            </Pressable>
            <Pressable
              testID="account-saved"
              accessibilityRole="button"
              onPress={() => router.push('/saved')}
              style={styles.action}
            >
              <BookMarked color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.saved')}</Text>
            </Pressable>
            <Pressable
              testID="account-history"
              accessibilityRole="button"
              onPress={() => router.push('/history')}
              style={styles.action}
            >
              <Clock3 color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.history')}</Text>
            </Pressable>
            <Pressable
              testID="account-sign-out"
              accessibilityRole="button"
              onPress={() => void auth.logout().then(() => router.replace('/'))}
              style={styles.action}
            >
              <LogOut color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.signOut')}</Text>
            </Pressable>
            <Pressable
              testID="account-delete"
              accessibilityRole="button"
              onPress={() => router.push('/delete-account')}
              style={[styles.action, styles.destructiveAction]}
            >
              <Trash2 color={colors.pressRed} size={20} />
              <Text style={styles.destructiveText}>
                {t('account.deleteAccount')}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text
              style={[
                styles.email,
                { color: theme.mutedForeground, fontFamily: font('body') },
              ]}
            >
              {t('account.guest')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/sign-in')}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>{t('account.signIn')}</Text>
            </Pressable>
          </>
        )}
        <Pressable
          testID="account-settings"
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={styles.action}
        >
          <Settings color={colors.ink} size={20} />
          <Text style={styles.actionText}>{t('settings.title')}</Text>
        </Pressable>
        <Pressable
          testID="account-reset-local-data"
          accessibilityRole="button"
          onPress={reset}
          style={styles.action}
        >
          <RotateCcw color={colors.ink} size={20} />
          <Text style={styles.actionText}>{t('account.resetAction')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.paper, flex: 1 },
  content: {
    gap: layoutMetrics.contentGap,
    paddingBottom: layoutMetrics.pageBottom,
    paddingHorizontal: layoutMetrics.pageGutter,
    paddingTop: layoutMetrics.pageTop,
  },
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
    fontSize: 32,
  },
  email: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 23,
  },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderRadius: radii.compact,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
  },
  action: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  actionText: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
  },
  destructiveAction: { borderColor: colors.pressRed },
  destructiveText: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
  },
});
