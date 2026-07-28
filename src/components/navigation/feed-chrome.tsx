import { usePathname, useRouter } from 'expo-router';
import { ChevronDown, Search, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  componentMetrics,
  layoutMetrics,
  radii,
  spacing,
  typeScale,
} from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';
import type { PodsDurationPreference } from '@/features/feed-session/use-pods-session';

const feedRoutes = [
  { href: '/', key: 'pods' },
  { href: '/news', key: 'news' },
  { href: '/saved', key: 'saved' },
] as const;

const durationOptions: readonly PodsDurationPreference[] = [
  5, 10, 15, 20, 30, 40,
];

function FeedTabs({
  tone,
  onNewsWindowPress,
}: {
  tone: 'overlay' | 'editorial';
  onNewsWindowPress?: () => void;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  const activeColor = tone === 'overlay' ? '#f8f5f2' : theme.foreground;
  const inactiveColor =
    tone === 'overlay' ? 'rgba(248,245,242,0.55)' : theme.mutedForeground;

  return (
    <View style={[styles.tabs, isRTL && styles.tabsRtl]}>
      {feedRoutes.map((route) => {
        const active = pathname === route.href;
        const label = t(
          route.key === 'pods'
            ? 'pods.feedLabel'
            : route.key === 'news'
              ? 'news.feedLabel'
              : 'library.savedTitle',
        );
        const opensWindow = route.key === 'news' && active && onNewsWindowPress;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={route.key}
            onPress={() =>
              opensWindow ? onNewsWindowPress() : router.navigate(route.href)
            }
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <View style={styles.tabLabel}>
              <Text
                numberOfLines={1}
                style={{
                  color: active ? activeColor : inactiveColor,
                  fontFamily: font('bold'),
                  ...typeScale.body,
                }}
              >
                {label}
              </Text>
              {opensWindow ? (
                <ChevronDown color={activeColor} size={13} />
              ) : null}
            </View>
            {active ? (
              <View
                style={[styles.underline, { backgroundColor: theme.accent }]}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function ChromeButtons({ variant }: { variant: 'overlay' | 'editorial' }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const overlay = variant === 'overlay';
  const color = overlay ? '#f8f5f2' : theme.foreground;
  return (
    <>
      <Pressable
        accessibilityLabel={t('account.title')}
        accessibilityRole="button"
        onPress={() => router.push('/profile')}
        style={({ pressed }) => [
          styles.icon,
          styles.profileButton,
          overlay
            ? styles.overlayIcon
            : { backgroundColor: theme.muted, borderColor: theme.border },
          pressed && styles.pressed,
        ]}
      >
        <UserRound color={color} size={18} strokeWidth={2} />
      </Pressable>
      <Pressable
        accessibilityLabel={t('search.title')}
        accessibilityRole="button"
        onPress={() => router.push('/search')}
        style={({ pressed }) => [
          styles.icon,
          styles.searchButton,
          overlay
            ? styles.overlaySearch
            : { backgroundColor: theme.muted, borderColor: theme.border },
          pressed && styles.pressed,
        ]}
      >
        <Search color={color} size={18} strokeWidth={2} />
      </Pressable>
    </>
  );
}

export function PodsFeedChrome({
  duration,
  onDurationChange,
}: {
  duration?: PodsDurationPreference;
  onDurationChange: (duration?: PodsDurationPreference) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.podsRoot, { paddingTop: insets.top + spacing.xs }]}
    >
      <View style={styles.chromeRow}>
        <ChromeButtons variant="overlay" />
        <View pointerEvents="box-none" style={styles.tabsSlot}>
          <View pointerEvents="auto">
            <FeedTabs tone="overlay" />
          </View>
        </View>
      </View>
      <View pointerEvents="auto" style={styles.durationStrip}>
        <Pressable
          accessibilityLabel={t('pods.duration', {
            duration: t('pods.durationAll'),
          })}
          accessibilityRole="button"
          onPress={() => onDurationChange(undefined)}
          style={[styles.durationButton, !duration && styles.durationActive]}
        >
          <Text
            style={[
              styles.durationText,
              !duration && styles.durationTextActive,
            ]}
          >
            {t('pods.durationAll')}
          </Text>
        </Pressable>
        {durationOptions.map((option) => (
          <Pressable
            accessibilityLabel={t('pods.duration', {
              duration: `${option}m`,
            })}
            accessibilityRole="button"
            accessibilityState={{ selected: duration === option }}
            key={option}
            onPress={() => onDurationChange(option)}
            style={[
              styles.durationButton,
              duration === option && styles.durationActive,
            ]}
          >
            <Text
              style={[
                styles.durationText,
                duration === option && styles.durationTextActive,
              ]}
            >
              {option}m
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function NewsFeedChrome({
  window,
  onWindowChange,
}: {
  window: 'today' | 'week' | 'month';
  onWindowChange: (window: 'today' | 'week' | 'month') => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <View
      pointerEvents="box-none"
      style={[styles.newsRoot, { paddingTop: insets.top + spacing.xs }]}
    >
      <View style={styles.chromeRow}>
        <ChromeButtons variant="editorial" />
        <View pointerEvents="box-none" style={styles.tabsSlot}>
          <View pointerEvents="auto">
            <FeedTabs
              tone="editorial"
              onNewsWindowPress={() => setMenuOpen((open) => !open)}
            />
          </View>
        </View>
      </View>
      {menuOpen ? (
        <View
          style={[
            styles.windowMenu,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          {(['today', 'week', 'month'] as const).map((option) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: option === window }}
              key={option}
              onPress={() => {
                onWindowChange(option);
                setMenuOpen(false);
              }}
              style={[
                styles.windowOption,
                option === window && { backgroundColor: theme.accent },
              ]}
            >
              <Text
                style={{ color: option === window ? '#fff' : theme.foreground }}
              >
                {t(`news.window.${option}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const feedChromeMetrics = { podsHeight: 118, newsHeight: 60 } as const;

const styles = StyleSheet.create({
  podsRoot: { left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  newsRoot: { left: 0, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  chromeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: componentMetrics.chromeControl,
    position: 'relative',
  },
  tabsSlot: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 64,
    position: 'absolute',
    right: 64,
    top: 0,
  },
  tabs: { alignItems: 'center', flexDirection: 'row', gap: spacing.lg },
  tabsRtl: { flexDirection: 'row-reverse' },
  tab: { alignItems: 'center', minHeight: 36, justifyContent: 'center' },
  tabLabel: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  underline: { bottom: 0, height: 2, left: 0, position: 'absolute', right: 0 },
  icon: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    height: componentMetrics.chromeControl,
    justifyContent: 'center',
    width: componentMetrics.chromeControl,
  },
  // These controls deliberately use physical edges. Wahb's Arabic feed
  // places the profile on the right and Search on the far left.
  profileButton: { position: 'absolute', right: layoutMetrics.pageGutter },
  searchButton: { left: layoutMetrics.pageGutter, position: 'absolute' },
  overlayIcon: {
    backgroundColor: 'rgba(230,57,70,0.4)',
    borderColor: 'rgba(248,245,242,0.25)',
    borderRadius: radii.round,
  },
  overlaySearch: {
    backgroundColor: 'rgba(248,245,242,0.10)',
    borderColor: 'transparent',
    borderRadius: radii.round,
  },
  durationStrip: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderColor: 'rgba(248,245,242,0.24)',
    borderRadius: radii.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    marginTop: spacing.md,
    padding: 3,
  },
  durationButton: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 30,
    justifyContent: 'center',
    minWidth: 35,
    paddingHorizontal: 5,
  },
  durationActive: { backgroundColor: '#f8f5f2' },
  durationText: { color: '#f8f5f2', ...typeScale.label },
  durationTextActive: { color: '#1a1a1a', fontWeight: '700' },
  windowMenu: {
    alignSelf: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: 3,
    width: 120,
  },
  windowOption: {
    borderRadius: 2,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  pressed: { opacity: 0.74, transform: [{ scale: 0.96 }] },
});
