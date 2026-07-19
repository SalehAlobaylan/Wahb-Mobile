import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { createServiceClients, type NewsFeedResponse } from '@/core/api';
import { captureException } from '@/core/diagnostics/diagnostics';
import { hapticSuccess } from '@/core/haptics/feedback';
import { getInstallationId } from '@/core/identity/installation-id';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';
import { recordOpenedNewsStory } from '@/features/article-reader/article-reader-repository';

import { NewsNowPlayingTile } from './news-now-playing-tile';

const { cms } = createServiceClients();
const newsRefreshMs = 60_000;

type NewsSlide = NewsFeedResponse['slides'][number];

function mergeNewSlides(
  current: readonly NewsSlide[],
  additions: readonly NewsSlide[],
): NewsSlide[] {
  const known = new Set(current.map((slide) => slide.slide_id));
  return [
    ...current,
    ...additions.filter((slide) => !known.has(slide.slide_id)),
  ];
}

export function NewsScreen() {
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const router = useRouter();
  const listRef = useRef<FlatList<NewsSlide>>(null);
  const slidesRef = useRef<NewsSlide[]>([]);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const [slides, setSlides] = useState<NewsSlide[]>([]);
  const [pendingFresh, setPendingFresh] = useState<NewsSlide[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const identityQuery = useQuery({
    queryKey: ['installation-identity'],
    queryFn: getInstallationId,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const firstPageQuery = useQuery<NewsFeedResponse>({
    queryKey: ['news-first-page', identityQuery.data],
    enabled: Boolean(identityQuery.data),
    queryFn: ({ signal }) =>
      cms.getNewsPage({
        installationId: identityQuery.data!,
        limit: 10,
        signal,
      }),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const replaceSlides = useCallback((next: NewsSlide[]) => {
    slidesRef.current = next;
    setSlides(next);
  }, []);

  useEffect(() => {
    if (!firstPageQuery.data || slidesRef.current.length > 0) {
      return;
    }
    cursorRef.current = firstPageQuery.data.cursor;
    replaceSlides(firstPageQuery.data.slides);
  }, [firstPageQuery.data, replaceSlides]);

  const checkForFreshNews = useCallback(async () => {
    if (!identityQuery.data) {
      return;
    }
    try {
      const page = await cms.getNewsPage({
        installationId: identityQuery.data,
        limit: 10,
      });
      const known = new Set(slidesRef.current.map((slide) => slide.slide_id));
      const unseen = page.slides.filter((slide) => !known.has(slide.slide_id));
      if (unseen.length > 0) {
        setPendingFresh(unseen);
      }
    } catch (error) {
      // A live refresh is additive; it must never displace a readable slide on
      // failure, so diagnostics are sufficient here.
      captureException('news_live_refresh_failed', error);
    }
  }, [identityQuery.data]);

  useEffect(() => {
    if (!identityQuery.data || slidesRef.current.length === 0) {
      return;
    }
    const interval = setInterval(() => void checkForFreshNews(), newsRefreshMs);
    return () => clearInterval(interval);
  }, [checkForFreshNews, identityQuery.data, slides.length]);

  const loadMore = useCallback(async () => {
    if (!identityQuery.data || !cursorRef.current || loadingMoreRef.current) {
      return;
    }
    loadingMoreRef.current = true;
    try {
      const page = await cms.getNewsPage({
        cursor: cursorRef.current,
        installationId: identityQuery.data,
        limit: 10,
      });
      cursorRef.current = page.cursor;
      replaceSlides(mergeNewSlides(slidesRef.current, page.slides));
    } catch (error) {
      captureException('news_page_failed', error);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [identityQuery.data, replaceSlides]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await checkForFreshNews();
    setIsRefreshing(false);
  }, [checkForFreshNews]);

  const applyFreshNews = useCallback(() => {
    if (!pendingFresh.length) {
      return;
    }
    // This is the only intentional reordering point. The user explicitly asks
    // for current coverage, and we return them to the first slide before it is
    // replaced rather than moving the slide currently being read underneath.
    const current = slidesRef.current;
    replaceSlides([
      ...pendingFresh,
      ...current.filter(
        (slide) =>
          !pendingFresh.some((fresh) => fresh.slide_id === slide.slide_id),
      ),
    ]);
    setPendingFresh([]);
    listRef.current?.scrollToOffset({ animated: true, offset: 0 });
    setVisibleIndex(0);
    hapticSuccess();
  }, [pendingFresh, replaceSlides]);

  const openStory = useCallback(
    async (storyId: string, leadId: string) => {
      if (identityQuery.data) {
        try {
          await recordOpenedNewsStory(
            db,
            `anonymous:${identityQuery.data}`,
            storyId,
            leadId,
          );
        } catch (error) {
          // History persistence is best-effort here; a transient local write
          // failure must not make an otherwise readable story inaccessible.
          captureException('news_history_write_failed', error);
        }
      }
      router.push({ pathname: '/article/[id]', params: { id: leadId } });
    },
    [db, identityQuery.data, router],
  );

  if (identityQuery.isPending || firstPageQuery.isPending) {
    return (
      <SafeAreaView style={styles.state}>
        <ActivityIndicator color={colors.pressRed} />
      </SafeAreaView>
    );
  }

  if (firstPageQuery.isError || !slides.length) {
    return (
      <SafeAreaView style={styles.state}>
        <Text style={styles.empty}>{t('news.unavailable')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Image
          contentFit="contain"
          source={require('../../../assets/brand/wahb-wordmark.png')}
          style={styles.wordmark}
        />
        <NewsNowPlayingTile />
      </View>
      {pendingFresh.length > 0 ? (
        <Pressable
          accessibilityLabel={t('news.showNew', { count: pendingFresh.length })}
          accessibilityRole="button"
          onPress={applyFreshNews}
          style={styles.newContent}
        >
          <Text style={styles.newContentText}>
            {t('news.showNew', { count: pendingFresh.length })}
          </Text>
        </Pressable>
      ) : null}
      <FlatList
        data={slides}
        keyExtractor={(slide) => slide.slide_id}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.7}
        onMomentumScrollEnd={(event) => {
          const height = event.nativeEvent.layoutMeasurement.height;
          if (height > 0) {
            setVisibleIndex(
              Math.max(
                0,
                Math.round(event.nativeEvent.contentOffset.y / height),
              ),
            );
          }
        }}
        pagingEnabled
        ref={listRef}
        refreshControl={
          <RefreshControl
            enabled={visibleIndex === 0}
            onRefresh={() => void refresh()}
            refreshing={isRefreshing}
            tintColor={colors.pressRed}
          />
        }
        renderItem={({ item: slide }) => (
          <View style={styles.slide}>
            <Text style={styles.eyebrow}>{t('news.feedLabel')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void openStory(slide.featured.story_id, slide.featured.lead_id)
              }
              style={styles.featured}
            >
              {slide.featured.thumbnail_url ? (
                <Image
                  contentFit="cover"
                  source={slide.featured.thumbnail_url}
                  style={styles.hero}
                />
              ) : null}
              {!!slide.featured.category && (
                <Text style={styles.category}>{slide.featured.category}</Text>
              )}
              <Text numberOfLines={4} style={styles.headline}>
                {slide.featured.title || slide.featured.label}
              </Text>
              {!!slide.featured.excerpt && (
                <Text numberOfLines={3} style={styles.excerpt}>
                  {slide.featured.excerpt}
                </Text>
              )}
              <Text style={styles.meta}>
                {t('news.coveredBy', {
                  count:
                    slide.featured.source_count || slide.featured.member_count,
                })}
              </Text>
              <Text numberOfLines={1} style={styles.provenance}>
                {slide.featured.members
                  .map((member) => member.source_name)
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(' · ')}
              </Text>
            </Pressable>
            <Text style={styles.relatedLabel}>{t('news.related')}</Text>
            {slide.related.length ? (
              slide.related.map((story) => (
                <Pressable
                  key={story.story_id}
                  accessibilityRole="button"
                  onPress={() => void openStory(story.story_id, story.lead_id)}
                  style={styles.related}
                >
                  <View style={styles.relatedCopy}>
                    <Text numberOfLines={2} style={styles.relatedTitle}>
                      {story.title || story.label}
                    </Text>
                    <Text style={styles.relatedMeta}>
                      {story.member_count} {t('news.members')}
                    </Text>
                  </View>
                  {story.thumbnail_url ? (
                    <Image
                      contentFit="cover"
                      source={story.thumbnail_url}
                      style={styles.relatedImage}
                    />
                  ) : null}
                </Pressable>
              ))
            ) : (
              <Text style={styles.noRelated}>{t('news.noRelated')}</Text>
            )}
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.paper, flex: 1 },
  state: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  empty: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 24,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  wordmark: { height: 36, width: 80 },
  newContent: {
    alignSelf: 'center',
    backgroundColor: colors.pressRed,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  newContentText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
  },
  slide: { flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  eyebrow: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  featured: {
    borderBottomColor: colors.ink,
    borderBottomWidth: 1,
    paddingBottom: spacing.md,
  },
  hero: { backgroundColor: colors.card, height: 230, width: '100%' },
  category: {
    color: colors.pressRed,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  headline: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 30,
    lineHeight: 36,
    marginTop: spacing.xs,
  },
  excerpt: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  meta: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  provenance: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 12,
    marginTop: 3,
  },
  relatedLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    letterSpacing: 1.2,
    marginTop: spacing.md,
  },
  related: {
    alignItems: 'center',
    borderBottomColor: colors.ink,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 78,
    paddingVertical: spacing.sm,
  },
  relatedCopy: { flex: 1 },
  relatedTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 17,
    lineHeight: 21,
  },
  relatedMeta: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.mono,
    fontSize: 11,
    marginTop: 3,
  },
  relatedImage: { backgroundColor: colors.card, height: 58, width: 78 },
  noRelated: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    marginTop: spacing.sm,
  },
});
