import { router } from 'expo-router';
import {
  Alert,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { useSQLiteContext } from 'expo-sqlite';

import { clearLocalWahbData } from '@/core/database/reset-local-data';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

import { useAuth } from './auth-provider';

export function AccountScreen() {
  const { t } = useTranslation();
  const auth = useAuth();
  const db = useSQLiteContext();
  const reset = () => {
    Alert.alert(t('account.resetTitle'), t('account.resetCopy'), [
      { style: 'cancel', text: t('account.cancel') },
      {
        style: 'destructive',
        text: t('account.resetAction'),
        onPress: () =>
          void clearLocalWahbData(db)
            .then(() => auth.resetLocalData())
            .then(() => router.replace('/')),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Pressable
          accessibilityLabel={t('auth.back')}
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <ArrowLeft color={colors.ink} size={22} />
        </Pressable>
        <View style={styles.heading}>
          <UserRound color={colors.pressRed} size={30} />
          <Text style={styles.title}>{t('account.title')}</Text>
        </View>
        {auth.subject ? (
          <>
            <Text style={styles.email}>
              {auth.subject.email || t('account.signedIn')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/profile')}
              style={styles.action}
            >
              <UserRound color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.profile')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/interests')}
              style={styles.action}
            >
              <SlidersHorizontal color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.interests')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/saved')}
              style={styles.action}
            >
              <BookMarked color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.saved')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/history')}
              style={styles.action}
            >
              <Clock3 color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.history')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void auth.logout().then(() => router.replace('/'))}
              style={styles.action}
            >
              <LogOut color={colors.ink} size={20} />
              <Text style={styles.actionText}>{t('account.signOut')}</Text>
            </Pressable>
            <Pressable
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
            <Text style={styles.email}>{t('account.guest')}</Text>
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
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={styles.action}
        >
          <Settings color={colors.ink} size={20} />
          <Text style={styles.actionText}>{t('settings.title')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={reset}
          style={styles.action}
        >
          <RotateCcw color={colors.ink} size={20} />
          <Text style={styles.actionText}>{t('account.resetAction')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.paper, flex: 1 },
  content: { gap: spacing.md, padding: spacing.md },
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
