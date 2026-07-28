import { usePathname, useRouter } from 'expo-router';
import { Bookmark, ChevronDown, Search, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';
import { layoutMetrics, radii, spacing } from '@/design/tokens';

type FeedHeaderProps = {
  variant: 'overlay' | 'editorial' | 'library';
  compact?: boolean;
  newsWindow?: 'today' | 'week' | 'month';
  onNewsWindowChange?: (window: 'today' | 'week' | 'month') => void;
};

const routes = [
  { key: 'pods', href: '/' },
  { key: 'news', href: '/news' },
  { key: 'saved', href: '/saved' },
] as const;

const feedHeaderIconSize = 36;

export function FeedHeader({
  variant,
  compact = false,
  newsWindow,
  onNewsWindowChange,
}: FeedHeaderProps) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [isNewsMenuOpen, setIsNewsMenuOpen] = useState(false);
  const overlay = variant === 'overlay';
  const library = variant === 'library';
  const foreground = overlay ? '#f8f5f2' : theme.foreground;
  const muted = overlay ? 'rgba(248,245,242,0.58)' : theme.mutedForeground;
  const chromeTop = insets.top + (compact ? spacing.xs : spacing.sm);
  const tabRailWidth = Math.min(
    228,
    Math.max(
      192,
      width -
        2 *
          (layoutMetrics.pageGutter +
            feedHeaderIconSize +
            layoutMetrics.contentGap),
    ),
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.root,
        {
          minHeight: chromeTop + 40,
          paddingTop: chromeTop,
        },
      ]}
    >
      <Pressable
        accessibilityLabel={t('account.title')}
        accessibilityRole="button"
        onPress={() => router.push('/profile')}
        style={({ pressed }) => [
          styles.icon,
          styles.profileButton,
          overlay
            ? styles.overlayProfileIcon
            : [
                { backgroundColor: theme.muted, borderColor: theme.border },
                library && styles.libraryIcon,
              ],
          pressed && styles.pressed,
        ]}
      >
        <UserRound color={foreground} size={18} strokeWidth={2} />
      </Pressable>

      <View
        style={[
          styles.tabs,
          {
            top: chromeTop,
            transform: [{ translateX: -tabRailWidth / 2 }],
            width: tabRailWidth,
          },
        ]}
      >
        {routes.map((route) => {
          const active = pathname === route.href;
          const label = t(
            route.key === 'pods'
              ? 'pods.feedLabel'
              : route.key === 'news'
                ? 'news.feedLabel'
                : 'library.savedTitle',
          );
          const opensNewsMenu =
            route.key === 'news' && active && onNewsWindowChange;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={route.key}
              onPress={() =>
                opensNewsMenu
                  ? setIsNewsMenuOpen((open) => !open)
                  : router.navigate(route.href)
              }
              style={styles.tab}
            >
              <View style={styles.tabLabel}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.tabText,
                    {
                      color: active ? foreground : muted,
                      fontFamily: font('bold'),
                    },
                  ]}
                >
                  {label}
                </Text>
                {opensNewsMenu ? (
                  <ChevronDown color={foreground} size={13} />
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

      <Pressable
        accessibilityLabel={t('search.title', 'Search')}
        accessibilityRole="button"
        onPress={() => router.push('/search')}
        style={({ pressed }) => [
          styles.icon,
          styles.searchButton,
          overlay
            ? styles.overlaySearchIcon
            : [
                { backgroundColor: theme.muted, borderColor: theme.border },
                library && styles.libraryIcon,
              ],
          pressed && styles.pressed,
        ]}
      >
        <Search color={foreground} size={18} strokeWidth={2} />
      </Pressable>
      {isNewsMenuOpen && onNewsWindowChange ? (
        <View
          style={[
            styles.newsMenu,
            {
              backgroundColor: theme.background,
              borderColor: theme.border,
              top: chromeTop + 40,
            },
          ]}
        >
          {(['today', 'week', 'month'] as const).map((window) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: window === newsWindow }}
              key={window}
              onPress={() => {
                onNewsWindowChange(window);
                setIsNewsMenuOpen(false);
              }}
              style={[
                styles.newsMenuOption,
                window === newsWindow && { backgroundColor: theme.accent },
              ]}
            >
              <Text
                style={[
                  styles.newsMenuText,
                  {
                    color:
                      window === newsWindow ? theme.inverse : theme.foreground,
                    fontFamily: font('bold'),
                  },
                ]}
              >
                {t(`news.window.${window}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function FeedHeaderBookmark({
  active,
  onPress,
  overlay = false,
}: {
  active: boolean;
  onPress: () => void;
  overlay?: boolean;
}) {
  const { theme } = useWahbTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.icon,
        overlay
          ? styles.overlaySearchIcon
          : { backgroundColor: theme.muted, borderColor: theme.border },
      ]}
    >
      <Bookmark
        color={overlay ? '#f8f5f2' : theme.foreground}
        fill={active ? theme.accent : 'transparent'}
        size={18}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
  },
  tabs: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    start: '50%',
  },
  tab: {
    alignItems: 'center',
    minHeight: 34,
    minWidth: 48,
    overflow: 'visible',
    justifyContent: 'center',
  },
  tabLabel: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  tabText: { fontSize: 14, letterSpacing: 0 },
  underline: { bottom: 0, height: 2, position: 'absolute', start: 0, end: 0 },
  icon: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    height: feedHeaderIconSize,
    justifyContent: 'center',
    width: feedHeaderIconSize,
  },
  // The feed shell keeps the profile at the physical right and Search at the
  // far left in both locales, matching the platform's mobile header.
  profileButton: {
    position: 'absolute',
    right: layoutMetrics.pageGutter,
  },
  searchButton: {
    left: layoutMetrics.pageGutter,
    position: 'absolute',
  },
  overlayProfileIcon: {
    backgroundColor: 'rgba(230,57,70,0.40)',
    borderColor: 'rgba(248,245,242,0.25)',
    borderRadius: radii.round,
  },
  overlaySearchIcon: {
    backgroundColor: 'rgba(248,245,242,0.10)',
    borderColor: 'transparent',
    borderRadius: radii.round,
  },
  libraryIcon: { borderRadius: radii.round },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  newsMenu: {
    borderRadius: radii.compact,
    borderWidth: 1,
    start: '50%',
    padding: 3,
    position: 'absolute',
    transform: [{ translateX: -58 }],
    width: 116,
    zIndex: 20,
  },
  newsMenuOption: {
    borderRadius: 2,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  newsMenuText: { fontSize: 12 },
});
