import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, Play, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SavedContentItem } from '@/core/api';
import { useOutbox } from '@/core/outbox/outbox-provider';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';
import { useAuth } from '@/features/auth/auth-provider';
import { usePlaybackController } from '@/features/playback/playback-provider';

type FeedFilter = 'all' | 'foryou' | 'news';
type Sort = 'saved_desc' | 'saved_asc';

export function SavedScreen() {
  const { t } = useTranslation();
  const { clients, subject } = useAuth();
  const outbox = useOutbox();
  const playback = usePlaybackController();
  const [feed, setFeed] = useState<FeedFilter>('all');
  const [sort, setSort] = useState<Sort>('saved_desc');
  const query = useInfiniteQuery({
    queryKey: ['saved-content', subject?.id, feed, sort],
    enabled: Boolean(subject),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clients.cms.getSavedContent({
        ...(pageParam ? { cursor: pageParam } : {}),
        feed,
        sort,
        signal,
      }),
    getNextPageParam: (page) => page.cursor,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  const remove = useCallback(
    async (item: SavedContentItem) => {
      await outbox.enqueue({
        contentId: item.id,
        type: 'bookmark',
        operation: 'delete',
      });
      await query.refetch();
    },
    [outbox, query],
  );
  const open = useCallback(
    async (item: SavedContentItem) => {
      if (item.type === 'NEWS') {
        router.push(`/article/${item.id}`);
        return;
      }
      if (!item.playback_url || !item.playback_type || item.has_video === undefined) {
        return;
      }
      await playback.start({
        id: item.id,
        contentType: item.type,
        title: item.title || 'Wahb',
        ...(item.source_name ? { sourceName: item.source_name } : {}),
        ...(item.thumbnail_url ? { artworkUrl: item.thumbnail_url } : {}),
        playback: {
          url: item.playback_url,
          type: item.playback_type,
          ...(item.fallback_playback_url
            ? { fallbackUrl: item.fallback_playback_url }
            : {}),
          hasVideo: item.has_video,
        },
      });
    },
    [playback],
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.icon}>
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        <Text style={styles.title}>{t('library.savedTitle')}</Text>
        <View style={styles.icon} />
      </View>
      <View style={styles.filters}>
        {(['all', 'foryou', 'news'] as const).map((value) => (
          <FilterButton key={value} active={feed === value} label={t(`library.${value === 'foryou' ? 'forYou' : value}`)} onPress={() => setFeed(value)} />
        ))}
        <FilterButton active label={t(sort === 'saved_desc' ? 'library.newest' : 'library.oldest')} onPress={() => setSort((value) => value === 'saved_desc' ? 'saved_asc' : 'saved_desc')} />
      </View>
      {query.isLoading ? <ActivityIndicator color={colors.pressRed} style={styles.loader} /> : (
        <FlatList
          contentContainerStyle={items.length ? styles.list : styles.empty}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable accessibilityRole="button" onPress={() => void open(item)} style={styles.cardMain}>
                {item.type !== 'NEWS' ? <Play color={colors.pressRed} fill={colors.pressRed} size={19} /> : null}
                <View style={styles.cardCopy}>
                  <Text numberOfLines={2} style={styles.cardTitle}>{item.title || 'Wahb'}</Text>
                  <Text numberOfLines={1} style={styles.meta}>{item.source_name || item.author || item.type}</Text>
                </View>
              </Pressable>
              <Pressable accessibilityLabel={t('library.remove')} accessibilityRole="button" onPress={() => void remove(item)} style={styles.remove}>
                <X color={colors.ink} size={20} />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{t('library.emptySaved')}</Text>}
          ListFooterComponent={query.hasNextPage ? <Pressable onPress={() => void query.fetchNextPage()} style={styles.more}><Text style={styles.moreText}>{t('library.loadMore')}</Text></Pressable> : null}
        />
      )}
    </SafeAreaView>
  );
}

function FilterButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.filter, active && styles.filterActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.paper, flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md }, icon: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, title: { color: colors.ink, fontFamily: fontFamilies.editorial, fontSize: 27 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.sm }, filter: { borderColor: colors.ink, borderRadius: radii.round, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 }, filterActive: { backgroundColor: colors.ink }, filterText: { color: colors.ink, fontFamily: fontFamilies.bodyMedium, fontSize: 13 }, filterTextActive: { color: colors.inkInverse }, loader: { marginTop: spacing.xl }, list: { gap: spacing.sm, padding: spacing.md }, empty: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl }, emptyText: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 16, textAlign: 'center' }, card: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.compact, flexDirection: 'row', minHeight: 80, padding: spacing.sm }, cardMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm }, cardCopy: { flex: 1 }, cardTitle: { color: colors.ink, fontFamily: fontFamilies.bodyBold, fontSize: 15 }, meta: { color: colors.inkMuted, fontFamily: fontFamilies.body, fontSize: 13, marginTop: 3 }, remove: { alignItems: 'center', height: 44, justifyContent: 'center', width: 40 }, more: { alignItems: 'center', borderColor: colors.ink, borderRadius: radii.compact, borderWidth: 1, marginTop: spacing.sm, padding: spacing.sm }, moreText: { color: colors.ink, fontFamily: fontFamilies.bodyBold },
});
