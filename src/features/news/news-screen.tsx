import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { newsCollapsedSheetBaseHeight } from '@/components/feed/draggable-bottom-sheet-model';
import {
  feedChromeMetrics,
  NewsFeedChrome,
} from '@/components/navigation/feed-chrome';
import type { NewsFeedResponse } from '@/core/api';
import { captureException } from '@/core/diagnostics/diagnostics';
import { hapticSuccess } from '@/core/haptics/feedback';
import { getInstallationId } from '@/core/identity/installation-id';
import { identityScope as toIdentityScope } from '@/core/identity/identity-scope';
import { useOutbox } from '@/core/outbox/outbox-provider';
import {
  colors,
  componentMetrics,
  fontFamilies,
  radii,
  spacing,
  typeScale,
} from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { useWahbTypography } from '@/design/typography';
import { recordOpenedNewsStory } from '@/features/article-reader/article-reader-repository';
import { setArticleCoverageContext } from '@/features/article-reader/article-coverage-context';
import { useAuth } from '@/features/auth/auth-provider';

import { NewsCoverageSheet } from './news-coverage-sheet';
import { NewsNowPlayingTile, NewsPlaybackSheet } from './news-now-playing-tile';
import {
  newsPageIndex,
  newsPageLayout,
  newsPageOffset,
  nextNewsSheetConcealed,
  reconcileNewsPageIndex,
} from './news-pager-model';
import { firstBreakingSlide } from './news-now-playing-model';
import { NewsSlidePage } from './news-slide-page';

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
  const { clients, subject } = useAuth();
  const outbox = useOutbox();
  const subjectId = subject?.id;
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<NewsSlide>>(null);
  const slidesRef = useRef<NewsSlide[]>([]);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const activeSlideIdRef = useRef<string | null>(null);
  const visibleIndexRef = useRef(0);
  const lastScrollOffsetRef = useRef(0);
  const [slides, setSlides] = useState<NewsSlide[]>([]);
  const [pendingFresh, setPendingFresh] = useState<NewsSlide[]>([]);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [sheetConcealed, setSheetConcealed] = useState(false);
  const [pageHeight, setPageHeight] = useState(0);
  const [window, setWindow] = useState<'today' | 'week' | 'month'>('today');
  const [coverageStory, setCoverageStory] = useState<
    NewsSlide['featured'] | null
  >(null);
  const [playerOpenSignal, setPlayerOpenSignal] = useState(0);
  const { theme } = useWahbTheme();
  const { isRTL } = useWahbTypography();
  const identityQuery = useQuery({
    queryKey: ['installation-identity'],
    queryFn: getInstallationId,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const firstPageQuery = useQuery<NewsFeedResponse>({
    queryKey: ['news-first-page', identityQuery.data, subject?.id, window],
    enabled: Boolean(identityQuery.data),
    queryFn: ({ signal }) =>
      clients.cms.getNewsPage({
        installationId: identityQuery.data!,
        limit: 10,
        window,
        signal,
      }),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const replaceSlides = useCallback((next: NewsSlide[]) => {
    slidesRef.current = next;
    setSlides(next);
  }, []);

  const selectVisibleIndex = useCallback((nextIndex: number) => {
    const currentSlides = slidesRef.current;
    if (!currentSlides.length) return;
    const clamped = Math.max(0, Math.min(currentSlides.length - 1, nextIndex));
    visibleIndexRef.current = clamped;
    activeSlideIdRef.current = currentSlides[clamped]?.slide_id ?? null;
    setVisibleIndex(clamped);
  }, []);

  const alignToVisibleIndex = useCallback(
    (animated: boolean) => {
      if (pageHeight <= 0) return;
      listRef.current?.scrollToOffset({
        animated,
        offset: newsPageOffset(visibleIndexRef.current, pageHeight),
      });
    },
    [pageHeight],
  );

  const handlePagerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    if (nextHeight > 0) {
      setPageHeight((current) =>
        current === nextHeight ? current : nextHeight,
      );
    }
  }, []);

  const handlePagerScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = Math.max(0, event.nativeEvent.contentOffset.y);
      const previousOffset = lastScrollOffsetRef.current;
      lastScrollOffsetRef.current = offset;
      setSheetConcealed((current) => {
        const next = nextNewsSheetConcealed(current, offset, previousOffset);
        return current === next ? current : next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!firstPageQuery.data || slidesRef.current.length > 0) {
      return;
    }
    cursorRef.current = firstPageQuery.data.cursor;
    replaceSlides(firstPageQuery.data.slides);
  }, [firstPageQuery.data, replaceSlides]);

  useEffect(() => {
    if (pageHeight <= 0 || !slides.length) return;
    const nextIndex = reconcileNewsPageIndex(
      activeSlideIdRef.current,
      slides.map((slide) => slide.slide_id),
      visibleIndexRef.current,
    );
    selectVisibleIndex(nextIndex);
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        animated: false,
        offset: newsPageOffset(nextIndex, pageHeight),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [pageHeight, selectVisibleIndex, slides]);

  const checkForFreshNews = useCallback(async () => {
    if (!identityQuery.data) {
      return;
    }
    try {
      const page = await clients.cms.getNewsPage({
        installationId: identityQuery.data,
        limit: 10,
        window,
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
  }, [clients.cms, identityQuery.data, window]);

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
      const page = await clients.cms.getNewsPage({
        cursor: cursorRef.current,
        installationId: identityQuery.data,
        limit: 10,
        window,
      });
      cursorRef.current = page.cursor;
      replaceSlides(mergeNewSlides(slidesRef.current, page.slides));
    } catch (error) {
      captureException('news_page_failed', error);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [clients.cms, identityQuery.data, replaceSlides, window]);

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
    activeSlideIdRef.current = pendingFresh[0]?.slide_id ?? null;
    visibleIndexRef.current = 0;
    lastScrollOffsetRef.current = 0;
    setSheetConcealed(false);
    setPendingFresh([]);
    listRef.current?.scrollToOffset({ animated: true, offset: 0 });
    selectVisibleIndex(0);
    hapticSuccess();
  }, [pendingFresh, replaceSlides, selectVisibleIndex]);

  const openStory = useCallback(
    async (
      storyId: string,
      leadId: string,
      coverage?: NewsSlide['featured'],
    ) => {
      if (coverage)
        setArticleCoverageContext(leadId, {
          storyId,
          members: coverage.members,
        });
      if (identityQuery.data) {
        try {
          await recordOpenedNewsStory(
            db,
            toIdentityScope(identityQuery.data, subjectId),
            storyId,
            leadId,
          );
        } catch (error) {
          // History persistence is best-effort here; a transient local write
          // failure must not make an otherwise readable story inaccessible.
          captureException('news_history_write_failed', error);
        }
      }
      try {
        // CMS History deduplicates by lead content ID and resolves the actor
        // from the authenticated token when present, otherwise the supplied
        // installation. The local ledger remains the offline record.
        await outbox.enqueue({
          contentId: leadId,
          type: 'view',
          metadata: { surface: 'news', story_id: storyId },
        });
      } catch (error) {
        captureException('news_history_enqueue_failed', error);
      }
      router.push({ pathname: '/article/[id]', params: { id: leadId } });
    },
    [db, identityQuery.data, outbox, router, subjectId],
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

  // The chrome is absolutely positioned. Reserve its actual 40pt control plus
  // one editorial gutter, rather than the old oversized generic header slot.
  const contentTopPadding =
    insets.top + componentMetrics.chromeControl + spacing.md;
  const collapsedSheetHeight = newsCollapsedSheetBaseHeight + insets.bottom;
  // News only exposes a pull handle while collapsed. Its bottom reserve should
  // be compact so the static slide does not lose an additional full gutter.
  const contentBottomPadding = collapsedSheetHeight + spacing.xs;
  const activeStory = slides[visibleIndex]?.featured ?? null;
  const breakingStory = firstBreakingSlide(slides)?.featured ?? null;

  return (
    <View
      onLayout={handlePagerLayout}
      style={[styles.root, { backgroundColor: theme.background }]}
    >
      <NewsFeedChrome
        window={window}
        onWindowChange={(nextWindow) => {
          if (nextWindow === window) return;
          cursorRef.current = null;
          activeSlideIdRef.current = null;
          visibleIndexRef.current = 0;
          lastScrollOffsetRef.current = 0;
          setSheetConcealed(false);
          setPendingFresh([]);
          replaceSlides([]);
          setVisibleIndex(0);
          setWindow(nextWindow);
        }}
      />
      <FlatList
        data={slides}
        decelerationRate="fast"
        disableIntervalMomentum
        extraData={{
          contentBottomPadding,
          contentTopPadding,
          pageHeight,
          visibleIndex,
        }}
        getItemLayout={
          pageHeight > 0
            ? (_, index) => newsPageLayout(pageHeight, index)
            : undefined
        }
        initialNumToRender={2}
        keyExtractor={(slide) => slide.slide_id}
        maxToRenderPerBatch={3}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.7}
        onMomentumScrollEnd={(event) => {
          if (pageHeight <= 0) return;
          const nextIndex = newsPageIndex(
            event.nativeEvent.contentOffset.y,
            pageHeight,
            slidesRef.current.length,
          );
          selectVisibleIndex(nextIndex);
          const expectedOffset = newsPageOffset(nextIndex, pageHeight);
          if (
            Math.abs(event.nativeEvent.contentOffset.y - expectedOffset) > 0.5
          ) {
            listRef.current?.scrollToOffset({
              animated: false,
              offset: expectedOffset,
            });
          }
        }}
        onScrollEndDrag={(event) => {
          if (pageHeight <= 0 || event.nativeEvent.velocity?.y) return;
          const nextIndex = newsPageIndex(
            event.nativeEvent.contentOffset.y,
            pageHeight,
            slidesRef.current.length,
          );
          selectVisibleIndex(nextIndex);
          alignToVisibleIndex(true);
        }}
        onScroll={handlePagerScroll}
        scrollEventThrottle={16}
        onScrollToIndexFailed={({ index }) => {
          if (pageHeight <= 0) return;
          listRef.current?.scrollToOffset({
            animated: false,
            offset: newsPageOffset(index, pageHeight),
          });
        }}
        pagingEnabled
        ref={listRef}
        removeClippedSubviews
        renderItem={({ item: slide, index }) => (
          <NewsSlidePage
            contentBottomPadding={contentBottomPadding}
            contentTopPadding={contentTopPadding}
            index={index}
            onOpenCoverage={setCoverageStory}
            onOpenStory={(storyId, leadId, coverage) =>
              void openStory(storyId, leadId, coverage)
            }
            pageHeight={pageHeight}
            slide={slide}
          />
        )}
        showsVerticalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={pageHeight > 0 ? pageHeight : undefined}
        style={styles.pager}
        testID="news-pager"
      />
      <View pointerEvents="box-none" style={styles.newContentOverlay}>
        {pendingFresh.length > 0 ? (
          <Pressable
            accessibilityLabel={t('news.showNew', { count: pendingFresh.length })}
            accessibilityRole="button"
            onPress={applyFreshNews}
            style={[
              styles.newContent,
              { top: insets.top + feedChromeMetrics.newsHeight - spacing.sm },
            ]}
          >
            <Text style={styles.newContentText}>
              {t('news.showNew', { count: pendingFresh.length })}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View
        style={[
          styles.nowPlayingAnchor,
          {
            bottom: collapsedSheetHeight + spacing.md,
            ...(isRTL ? { left: spacing.md } : { right: spacing.md }),
          },
        ]}
      >
        <NewsNowPlayingTile
          breaking={breakingStory}
          onOpenBreaking={(story) =>
            void openStory(story.story_id, story.lead_id, story)
          }
          onOpenSheet={() => setPlayerOpenSignal((value) => value + 1)}
        />
      </View>
      <NewsPlaybackSheet
        activeStory={activeStory}
        concealed={sheetConcealed}
        openSignal={playerOpenSignal}
      />
      <NewsCoverageSheet
        onClose={() => setCoverageStory(null)}
        story={coverageStory}
        visible={Boolean(coverageStory)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
    ...typeScale.featureTitle,
    textAlign: 'center',
  },
  newContent: {
    alignSelf: 'center',
    backgroundColor: colors.pressRed,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    position: 'absolute',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  newContentOverlay: {
    bottom: 0,
    // Android needs elevation in addition to zIndex for a chrome overlay to
    // remain above the virtualized pager.
    elevation: 25,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 25,
  },
  newContentText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
  },
  pager: { flex: 1 },
  nowPlayingAnchor: {
    position: 'absolute',
    zIndex: 24,
  },
});
