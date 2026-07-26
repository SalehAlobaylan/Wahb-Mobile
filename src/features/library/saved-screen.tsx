import { Image } from 'expo-image';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Bookmark,
  FileText,
  Mic,
  Play,
  Rss,
  Search,
  Video,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { FeedHeader } from '@/components/navigation/feed-header';
import type { SavedContentItem, SavedContentResponse } from '@/core/api';
import { getInstallationId } from '@/core/identity/installation-id';
import { useConnectivity } from '@/core/network/connectivity-provider';
import { useOutbox } from '@/core/outbox/outbox-provider';
import { queryClient } from '@/core/query/query-client';
import { layoutMetrics, radii, spacing, typeScale } from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { fontForText, useWahbTypography } from '@/design/typography';
import { useAuth } from '@/features/auth/auth-provider';
import { usePlaybackController } from '@/features/playback/playback-provider';

import { formatSavedDuration, formatSavedRelativeTime } from './saved-model';

type SavedFeed = 'foryou' | 'news';
type Sort = 'saved_desc' | 'saved_asc';

const savedFeeds: readonly SavedFeed[] = ['foryou', 'news'];

function itemTitle(item: SavedContentItem, fallback: string) {
  return item.title?.trim() || fallback;
}

function feedLabel(feed: SavedFeed, t: (key: string) => string) {
  return t(feed === 'foryou' ? 'library.forYou' : 'library.news');
}

export function SavedScreen() {
  const { t, i18n } = useTranslation();
  const { clients, subject } = useAuth();
  const outbox = useOutbox();
  const playback = usePlaybackController();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  const { isOnline } = useConnectivity();
  const installation = useQuery({
    queryKey: ['saved-installation-identity'],
    queryFn: getInstallationId,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const installationId = installation.data;
  const identityScope = subject
    ? `user:${subject.id}`
    : installationId
      ? `anonymous:${installationId}`
      : null;
  const [activeFeed, setActiveFeed] = useState<SavedFeed>('foryou');
  const [sort, setSort] = useState<Sort>('saved_desc');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Both queries stay mounted for the Platform's visible per-feed counts and
  // to preserve each list when the user changes tabs.
  const forYouQuery = useInfiniteQuery({
    queryKey: ['saved-content', identityScope, 'foryou', sort, search],
    enabled: Boolean(installationId && identityScope),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clients.cms.getSavedContent({
        ...(pageParam ? { cursor: pageParam } : {}),
        installationId,
        feed: 'foryou',
        sort,
        ...(search ? { q: search } : {}),
        signal,
      }),
    getNextPageParam: (page) => page.cursor,
  });
  const newsQuery = useInfiniteQuery({
    queryKey: ['saved-content', identityScope, 'news', sort, search],
    enabled: Boolean(installationId && identityScope),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clients.cms.getSavedContent({
        ...(pageParam ? { cursor: pageParam } : {}),
        installationId,
        feed: 'news',
        sort,
        ...(search ? { q: search } : {}),
        signal,
      }),
    getNextPageParam: (page) => page.cursor,
  });
  const activeQuery = activeFeed === 'foryou' ? forYouQuery : newsQuery;
  const items = activeQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = {
    foryou: forYouQuery.data?.pages.flatMap((page) => page.items).length ?? 0,
    news: newsQuery.data?.pages.flatMap((page) => page.items).length ?? 0,
  };

  const open = useCallback(
    async (item: SavedContentItem) => {
      if (item.type === 'NEWS') {
        router.push(`/article/${item.id}`);
        return;
      }
      if (
        !item.playback_url ||
        !item.playback_type ||
        item.has_video === undefined
      )
        return;
      await playback.start({
        id: item.id,
        contentType: item.type,
        title: itemTitle(item, 'Wahb'),
        ...(item.source_name ? { sourceName: item.source_name } : {}),
        ...(item.thumbnail_url ? { artworkUrl: item.thumbnail_url } : {}),
        playback: {
          url: item.playback_url,
          type: item.playback_type,
          hasVideo: item.has_video,
          ...(item.fallback_playback_url
            ? { fallbackUrl: item.fallback_playback_url }
            : {}),
          ...(item.fallback_playback_type
            ? { fallbackType: item.fallback_playback_type }
            : {}),
          ...(item.fallback_has_video !== undefined
            ? { fallbackHasVideo: item.fallback_has_video }
            : {}),
        },
      });
    },
    [playback],
  );

  const remove = useCallback(
    async (item: SavedContentItem) => {
      if (!identityScope) return;
      queryClient.setQueriesData(
        { queryKey: ['saved-content', identityScope] },
        (
          existing:
            | { pages: SavedContentResponse[]; pageParams: unknown[] }
            | undefined,
        ) =>
          existing
            ? {
                ...existing,
                pages: existing.pages.map((page) => ({
                  ...page,
                  items: page.items.filter(
                    (candidate) => candidate.id !== item.id,
                  ),
                })),
              }
            : existing,
      );
      try {
        await outbox.enqueue({
          contentId: item.id,
          type: 'bookmark',
          operation: 'delete',
        });
      } catch {
        await queryClient.invalidateQueries({
          queryKey: ['saved-content', identityScope],
        });
      }
    },
    [identityScope, outbox],
  );

  const refresh = () =>
    Promise.all([forYouQuery.refetch(), newsQuery.refetch()]);
  const fetchNext = () => {
    if (activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
      void activeQuery.fetchNextPage();
    }
  };

  const initialLoading =
    installation.isLoading || (activeQuery.isLoading && !activeQuery.data);
  const rowDirection = isRTL ? styles.rowRtl : undefined;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: layoutMetrics.pageBottom + 82 },
        ]}
        data={initialLoading || activeQuery.isError ? [] : items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        onEndReached={fetchNext}
        onEndReachedThreshold={0.45}
        refreshControl={
          <RefreshControl
            refreshing={forYouQuery.isRefetching || newsQuery.isRefetching}
            onRefresh={() => void refresh()}
            tintColor={theme.accent}
          />
        }
        renderItem={({ item }) => (
          <SavedRow
            item={item}
            language={i18n.language}
            isRTL={isRTL}
            onOpen={() => void open(item)}
            onRemove={() => void remove(item)}
          />
        )}
        ListHeaderComponent={
          <>
            <FeedHeader variant="library" />
            <View style={styles.hero}>
              <View style={[styles.heroTitleRow, rowDirection]}>
                <Bookmark color={theme.accent} fill={theme.accent} size={20} />
                <Text
                  accessibilityRole="header"
                  style={[
                    styles.title,
                    { color: theme.foreground, fontFamily: font('editorial') },
                  ]}
                >
                  {t('library.savedTitle')}
                </Text>
              </View>
              <Text
                style={[
                  styles.subtitle,
                  {
                    color: theme.mutedForeground,
                    fontFamily: font('body'),
                    textAlign: isRTL ? 'right' : 'left',
                  },
                ]}
              >
                {t('library.savedSubtitle')}
              </Text>
            </View>
            <View
              style={[
                styles.segmented,
                { borderColor: theme.border, backgroundColor: theme.muted },
                rowDirection,
              ]}
            >
              {savedFeeds.map((feed) => {
                const active = activeFeed === feed;
                return (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    key={feed}
                    onPress={() => setActiveFeed(feed)}
                    testID={`saved-feed-${feed}`}
                    style={({ pressed }) => [
                      styles.segment,
                      active && { backgroundColor: theme.card },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: active
                            ? theme.foreground
                            : theme.mutedForeground,
                          fontFamily: font('bold'),
                        },
                      ]}
                    >
                      {feedLabel(feed, t)}
                    </Text>
                    <Text
                      style={[
                        styles.segmentCount,
                        {
                          color: theme.mutedForeground,
                          fontFamily: font('mono'),
                        },
                      ]}
                    >
                      {counts[feed]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.toolbar}>
              <View
                style={[
                  styles.searchField,
                  { borderColor: theme.border, backgroundColor: theme.card },
                  rowDirection,
                ]}
              >
                <Search color={theme.mutedForeground} size={17} />
                <TextInput
                  accessibilityLabel={t('library.searchSaved')}
                  onChangeText={setSearchInput}
                  placeholder={t('library.searchSaved')}
                  placeholderTextColor={theme.mutedForeground}
                  style={[
                    styles.searchInput,
                    {
                      color: theme.foreground,
                      fontFamily: font('body'),
                      textAlign: isRTL ? 'right' : 'left',
                    },
                  ]}
                  testID="saved-search"
                  value={searchInput}
                />
              </View>
              <View style={[styles.sortRow, rowDirection]}>
                <Text
                  style={[
                    styles.sortLabel,
                    { color: theme.mutedForeground, fontFamily: font('body') },
                  ]}
                >
                  {t('library.sortSaved')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    sort === 'saved_desc' ? 'library.newest' : 'library.oldest',
                  )}
                  onPress={() =>
                    setSort((current) =>
                      current === 'saved_desc' ? 'saved_asc' : 'saved_desc',
                    )
                  }
                  style={({ pressed }) => [
                    styles.sortButton,
                    { borderColor: theme.border, backgroundColor: theme.card },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sortText,
                      { color: theme.foreground, fontFamily: font('bold') },
                    ]}
                  >
                    {t(
                      sort === 'saved_desc'
                        ? 'library.newest'
                        : 'library.oldest',
                    )}
                  </Text>
                </Pressable>
              </View>
            </View>
            {!initialLoading && !activeQuery.isError ? (
              <Text
                style={[
                  styles.itemCount,
                  {
                    color: theme.mutedForeground,
                    fontFamily: font('mono'),
                    textAlign: isRTL ? 'right' : 'left',
                  },
                ]}
              >
                {t(
                  items.length === 1
                    ? 'library.itemCountOne'
                    : 'library.itemCount',
                  { count: items.length },
                )}
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          initialLoading ? (
            <SavedSkeletons />
          ) : activeQuery.isError ? (
            <SavedError online={isOnline} onRetry={() => void refresh()} />
          ) : (
            <SavedEmpty feed={activeFeed} hasSearch={Boolean(search)} />
          )
        }
        ListFooterComponent={
          activeQuery.isFetchingNextPage ? (
            <ActivityIndicator color={theme.accent} style={styles.footer} />
          ) : items.length > 6 && !activeQuery.hasNextPage ? (
            <Text
              style={[
                styles.caughtUp,
                { color: theme.mutedForeground, fontFamily: font('body') },
              ]}
            >
              {t('library.caughtUp')}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

function SavedRow({
  item,
  language,
  isRTL,
  onOpen,
  onRemove,
}: {
  item: SavedContentItem;
  language: string;
  isRTL: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const title = itemTitle(item, t('library.untitled'));
  const media = item.type === 'VIDEO' || item.type === 'PODCAST';
  const duration = formatSavedDuration(item.duration_sec);
  const timestamp = formatSavedRelativeTime(
    item.bookmarked_at ?? item.published_at ?? undefined,
    language,
  );
  const Fallback =
    item.type === 'VIDEO' ? Video : item.type === 'PODCAST' ? Mic : FileText;
  const rowDirection = isRTL ? styles.rowRtl : undefined;
  return (
    <View
      testID={`saved-row-${item.id}`}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
        rowDirection,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={[styles.cardMain, rowDirection]}
      >
        <View style={[styles.thumbnail, { backgroundColor: theme.muted }]}>
          {item.thumbnail_url ? (
            <Image
              contentFit="cover"
              source={item.thumbnail_url}
              style={styles.image}
            />
          ) : (
            <Fallback color={theme.mutedForeground} size={22} />
          )}
          {media ? (
            <View style={styles.playOverlay}>
              <Play color="#fff" fill="#fff" size={17} />
            </View>
          ) : null}
          {duration ? <Text style={styles.duration}>{duration}</Text> : null}
        </View>
        <View style={styles.cardCopy}>
          <View style={[styles.metaTop, rowDirection]}>
            <Text
              style={[
                styles.badge,
                {
                  color: theme.accent,
                  borderColor: theme.accent,
                  fontFamily: fontForText(
                    t(`library.badge${item.type}`),
                    'bold',
                  ),
                },
              ]}
            >
              {t(`library.badge${item.type}`)}
            </Text>
            {item.source_name ? (
              <View style={[styles.sourceRow, rowDirection]}>
                <Rss color={theme.mutedForeground} size={11} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.source,
                    {
                      color: theme.mutedForeground,
                      fontFamily: fontForText(item.source_name, 'body'),
                    },
                  ]}
                >
                  {item.source_name}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            numberOfLines={2}
            style={[
              styles.cardTitle,
              {
                color: theme.foreground,
                fontFamily: fontForText(title, 'editorial'),
                textAlign: isRTL ? 'right' : 'left',
              },
            ]}
          >
            {title}
          </Text>
          <View style={[styles.metaBottom, rowDirection]}>
            {item.author ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.meta,
                  {
                    color: theme.mutedForeground,
                    fontFamily: fontForText(item.author, 'body'),
                  },
                ]}
              >
                {item.author}
              </Text>
            ) : null}
            {timestamp ? (
              <Text
                style={[
                  styles.meta,
                  {
                    color: theme.mutedForeground,
                    fontFamily: fontForText(timestamp, 'body'),
                  },
                ]}
              >
                {t('library.savedAt', { time: timestamp })}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={t('library.remove')}
        accessibilityRole="button"
        onPress={onRemove}
        style={styles.remove}
        testID={`saved-remove-${item.id}`}
      >
        <Bookmark color={theme.accent} fill={theme.accent} size={19} />
      </Pressable>
    </View>
  );
}

function SavedSkeletons() {
  const { theme } = useWahbTheme();
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2, 3].map((item) => (
        <View
          key={item}
          style={[
            styles.skeleton,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View
            style={[styles.skeletonImage, { backgroundColor: theme.muted }]}
          />
          <View style={styles.skeletonCopy}>
            <View
              style={[
                styles.skeletonLineShort,
                { backgroundColor: theme.muted },
              ]}
            />
            <View
              style={[styles.skeletonLine, { backgroundColor: theme.muted }]}
            />
            <View
              style={[
                styles.skeletonLineMedium,
                { backgroundColor: theme.muted },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function SavedEmpty({
  feed,
  hasSearch,
}: {
  feed: SavedFeed;
  hasSearch: boolean;
}) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  const title = hasSearch
    ? t('library.emptySearchTitle')
    : t(
        feed === 'foryou'
          ? 'library.emptyForYouTitle'
          : 'library.emptyNewsTitle',
      );
  const copy = hasSearch
    ? t('library.emptySearchCopy')
    : t(
        feed === 'foryou' ? 'library.emptyForYouCopy' : 'library.emptyNewsCopy',
      );
  return (
    <View style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          { borderColor: theme.border, backgroundColor: theme.card },
        ]}
      >
        <Bookmark color={theme.accent} size={30} />
      </View>
      <Text
        style={[
          styles.emptyTitle,
          {
            color: theme.foreground,
            fontFamily: font('editorial'),
            textAlign: isRTL ? 'right' : 'center',
          },
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          styles.emptyCopy,
          {
            color: theme.mutedForeground,
            fontFamily: font('body'),
            textAlign: 'center',
          },
        ]}
      >
        {copy}
      </Text>
    </View>
  );
}

function SavedError({
  online,
  onRetry,
}: {
  online: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <View style={styles.empty}>
      <Text
        style={[
          styles.emptyTitle,
          { color: theme.foreground, fontFamily: font('editorial') },
        ]}
      >
        {online ? t('library.errorTitle') : t('library.offlineTitle')}
      </Text>
      <Text
        style={[
          styles.emptyCopy,
          { color: theme.mutedForeground, fontFamily: font('body') },
        ]}
      >
        {online ? t('library.errorCopy') : t('library.offlineCopy')}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={[
          styles.retry,
          { backgroundColor: theme.accent, borderColor: theme.border },
        ]}
      >
        <Text style={[styles.retryText, { fontFamily: font('bold') }]}>
          {t('library.retry')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: layoutMetrics.pageBottom },
  hero: {
    gap: 2,
    paddingHorizontal: layoutMetrics.pageGutter,
    paddingTop: spacing.md,
  },
  heroTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  rowRtl: { flexDirection: 'row-reverse' },
  title: { ...typeScale.featureTitle },
  subtitle: { ...typeScale.meta, paddingStart: 28 },
  segmented: {
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: layoutMetrics.pageGutter,
    marginTop: spacing.lg,
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 2,
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 40,
  },
  segmentText: { ...typeScale.meta },
  segmentCount: { ...typeScale.micro },
  toolbar: {
    gap: spacing.sm,
    marginHorizontal: layoutMetrics.pageGutter,
    marginTop: spacing.md,
  },
  searchField: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    ...typeScale.body,
    flex: 1,
    minHeight: 42,
    paddingVertical: 0,
  },
  sortRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sortLabel: { ...typeScale.meta },
  sortButton: {
    borderRadius: radii.compact,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sortText: { ...typeScale.meta },
  itemCount: {
    ...typeScale.meta,
    marginHorizontal: layoutMetrics.pageGutter,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.sm,
    marginHorizontal: layoutMetrics.pageGutter,
    minHeight: 92,
    padding: spacing.sm,
  },
  cardMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thumbnail: {
    alignItems: 'center',
    borderRadius: 3,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 64,
  },
  image: { height: '100%', width: '100%' },
  playOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  duration: {
    backgroundColor: 'rgba(0,0,0,0.74)',
    bottom: 3,
    color: '#fff',
    fontFamily: 'GeistMonoMedium',
    fontSize: 9,
    paddingHorizontal: 3,
    position: 'absolute',
    right: 3,
  },
  cardCopy: { flex: 1, gap: 3, minWidth: 0 },
  metaTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  badge: {
    borderRadius: 2,
    borderWidth: 1,
    fontSize: 9,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  sourceRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    minWidth: 0,
  },
  source: { fontSize: 10, flex: 1 },
  cardTitle: { ...typeScale.cardTitle },
  metaBottom: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  meta: { ...typeScale.micro, maxWidth: 126 },
  remove: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginStart: spacing.xs,
    width: 36,
  },
  footer: { marginVertical: spacing.md },
  caughtUp: {
    ...typeScale.label,
    paddingVertical: spacing.lg,
    textAlign: 'center',
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  skeletonList: { gap: spacing.sm, marginHorizontal: layoutMetrics.pageGutter },
  skeleton: {
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  skeletonImage: { borderRadius: 3, height: 64, width: 64 },
  skeletonCopy: { flex: 1, gap: spacing.sm, justifyContent: 'center' },
  skeletonLineShort: { borderRadius: 2, height: 9, width: '23%' },
  skeletonLine: { borderRadius: 2, height: 12, width: '84%' },
  skeletonLineMedium: { borderRadius: 2, height: 9, width: '52%' },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  emptyIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    borderWidth: 1,
    height: 80,
    justifyContent: 'center',
    marginBottom: spacing.md,
    width: 80,
  },
  emptyTitle: {
    ...typeScale.heading,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  emptyCopy: { ...typeScale.body, maxWidth: 290, textAlign: 'center' },
  retry: {
    borderRadius: radii.compact,
    borderWidth: 1,
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  retryText: { color: '#fff', ...typeScale.body },
});
