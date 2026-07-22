import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, Play, Trash2 } from 'lucide-react-native';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import type { HistoryItem } from '@/core/api';
import { getInstallationId } from '@/core/identity/installation-id';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';
import { useAuth } from '@/features/auth/auth-provider';
import { usePlaybackController } from '@/features/playback/playback-provider';

export function HistoryScreen() {
  const { t } = useTranslation();
  const { clients, subject } = useAuth();
  const playback = usePlaybackController();
  const queryClient = useQueryClient();
  const installationQuery = useQuery({
    queryKey: ['history-installation-identity'],
    queryFn: getInstallationId,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const installationId = installationQuery.data;
  const query = useInfiniteQuery({
    queryKey: ['watch-history', installationId, subject?.id],
    enabled: Boolean(installationId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      clients.cms.getHistory({
        installationId: installationId!,
        ...(pageParam ? { cursor: pageParam } : {}),
        signal,
      }),
    getNextPageParam: (page) => page.cursor,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const clear = useCallback(() => {
    Alert.alert(t('library.clearHistoryTitle'), t('library.clearHistoryCopy'), [
      { style: 'cancel', text: t('account.cancel') },
      {
        style: 'destructive',
        text: t('library.clear'),
        onPress: () =>
          void (
            installationId
              ? clients.cms.clearHistory(installationId)
              : Promise.resolve()
          ).then(() =>
            queryClient.removeQueries({
              queryKey: ['watch-history', installationId, subject?.id],
            }),
          ),
      },
    ]);
  }, [clients.cms, installationId, queryClient, subject?.id, t]);
  const open = useCallback(
    async (item: HistoryItem) => {
      if (item.type === 'NEWS') {
        router.push(`/article/${item.content_id}`);
        return;
      }
      if (!item.media_url) {
        return;
      }
      await playback.start(
        {
          id: item.content_id,
          contentType: item.type,
          title: item.title || 'Wahb',
          ...(item.source_name ? { sourceName: item.source_name } : {}),
          ...(item.thumbnail_url ? { artworkUrl: item.thumbnail_url } : {}),
          playback: {
            url: item.media_url,
            type: 'mp4',
            hasVideo: item.type === 'VIDEO',
          },
        },
        { positionSeconds: item.progress_seconds ?? 0 },
      );
    },
    [playback],
  );
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.icon}
        >
          <ChevronLeft color={colors.ink} size={24} />
        </Pressable>
        <Text style={styles.title}>{t('library.historyTitle')}</Text>
        <Pressable
          accessibilityLabel={t('library.clearHistory')}
          accessibilityRole="button"
          onPress={clear}
          style={styles.icon}
        >
          <Trash2 color={colors.pressRed} size={21} />
        </Pressable>
      </View>
      {query.isLoading ? (
        <ActivityIndicator color={colors.pressRed} style={styles.loader} />
      ) : (
        <FlatList
          contentContainerStyle={items.length ? styles.list : styles.empty}
          data={items}
          keyExtractor={(item) => `${item.content_id}-${item.viewed_at}`}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => void open(item)}
              style={styles.card}
            >
              {item.type !== 'NEWS' ? (
                <Play
                  color={colors.pressRed}
                  fill={colors.pressRed}
                  size={19}
                />
              ) : null}
              <View style={styles.copy}>
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {item.title || 'Wahb'}
                </Text>
                <Text numberOfLines={1} style={styles.meta}>
                  {item.source_name || item.author || item.type}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t('library.emptyHistory')}</Text>
          }
          ListFooterComponent={
            query.hasNextPage ? (
              <Pressable
                onPress={() => void query.fetchNextPage()}
                style={styles.more}
              >
                <Text style={styles.moreText}>{t('library.loadMore')}</Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.paper, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  icon: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  title: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 27,
  },
  loader: { marginTop: spacing.xl },
  list: { gap: spacing.sm, padding: spacing.md },
  empty: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  emptyText: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    textAlign: 'center',
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.compact,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 76,
    padding: spacing.sm,
  },
  copy: { flex: 1 },
  cardTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
  },
  meta: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 13,
    marginTop: 3,
  },
  more: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    marginTop: spacing.sm,
    padding: spacing.sm,
  },
  moreText: { color: colors.ink, fontFamily: fontFamilies.bodyBold },
});
