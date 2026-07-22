import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { VideoView } from 'expo-video';
import { useQuery } from '@tanstack/react-query';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FileText,
  Gauge,
  Heart,
  Info,
  Maximize2,
  MessageCircle,
  Minimize2,
  MoreHorizontal,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Share2,
  WifiOff,
  EyeOff,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useTranslation } from 'react-i18next';

import {
  captureDiagnostic,
  captureException,
} from '@/core/diagnostics/diagnostics';
import { NetworkError } from '@/core/api';
import {
  hapticSelection,
  hapticSuccess,
  hapticWarning,
} from '@/core/haptics/feedback';
import { useOutbox } from '@/core/outbox/outbox-provider';
import { useAuth } from '@/features/auth/auth-provider';
import type { FrozenForYouSession } from '@/features/feed-session/for-you-session-repository';
import {
  recordForYouCompletion,
  recordForYouExposure,
  recordForYouProgress,
  updateForYouSessionPosition,
} from '@/features/feed-session/for-you-session-repository';
import { useForYouSession } from '@/features/feed-session/use-for-you-session';
import {
  classifyConsumption,
  createConsumptionState,
  observeConsumption,
  type ConsumptionState,
} from '@/features/playback/consumption-classifier';
import { usePlaybackController } from '@/features/playback/playback-provider';
import {
  playbackRates,
  type PlaybackItem,
} from '@/features/playback/playback-model';

import { ForYouDetailSheet } from './for-you-detail-sheet';
import { ReportSheet } from '@/features/moderation/report-sheet';

import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

function formatDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ForYouSliceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const db = useSQLiteContext();
  const {
    identityQuery,
    sessionQuery,
    fetchNextPage,
    hideItem,
    refreshSession,
  } = useForYouSession();
  const playback = usePlaybackController();
  const outbox = useOutbox();
  const { clients, subject } = useAuth();
  const consumption = useRef<{
    key: string;
    state: ConsumptionState;
  } | null>(null);
  const lastPositionWrite = useRef<{ key: string; atMs: number } | null>(null);
  const currentPosition = useRef<{
    sessionId: string | null;
    position: number;
    playbackPositionMs: number;
  }>({ sessionId: null, position: 0, playbackPositionMs: 0 });
  const [selection, setSelection] = useState<{
    sessionId: string;
    position: number;
  } | null>(null);
  const [pendingAutoplay, setPendingAutoplay] = useState<{
    sessionId: string;
    position: number;
  } | null>(null);
  const [upNextSeconds, setUpNextSeconds] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasNewContent, setHasNewContent] = useState(false);
  const [displayMode, setDisplayMode] = useState<'fit' | 'fill' | 'transcript'>(
    'fill',
  );
  const [detailTab, setDetailTab] = useState<
    'comments' | 'transcript' | 'about' | null
  >(null);
  const [engagement, setEngagement] = useState<
    Record<string, { liked?: boolean; bookmarked?: boolean }>
  >({});
  const feedListRef =
    useRef<FlatList<FrozenForYouSession['items'][number]>>(null);
  const lastPagerSessionId = useRef<string | null>(null);
  const diagnosedSessionId = useRef<string | null>(null);
  const pagerHasInteracted = useRef(false);
  const playbackPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const [playbackPulse, setPlaybackPulse] = useState<'play' | 'pause' | null>(
    null,
  );
  const [isOverflowVisible, setIsOverflowVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: 'content';
    id: string;
  } | null>(null);
  const session = sessionQuery.data;
  const isOfflineSnapshot = session?.isOfflineSnapshot === true;
  const [connectionRequiredForId, setConnectionRequiredForId] = useState<
    string | null
  >(null);
  const position =
    selection !== null && selection.sessionId === session?.id
      ? selection.position
      : (session?.activePosition ?? 0);
  const active = session?.items[position];
  const item = active?.item;
  const activePlaybackItem = useMemo<PlaybackItem | null>(
    () =>
      item
        ? {
            id: item.id,
            contentType: item.type,
            title: item.title,
            ...(item.source_name ? { sourceName: item.source_name } : {}),
            ...(item.thumbnail_url ? { artworkUrl: item.thumbnail_url } : {}),
            playback: item.playback,
          }
        : null,
    [item],
  );

  const requiresConnection =
    isOfflineSnapshot && connectionRequiredForId === item?.id;
  const isCurrent = playback.item?.id === item?.id;
  const isVideoVisible = isCurrent && playback.kind === 'video';
  const showUpNext =
    upNextSeconds !== null &&
    isCurrent &&
    playback.didReachEnd &&
    !playback.error &&
    !(position >= (session?.items.length ?? 0) - 1 && session?.cursor === null);
  const installationId = identityQuery.data;
  const identityScope = installationId
    ? subject
      ? `user:${subject.id}`
      : `anonymous:${installationId}`
    : null;
  const liked = item ? (engagement[item.id]?.liked ?? item.is_liked) : false;
  const bookmarked = item
    ? (engagement[item.id]?.bookmarked ?? item.is_bookmarked)
    : false;
  const playbackDurationSeconds =
    isCurrent && playback.durationSeconds > 0
      ? playback.durationSeconds
      : (item?.duration_sec ?? 0);
  const playbackPositionSeconds = isCurrent
    ? playback.currentTimeSeconds
    : (active?.playbackPositionMs ?? 0) / 1_000;
  const playbackProgress =
    playbackDurationSeconds > 0
      ? Math.min(
          1,
          Math.max(0, playbackPositionSeconds / playbackDurationSeconds),
        )
      : 0;
  const transcriptQuery = useQuery({
    queryKey: ['for-you-transcript-display', item?.transcript_id],
    queryFn: () => clients.cms.getTranscript(item!.transcript_id!),
    enabled: displayMode === 'transcript' && Boolean(item?.transcript_id),
  });

  useEffect(() => {
    if (!session || !item || diagnosedSessionId.current === session.id) {
      return;
    }
    diagnosedSessionId.current = session.id;
    // Keep first-render and session-health signals free of content/session
    // identifiers. CMS remains the only product and ranking event pipeline.
    const eventType = isOfflineSnapshot ? 'offline_snapshot' : 'stable';
    captureDiagnostic('foryou_first_render', { event_type: eventType });
    captureDiagnostic('foryou_session_health', { event_type: eventType });
  }, [isOfflineSnapshot, item, session]);

  const queueCompletion = useCallback(
    async (
      targetSessionId: string,
      targetPosition: number,
      targetIdentityScope: string,
      state: ConsumptionState,
      durationSeconds: number,
    ) => {
      if (classifyConsumption(state, durationSeconds) !== 'completed') {
        return;
      }
      try {
        const recorded = await recordForYouCompletion(
          db,
          targetSessionId,
          targetPosition,
          targetIdentityScope,
          state.accumulatedPlayedSeconds,
          state.furthestPositionSeconds,
        );
        if (recorded) {
          await outbox.flush();
        }
      } catch (error) {
        captureException('foryou_completion_queue_failed', error);
      }
    },
    [db, outbox],
  );

  const persistCurrentPosition = useCallback(async () => {
    const current = currentPosition.current;
    if (!current.sessionId) {
      return;
    }
    try {
      await updateForYouSessionPosition(
        db,
        current.sessionId,
        current.position,
        current.playbackPositionMs,
      );
    } catch (error) {
      captureException('feed_session_position_write_failed', error);
    }
  }, [db]);

  useEffect(() => {
    currentPosition.current = {
      sessionId: session?.id ?? null,
      position,
      playbackPositionMs: Math.max(0, playback.currentTimeSeconds * 1_000),
    };
  }, [playback.currentTimeSeconds, position, session?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'inactive' || nextState === 'background') {
        void persistCurrentPosition();
      }
    });
    return () => subscription.remove();
  }, [persistCurrentPosition]);

  useEffect(() => {
    if (!session || !item || !identityScope) {
      return;
    }
    void recordForYouExposure(db, session.id, position, identityScope)
      .then(async (recorded) => {
        if (recorded) {
          await outbox.flush();
        }
      })
      .catch((error: unknown) => {
        captureException('foryou_exposure_queue_failed', error);
      });
  }, [db, identityScope, item, outbox, position, session]);

  useEffect(() => {
    if (!session || !item || !identityScope || !isCurrent) {
      return;
    }
    const key = `${session.id}:${position}:${item.id}`;
    if (consumption.current?.key !== key) {
      consumption.current = {
        key,
        state: createConsumptionState(playback.currentTimeSeconds),
      };
      return;
    }
    const next = observeConsumption(
      consumption.current.state,
      playback.currentTimeSeconds,
      playback.phase === 'playing',
    );
    consumption.current = { key, state: next };
    void queueCompletion(
      session.id,
      position,
      identityScope,
      next,
      playback.durationSeconds || item.duration_sec,
    );
  }, [
    identityScope,
    isCurrent,
    item,
    playback.currentTimeSeconds,
    playback.durationSeconds,
    playback.phase,
    position,
    queueCompletion,
    session,
  ]);

  useEffect(() => {
    if (
      !session ||
      !item ||
      !identityScope ||
      !isCurrent ||
      playback.phase !== 'playing'
    ) {
      return;
    }
    void recordForYouProgress(
      db,
      session.id,
      position,
      identityScope,
      playback.currentTimeSeconds,
      consumption.current?.state.accumulatedPlayedSeconds ?? 0,
    )
      .then((recorded) => {
        if (recorded) {
          return outbox.flush();
        }
        return undefined;
      })
      .catch((error: unknown) =>
        captureException('foryou_progress_queue_failed', error),
      );
  }, [
    db,
    identityScope,
    isCurrent,
    item,
    outbox,
    playback.currentTimeSeconds,
    playback.phase,
    position,
    session,
  ]);

  useEffect(() => {
    if (!session || !item || !isCurrent || playback.phase !== 'playing') {
      return;
    }
    const key = `${session.id}:${position}:${item.id}`;
    const nowMs = Date.now();
    const previous = lastPositionWrite.current;
    if (previous?.key === key && nowMs - previous.atMs < 5_000) {
      return;
    }
    lastPositionWrite.current = { key, atMs: nowMs };
    void persistCurrentPosition();
  }, [
    isCurrent,
    item,
    persistCurrentPosition,
    playback.currentTimeSeconds,
    playback.phase,
    position,
    session,
  ]);

  async function selectPosition(
    nextPosition: number,
    options: { autoplay?: boolean } = {},
  ) {
    setUpNextSeconds(null);
    if (!session || nextPosition < 0 || nextPosition >= session.items.length) {
      if (session && nextPosition === session.items.length) {
        const didAppend = await fetchNextPage();
        if (didAppend) {
          setSelection({ sessionId: session.id, position: nextPosition });
          if (options.autoplay) {
            setPendingAutoplay({
              sessionId: session.id,
              position: nextPosition,
            });
          }
        }
      }
      return;
    }

    if (session && identityScope && consumption.current) {
      void queueCompletion(
        session.id,
        position,
        identityScope,
        consumption.current.state,
        playback.durationSeconds || item?.duration_sec || 0,
      );
    }
    playback.pause();
    setSelection({ sessionId: session.id, position: nextPosition });
    if (options.autoplay) {
      setPendingAutoplay({ sessionId: session.id, position: nextPosition });
    } else {
      setPendingAutoplay(null);
    }
    try {
      await updateForYouSessionPosition(
        db,
        session.id,
        position,
        playback.currentTimeSeconds * 1_000,
      );
      await updateForYouSessionPosition(db, session.id, nextPosition, 0);
    } catch (error) {
      captureException('feed_session_position_write_failed', error);
    }
  }

  function togglePlayback() {
    if (!activePlaybackItem) {
      return;
    }
    if (isOfflineSnapshot) {
      // Feed metadata is preserved, but this is not an explicit download and
      // must never pretend the remote source is playable without a connection.
      setConnectionRequiredForId(activePlaybackItem.id);
      return;
    }

    const nextPulse =
      isCurrent && playback.phase === 'playing' ? 'pause' : 'play';
    setPlaybackPulse(nextPulse);
    if (playbackPulseTimer.current) {
      clearTimeout(playbackPulseTimer.current);
    }
    playbackPulseTimer.current = setTimeout(() => {
      setPlaybackPulse(null);
      playbackPulseTimer.current = null;
    }, 620);

    if (isCurrent && playback.error) {
      void playback.start(activePlaybackItem, {
        positionSeconds: playback.currentTimeSeconds,
        autoplay: true,
      });
      return;
    }

    if (isCurrent && playback.phase === 'playing') {
      setUpNextSeconds(null);
      playback.pause();
      return;
    }

    if (isCurrent) {
      setUpNextSeconds(null);
      playback.play();
      return;
    }

    void playback.start(activePlaybackItem, {
      positionSeconds: (active?.playbackPositionMs ?? 0) / 1_000,
      autoplay: true,
    });
  }

  const cyclePlaybackRate = useCallback(() => {
    if (!isCurrent) {
      return;
    }
    const currentIndex = playbackRates.indexOf(
      playback.rate as (typeof playbackRates)[number],
    );
    const nextRate =
      playbackRates[(currentIndex + 1) % playbackRates.length] ??
      playbackRates[0]!;
    playback.setRate(nextRate);
    hapticSelection();
  }, [isCurrent, playback]);

  const refreshForYouSession = useCallback(async () => {
    setUpNextSeconds(null);
    playback.pause();
    setPendingAutoplay(null);
    setIsRefreshing(true);
    try {
      await refreshSession();
      setHasNewContent(true);
      hapticSuccess();
    } catch (error) {
      captureException('foryou_session_refresh_failed', error);
      hapticWarning();
    } finally {
      setIsRefreshing(false);
    }
  }, [playback, refreshSession]);

  const toggleEngagement = useCallback(
    async (kind: 'like' | 'bookmark') => {
      if (!item) {
        return;
      }
      const current =
        kind === 'like'
          ? (engagement[item.id]?.liked ?? item.is_liked)
          : (engagement[item.id]?.bookmarked ?? item.is_bookmarked);
      const next = !current;
      setEngagement((existing) => ({
        ...existing,
        [item.id]: {
          ...existing[item.id],
          ...(kind === 'like' ? { liked: next } : { bookmarked: next }),
        },
      }));
      try {
        await outbox.enqueue({
          contentId: item.id,
          type: kind,
          operation: next ? 'create' : 'delete',
        });
        hapticSuccess();
      } catch (error) {
        setEngagement((existing) => ({
          ...existing,
          [item.id]: {
            ...existing[item.id],
            ...(kind === 'like' ? { liked: current } : { bookmarked: current }),
          },
        }));
        captureException('foryou_engagement_queue_failed', error, { kind });
        hapticWarning();
      }
    },
    [engagement, item, outbox],
  );

  const shareItem = useCallback(async () => {
    if (!item) {
      return;
    }
    try {
      const result = await Share.share({
        message: `https://wahb.salehspace.dev/content/${item.id}`,
        title: item.title,
      });
      if (result.action === Share.sharedAction) {
        await outbox.enqueue({ contentId: item.id, type: 'share' });
      }
    } catch (error) {
      captureException('foryou_share_failed', error);
    }
  }, [item, outbox]);

  const hideCurrentItem = useCallback(async () => {
    if (!item) {
      return;
    }
    const shouldAutoplay = isCurrent && playback.phase === 'playing';
    try {
      const updated = await hideItem(item.id);
      playback.dismiss();
      setUpNextSeconds(null);
      setPendingAutoplay(
        updated && shouldAutoplay
          ? { sessionId: updated.id, position: updated.activePosition }
          : null,
      );
      setSelection(
        updated
          ? { sessionId: updated.id, position: updated.activePosition }
          : null,
      );
      setIsOverflowVisible(false);
    } catch (error) {
      captureException('foryou_hide_item_failed', error);
      hapticWarning();
    }
  }, [hideItem, isCurrent, item, playback]);

  const handlePagerLayout = useCallback((event: LayoutChangeEvent) => {
    setPageHeight(event.nativeEvent.layout.height);
  }, []);

  useEffect(
    () => () => {
      if (playbackPulseTimer.current) {
        clearTimeout(playbackPulseTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      !pendingAutoplay ||
      pendingAutoplay.sessionId !== session?.id ||
      pendingAutoplay.position !== position ||
      !activePlaybackItem
    ) {
      return;
    }
    void playback
      .start(activePlaybackItem, {
        positionSeconds: 0,
        autoplay: playback.autoplayEnabled,
      })
      .finally(() => setPendingAutoplay(null));
  }, [activePlaybackItem, pendingAutoplay, playback, position, session?.id]);

  useEffect(() => {
    if (
      !session ||
      !item ||
      !isCurrent ||
      !playback.didReachEnd ||
      playback.error ||
      (position >= session.items.length - 1 && session.cursor === null)
    ) {
      return;
    }

    const startTimer = setTimeout(() => setUpNextSeconds(3), 0);
    const interval = setInterval(() => {
      setUpNextSeconds((current) =>
        current === null ? null : Math.max(0, current - 1),
      );
    }, 1_000);
    const timer = setTimeout(() => {
      void (async () => {
        const nextPosition = position + 1;
        if (nextPosition < session.items.length) {
          playback.pause();
          setSelection({ sessionId: session.id, position: nextPosition });
          setPendingAutoplay({ sessionId: session.id, position: nextPosition });
          try {
            await updateForYouSessionPosition(
              db,
              session.id,
              position,
              playback.currentTimeSeconds * 1_000,
            );
            await updateForYouSessionPosition(db, session.id, nextPosition, 0);
          } catch (error) {
            captureException('feed_session_position_write_failed', error);
          }
          return;
        }
        const didAppend = await fetchNextPage();
        if (didAppend) {
          setSelection({ sessionId: session.id, position: nextPosition });
          setPendingAutoplay({ sessionId: session.id, position: nextPosition });
        }
      })();
    }, 3_000);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      clearTimeout(startTimer);
    };
  }, [
    isCurrent,
    item,
    playback.didReachEnd,
    playback.error,
    playback.currentTimeSeconds,
    position,
    session,
    db,
    fetchNextPage,
    playback,
  ]);

  useEffect(() => {
    if (!session || pageHeight <= 0) {
      return;
    }
    const animated = lastPagerSessionId.current === session.id;
    lastPagerSessionId.current = session.id;
    const timer = setTimeout(() => {
      feedListRef.current?.scrollToIndex({ index: position, animated });
    }, 0);
    return () => clearTimeout(timer);
  }, [pageHeight, position, session]);

  if (identityQuery.isPending || sessionQuery.isPending) {
    return <ForYouLoading />;
  }

  if (identityQuery.isError || sessionQuery.isError) {
    return (
      <ForYouFailure
        offline={sessionQuery.error instanceof NetworkError}
        onRetry={() => void sessionQuery.refetch()}
      />
    );
  }

  if (!session || !item) {
    return <ForYouEmpty />;
  }

  return (
    <SafeAreaView onLayout={handlePagerLayout} style={styles.safeArea}>
      <FlatList
        data={session.items}
        decelerationRate="fast"
        getItemLayout={
          pageHeight > 0
            ? (_, index) => ({
                index,
                length: pageHeight,
                offset: pageHeight * index,
              })
            : undefined
        }
        initialNumToRender={2}
        key={session.id}
        keyExtractor={(entry) => `${session.id}:${entry.item.id}`}
        maxToRenderPerBatch={3}
        onMomentumScrollEnd={(event) => {
          if (pageHeight <= 0) {
            return;
          }
          const nextPosition = Math.max(
            0,
            Math.min(
              session.items.length - 1,
              Math.round(event.nativeEvent.contentOffset.y / pageHeight),
            ),
          );
          if (nextPosition !== position) {
            void selectPosition(nextPosition, {
              autoplay: playback.phase === 'playing',
            });
          }
        }}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          feedListRef.current?.scrollToOffset({
            offset: index * averageItemLength,
            animated: false,
          });
        }}
        onEndReached={() => {
          if (
            pagerHasInteracted.current &&
            position >= session.items.length - 2
          ) {
            void fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        onScrollBeginDrag={() => {
          pagerHasInteracted.current = true;
        }}
        pagingEnabled
        ref={feedListRef}
        refreshControl={
          position === 0 ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void refreshForYouSession()}
              tintColor={colors.inkInverse}
              title={t('foryou.refreshing')}
              titleColor={colors.inkInverse}
            />
          ) : undefined
        }
        removeClippedSubviews
        renderItem={({ item: page, index }) => (
          <Pressable
            accessible={false}
            disabled={index !== position}
            onPress={togglePlayback}
            style={[styles.page, { height: pageHeight }]}
          >
            {index === position && isVideoVisible ? (
              <VideoView
                player={playback.videoPlayer}
                style={StyleSheet.absoluteFill}
                contentFit={displayMode === 'fit' ? 'contain' : 'cover'}
                nativeControls={false}
              />
            ) : page.item.thumbnail_url ? (
              <Image
                source={page.item.thumbnail_url}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <View style={styles.audioFallback} />
            )}
            {index === position && playbackPulse ? (
              <View pointerEvents="none" style={styles.playbackPulse}>
                {playbackPulse === 'play' ? (
                  <Play
                    color={colors.inkInverse}
                    fill={colors.inkInverse}
                    size={30}
                  />
                ) : (
                  <Pause
                    color={colors.inkInverse}
                    fill={colors.inkInverse}
                    size={30}
                  />
                )}
              </View>
            ) : null}
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
        style={styles.feedPager}
        windowSize={3}
      />
      <View pointerEvents="box-none" style={styles.card}>
        <View pointerEvents="none" style={styles.overlay} />
        <View style={styles.displayRail}>
          <Pressable
            accessibilityLabel={t('foryou.fit')}
            accessibilityRole="button"
            onPress={() => setDisplayMode('fit')}
            style={({ pressed }) => [
              styles.railButton,
              displayMode === 'fit' && styles.railButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Minimize2 color={colors.inkInverse} size={18} />
          </Pressable>
          <Pressable
            accessibilityLabel={t('foryou.fill')}
            accessibilityRole="button"
            onPress={() => setDisplayMode('fill')}
            style={({ pressed }) => [
              styles.railButton,
              displayMode === 'fill' && styles.railButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <Maximize2 color={colors.inkInverse} size={18} />
          </Pressable>
          <Pressable
            accessibilityLabel={t('foryou.transcript')}
            accessibilityRole="button"
            accessibilityState={{ selected: displayMode === 'transcript' }}
            onPress={() => setDisplayMode('transcript')}
            style={({ pressed }) => [
              styles.railButton,
              displayMode === 'transcript' && styles.railButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <FileText color={colors.inkInverse} size={18} />
          </Pressable>
        </View>
        <View style={styles.header}>
          <View>
            <Text style={styles.feedLabel}>{t('foryou.feedLabel')}</Text>
            {hasNewContent ? (
              <Text style={styles.newContentLabel}>
                {t('foryou.newContent')}
              </Text>
            ) : null}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.sessionLabel}>
              {position + 1} / {session.items.length}
            </Text>
            <Pressable
              testID="account-entry"
              accessibilityLabel={t('account.title')}
              accessibilityRole="button"
              onPress={() => router.push('/account')}
              style={styles.accountButton}
            >
              <CircleUserRound color={colors.inkInverse} size={21} />
            </Pressable>
          </View>
        </View>
        {isOfflineSnapshot ? (
          <View accessibilityLiveRegion="polite" style={styles.offlineBanner}>
            <WifiOff color={colors.inkInverse} size={14} />
            <Text style={styles.offlineBannerText}>
              {t('foryou.offlineSnapshot')}
            </Text>
          </View>
        ) : null}
        {displayMode === 'transcript' ? (
          <ForYouTranscriptMode
            hasTranscript={Boolean(item.transcript_id)}
            isError={transcriptQuery.isError}
            isLoading={transcriptQuery.isLoading}
            sourceName={item.source_name}
            text={transcriptQuery.data?.full_text}
          />
        ) : null}

        <View style={styles.footer}>
          <View style={styles.metaRow}>
            <Radio color={colors.pressRedDark} size={16} strokeWidth={2.2} />
            <Text style={styles.metaText}>{item.type}</Text>
            <Text style={styles.metaText}>
              {formatDuration(item.duration_sec)}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={3}>
            {item.title}
          </Text>
          {!!item.source_name && (
            <Text style={styles.source}>{item.source_name}</Text>
          )}

          <View
            accessible
            accessibilityLabel={t('foryou.playbackProgress')}
            accessibilityRole="progressbar"
            accessibilityValue={{
              max: Math.round(playbackDurationSeconds),
              min: 0,
              now: Math.round(playbackPositionSeconds),
            }}
            style={styles.progressTrack}
          >
            <View
              style={[
                styles.progressFill,
                { width: `${playbackProgress * 100}%` },
              ]}
            />
          </View>

          {requiresConnection ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.playbackFailure}
            >
              <Text style={styles.errorText}>{t('foryou.connectToPlay')}</Text>
            </View>
          ) : playback.error && isCurrent ? (
            <View style={styles.playbackFailure}>
              <Text style={styles.errorText}>{t('foryou.playbackError')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('foryou.retry')}
                onPress={() => void togglePlayback()}
                style={({ pressed }) => [
                  styles.playbackRetry,
                  pressed && styles.pressed,
                ]}
              >
                <RotateCcw color={colors.inkInverse} size={14} />
                <Text style={styles.playbackRetryText}>
                  {t('foryou.retry')}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {showUpNext ? (
            <Text style={styles.upNextText}>
              {t('foryou.upNext', { seconds: upNextSeconds })}
            </Text>
          ) : null}

          <View style={styles.actionRail}>
            <Pressable
              accessibilityLabel={liked ? t('foryou.unlike') : t('foryou.like')}
              accessibilityRole="button"
              accessibilityState={{ selected: liked }}
              onPress={() => void toggleEngagement('like')}
              style={({ pressed }) => [
                styles.actionButton,
                liked && styles.actionButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Heart
                color={colors.inkInverse}
                fill={liked ? colors.inkInverse : 'transparent'}
                size={22}
              />
              <Text style={styles.actionCount}>
                {item.like_count + Number(liked) - Number(item.is_liked)}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={
                bookmarked ? t('foryou.removeBookmark') : t('foryou.bookmark')
              }
              accessibilityRole="button"
              accessibilityState={{ selected: bookmarked }}
              onPress={() => void toggleEngagement('bookmark')}
              style={({ pressed }) => [
                styles.actionButton,
                bookmarked && styles.actionButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Bookmark
                color={colors.inkInverse}
                fill={bookmarked ? colors.inkInverse : 'transparent'}
                size={22}
              />
            </Pressable>
            <Pressable
              accessibilityLabel={t('foryou.comments')}
              accessibilityRole="button"
              onPress={() => setDetailTab('comments')}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.pressed,
              ]}
            >
              <MessageCircle color={colors.inkInverse} size={22} />
              <Text style={styles.actionCount}>{item.comment_count}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('foryou.share')}
              accessibilityRole="button"
              onPress={() => void shareItem()}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.pressed,
              ]}
            >
              <Share2 color={colors.inkInverse} size={22} />
            </Pressable>
            <Pressable
              accessibilityLabel={t('foryou.about')}
              accessibilityRole="button"
              onPress={() => setDetailTab('about')}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.pressed,
              ]}
            >
              <Info color={colors.inkInverse} size={22} />
            </Pressable>
            <Pressable
              accessibilityLabel={t('foryou.moreActions')}
              accessibilityRole="button"
              onPress={() => setIsOverflowVisible(true)}
              style={({ pressed }) => [
                styles.actionButton,
                pressed && styles.pressed,
              ]}
            >
              <MoreHorizontal color={colors.inkInverse} size={22} />
            </Pressable>
          </View>

          <View style={styles.controls}>
            <Pressable
              accessibilityLabel={t('foryou.changeSpeed', {
                rate: isCurrent ? playback.rate : 1,
              })}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isCurrent }}
              disabled={!isCurrent}
              onPress={cyclePlaybackRate}
              style={({ pressed }) => [
                styles.speedButton,
                !isCurrent && styles.disabledButton,
                pressed && styles.pressed,
              ]}
            >
              <Gauge color={colors.inkInverse} size={17} />
              <Text style={styles.speedText}>
                {isCurrent ? playback.rate : 1}×
              </Text>
            </Pressable>
            <Pressable
              testID="for-you-playback-toggle"
              accessibilityRole="button"
              accessibilityLabel={t('foryou.previous')}
              disabled={position === 0}
              onPress={() => void selectPosition(position - 1)}
              style={({ pressed }) => [
                styles.secondaryButton,
                position === 0 && styles.disabledButton,
                pressed && styles.pressed,
              ]}
            >
              <ChevronLeft color={colors.inkInverse} size={22} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isCurrent && playback.phase === 'playing'
                  ? t('foryou.pause')
                  : t('foryou.play')
              }
              onPress={togglePlayback}
              style={({ pressed }) => [
                styles.playButton,
                pressed && styles.pressed,
              ]}
            >
              {isCurrent && playback.phase === 'playing' ? (
                <Pause
                  color={colors.inkInverse}
                  size={26}
                  fill={colors.inkInverse}
                />
              ) : (
                <Play
                  color={colors.inkInverse}
                  size={26}
                  fill={colors.inkInverse}
                />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('foryou.next')}
              disabled={
                session.cursor === null && position >= session.items.length - 1
              }
              onPress={() => void selectPosition(position + 1)}
              style={({ pressed }) => [
                styles.secondaryButton,
                session.cursor === null &&
                  position >= session.items.length - 1 &&
                  styles.disabledButton,
                pressed && styles.pressed,
              ]}
            >
              <ChevronRight color={colors.inkInverse} size={22} />
            </Pressable>
          </View>
        </View>
      </View>
      {installationId && detailTab ? (
        <ForYouDetailSheet
          initialTab={detailTab}
          installationId={installationId}
          item={item}
          onClose={() => setDetailTab(null)}
          visible
        />
      ) : null}
      <ForYouOverflowSheet
        onClose={() => setIsOverflowVisible(false)}
        onReport={() =>
          item && setReportTarget({ type: 'content', id: item.id })
        }
        onHide={() => void hideCurrentItem()}
        visible={isOverflowVisible}
      />
      <ReportSheet
        onClose={() => setReportTarget(null)}
        onReported={() => void hideCurrentItem()}
        target={reportTarget}
        visible={Boolean(reportTarget)}
      />
    </SafeAreaView>
  );
}

function ForYouTranscriptMode({
  hasTranscript,
  isError,
  isLoading,
  sourceName,
  text,
}: {
  hasTranscript: boolean;
  isError: boolean;
  isLoading: boolean;
  sourceName?: string;
  text?: string;
}) {
  const { t } = useTranslation();
  const excerpt = text ? createTranscriptExcerpt(text) : null;

  return (
    <View pointerEvents="none" style={styles.transcriptSurface}>
      <View style={styles.transcriptHalo} />
      <View style={styles.transcriptEyebrowRow}>
        <Text style={styles.transcriptEyebrow}>{t('foryou.transcript')}</Text>
        {!!sourceName && (
          <Text numberOfLines={1} style={styles.transcriptSource}>
            {sourceName}
          </Text>
        )}
      </View>
      {isLoading ? <ActivityIndicator color={colors.pressRed} /> : null}
      {!isLoading && !hasTranscript ? (
        <Text style={styles.transcriptEmpty}>{t('foryou.noTranscript')}</Text>
      ) : null}
      {!isLoading && isError ? (
        <Text style={styles.transcriptEmpty}>
          {t('foryou.transcriptUnavailable')}
        </Text>
      ) : null}
      {!isLoading && !isError && excerpt ? (
        <Text style={styles.transcriptExcerpt}>{excerpt}</Text>
      ) : null}
    </View>
  );
}

function createTranscriptExcerpt(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 520) {
    return normalized;
  }
  return `${normalized.slice(0, 520).trimEnd()}…`;
}

function ForYouOverflowSheet({
  onClose,
  onHide,
  onReport,
  visible,
}: {
  onClose: () => void;
  onHide: () => void;
  onReport: () => void;
  visible: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overflowRoot}>
        <Pressable
          accessibilityLabel={t('foryou.closeOverflow')}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.overflowScrim}
        />
        <View style={styles.overflowSheet}>
          <View style={styles.overflowHeader}>
            <Text style={styles.overflowTitle}>{t('foryou.moreActions')}</Text>
            <Pressable
              accessibilityLabel={t('foryou.closeOverflow')}
              accessibilityRole="button"
              onPress={onClose}
              style={styles.overflowClose}
            >
              <X color={colors.ink} size={20} />
            </Pressable>
          </View>
          <Pressable
            accessibilityHint={t('foryou.hideItemDescription')}
            accessibilityRole="button"
            onPress={onHide}
            style={({ pressed }) => [
              styles.hideAction,
              pressed && styles.overflowPressed,
            ]}
          >
            <EyeOff color={colors.pressRedDark} size={21} />
            <View style={styles.hideActionCopy}>
              <Text style={styles.hideActionTitle}>{t('foryou.hideItem')}</Text>
              <Text style={styles.hideActionDescription}>
                {t('foryou.hideItemDescription')}
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onReport}
            style={({ pressed }) => [
              styles.hideAction,
              pressed && styles.overflowPressed,
            ]}
          >
            <Info color={colors.pressRed} size={20} />
            <View style={styles.hideActionCopy}>
              <Text style={styles.hideActionTitle}>
                {t('moderation.report')}
              </Text>
              <Text style={styles.hideActionDescription}>
                {t('moderation.reportCopy')}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ForYouLoading() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.loadingScreen}>
      <ActivityIndicator color={colors.pressRed} />
      <Text style={styles.loadingText}>{t('foryou.loading')}</Text>
    </SafeAreaView>
  );
}

function ForYouFailure({
  offline,
  onRetry,
}: {
  offline: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.loadingScreen}>
      <WifiOff color={colors.pressRed} size={31} />
      <Text style={styles.failureTitle}>
        {offline ? t('foryou.coldOfflineTitle') : t('foryou.unavailable')}
      </Text>
      <Text style={styles.failureText}>
        {offline
          ? t('foryou.coldOfflineCopy')
          : t('foryou.unavailableDescription')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          offline ? t('foryou.checkConnection') : t('foryou.retry')
        }
        onPress={onRetry}
        style={styles.retryButton}
      >
        <RotateCcw color={colors.inkInverse} size={18} />
        <Text style={styles.retryText}>
          {offline ? t('foryou.checkConnection') : t('foryou.retry')}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

function ForYouEmpty() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.loadingScreen}>
      <Text style={styles.failureTitle}>{t('foryou.caughtUp')}</Text>
      <Text style={styles.failureText}>{t('foryou.caughtUpDescription')}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000' },
  feedPager: { flex: 1 },
  page: { backgroundColor: '#000', overflow: 'hidden' },
  card: { ...StyleSheet.absoluteFill, flex: 1, overflow: 'hidden' },
  audioFallback: {
    backgroundColor: colors.ink,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.42)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  transcriptSurface: {
    alignItems: 'center',
    bottom: 220,
    justifyContent: 'center',
    left: spacing.lg,
    overflow: 'hidden',
    position: 'absolute',
    right: 74,
    top: 112,
  },
  transcriptHalo: {
    backgroundColor: 'rgba(230,57,70,0.24)',
    borderRadius: radii.round,
    height: 280,
    opacity: 0.78,
    position: 'absolute',
    top: -70,
    width: 280,
  },
  transcriptEyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    left: 0,
    position: 'absolute',
    right: 0,
    top: spacing.sm,
  },
  transcriptEyebrow: {
    backgroundColor: colors.pressRed,
    borderRadius: radii.round,
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    letterSpacing: 1.1,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  transcriptSource: {
    color: 'rgba(248,245,242,0.78)',
    flex: 1,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
  },
  transcriptExcerpt: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.editorial,
    fontSize: 24,
    lineHeight: 35,
    textAlign: 'center',
  },
  transcriptEmpty: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  overflowRoot: { flex: 1, justifyContent: 'flex-end' },
  overflowScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.56)',
  },
  overflowSheet: {
    backgroundColor: colors.paper,
    borderColor: colors.ink,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  overflowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overflowTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 23,
  },
  overflowClose: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  hideAction: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
    minHeight: 68,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  hideActionCopy: { flex: 1 },
  hideActionTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
  },
  hideActionDescription: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  overflowPressed: { backgroundColor: colors.card },
  playbackPulse: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderColor: 'rgba(248,245,242,0.82)',
    borderRadius: radii.round,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -38,
    marginTop: -38,
    position: 'absolute',
    top: '50%',
    width: 76,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  accountButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(26,26,26,0.35)',
    borderColor: 'rgba(248,245,242,0.75)',
    borderRadius: radii.round,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  displayRail: {
    gap: spacing.sm,
    position: 'absolute',
    right: spacing.md,
    top: 78,
  },
  railButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderColor: 'rgba(248,245,242,0.54)',
    borderRadius: radii.round,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  railButtonActive: {
    backgroundColor: colors.pressRed,
    borderColor: colors.pressRed,
  },
  feedLabel: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    letterSpacing: 1.3,
  },
  newContentLabel: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    letterSpacing: 0.8,
    marginLeft: 'auto',
  },
  sessionLabel: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
  },
  offlineBanner: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderColor: colors.inkInverse,
    borderRadius: radii.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    marginLeft: spacing.lg,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  offlineBannerText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
  },
  footer: { marginTop: 'auto', padding: spacing.lg },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  metaText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  title: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.editorial,
    fontSize: 29,
    lineHeight: 35,
    marginTop: spacing.sm,
  },
  source: {
    color: '#e9e3de',
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  progressTrack: {
    backgroundColor: 'rgba(248,245,242,0.34)',
    borderRadius: radii.round,
    height: 4,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.pressRed,
    borderRadius: radii.round,
    height: '100%',
  },
  playbackFailure: {
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  playbackRetry: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
  },
  playbackRetryText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
  },
  errorText: {
    color: colors.pressRedDark,
    fontFamily: fontFamilies.bodyBold,
    marginTop: spacing.md,
  },
  upNextText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  actionRail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    minWidth: 44,
  },
  actionButtonActive: {
    backgroundColor: colors.pressRed,
    borderRadius: radii.round,
  },
  actionCount: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderColor: colors.inkInverse,
    borderRadius: radii.round,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  speedButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderColor: colors.inkInverse,
    borderRadius: radii.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    height: 44,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: spacing.xs,
  },
  speedText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderColor: colors.inkInverse,
    borderRadius: radii.round,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  disabledButton: { opacity: 0.34 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.96 }] },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyMedium,
    marginTop: spacing.md,
  },
  failureTitle: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontSize: 30,
    textAlign: 'center',
  },
  failureText: {
    color: colors.inkMuted,
    fontFamily: fontFamilies.body,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderRadius: radii.compact,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  retryText: { color: colors.inkInverse, fontFamily: fontFamilies.bodyBold },
});
