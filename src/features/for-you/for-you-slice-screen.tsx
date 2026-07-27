import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView } from 'expo-video';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Bookmark,
  FileText,
  Heart,
  Info,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Minimize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { useTranslation } from 'react-i18next';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  captureDiagnostic,
  captureException,
  elapsedMilliseconds,
} from '@/core/diagnostics/diagnostics';
import { NetworkError } from '@/core/api';
import { hapticSuccess, hapticWarning } from '@/core/haptics/feedback';
import { useOutbox } from '@/core/outbox/outbox-provider';
import { useConnectivity } from '@/core/network/connectivity-provider';
import { useReducedMotion } from '@/core/ui/use-reduced-motion';
import { useAuth } from '@/features/auth/auth-provider';
import type { FrozenForYouSession } from '@/features/feed-session/for-you-session-repository';
import {
  recordForYouConsumption,
  recordForYouExposure,
  recordForYouProgress,
  updateForYouSessionPosition,
} from '@/features/feed-session/for-you-session-repository';
import {
  type ForYouDurationPreference,
  useForYouSession,
} from '@/features/feed-session/use-for-you-session';
import {
  classifyConsumption,
  createConsumptionState,
  observeConsumption,
  type ConsumptionState,
} from '@/features/playback/consumption-classifier';
import { usePlaybackController } from '@/features/playback/playback-provider';
import { useMediaPreparation } from '@/features/playback/use-media-preparation';
import { type PlaybackItem } from '@/features/playback/playback-model';

import {
  ForYouDetailSheet,
  type ForYouDetailSheetHandle,
} from './for-you-detail-sheet';
import { ReportSheet } from '@/features/moderation/report-sheet';
import type { ForYouIntent } from './for-you-intents';
import {
  activeTranscriptCueIndex,
  formatTranscriptTime,
  normalizeTranscript,
} from './for-you-transcript-model';
import { useTranscriptQuery } from './use-transcript-query';

import {
  colors,
  componentMetrics,
  fontFamilies,
  layoutMetrics,
  radii,
  spacing,
  typeScale,
} from '@/design/tokens';
import { ForYouFeedChrome } from '@/components/navigation/feed-chrome';
import { fontForText, useWahbTypography } from '@/design/typography';

function formatDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ForYouSliceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const db = useSQLiteContext();
  const [duration, setDuration] = useState<ForYouDurationPreference>();
  const {
    identityQuery,
    sessionQuery,
    fetchNextPage,
    hideItem,
    refreshSession,
    checkForFreshness,
  } = useForYouSession(duration);
  const playback = usePlaybackController();
  const startPlayback = playback.start;
  const autoplayEnabled = playback.autoplayEnabled;
  const {
    cancelUpNext,
    didReachEnd,
    error: playbackError,
    scheduleUpNext,
  } = playback;
  const outbox = useOutbox();
  const { reconnectSequence } = useConnectivity();
  const reducedMotion = useReducedMotion();
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasNewContent, setHasNewContent] = useState(false);
  const [displayMode, setDisplayMode] = useState<'fit' | 'fill' | 'transcript'>(
    'fit',
  );
  const detailSheetRef = useRef<ForYouDetailSheetHandle>(null);
  const [engagement, setEngagement] = useState<
    Record<string, { liked?: boolean; bookmarked?: boolean }>
  >({});
  const feedListRef =
    useRef<FlatList<FrozenForYouSession['items'][number]>>(null);
  const lastPagerSessionId = useRef<string | null>(null);
  const settledPagerPosition = useRef<number | null>(null);
  const upNextPageFetch = useRef<string | null>(null);
  const diagnosedSessionId = useRef<string | null>(null);
  const feedScreenStartedAt = useRef<number | null>(null);
  const pagerHasInteracted = useRef(false);
  const playbackPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const [isTranscriptDragging, setIsTranscriptDragging] = useState(false);
  const [swipeCardsPerSecond, setSwipeCardsPerSecond] = useState(0);
  const scrollVelocity = useRef({ offsetY: 0, timestamp: 0, reportedAt: 0 });
  const [playbackPulse, setPlaybackPulse] = useState<'play' | 'pause' | null>(
    null,
  );
  const [isOverflowVisible, setIsOverflowVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: 'content';
    id: string;
  } | null>(null);
  const { font } = useWahbTypography();
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
  const sessionPlaybackItems = useMemo<PlaybackItem[]>(
    () =>
      session?.items.map(({ item: sessionItem }) => ({
        id: sessionItem.id,
        contentType: sessionItem.type,
        title: sessionItem.title,
        ...(sessionItem.source_name
          ? { sourceName: sessionItem.source_name }
          : {}),
        ...(sessionItem.thumbnail_url
          ? { artworkUrl: sessionItem.thumbnail_url }
          : {}),
        playback: sessionItem.playback,
      })) ?? [],
    [session?.items],
  );
  useMediaPreparation({
    items: sessionPlaybackItems,
    activeIndex: position,
    swipeCardsPerSecond,
  });

  const requiresConnection =
    isOfflineSnapshot && connectionRequiredForId === item?.id;
  const isCurrent = playback.item?.id === item?.id;
  const isVideoVisible = isCurrent && playback.kind === 'video';
  const showUpNext =
    playback.upNextSeconds !== null &&
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
  const transcriptQuery = useTranscriptQuery(
    item?.transcript_id,
    displayMode === 'transcript',
  );
  const requestTranscription = useMutation({
    mutationFn: (contentId: string) =>
      clients.cms.requestTranscription(contentId),
  });

  useEffect(() => {
    requestTranscription.reset();
  }, [item?.id]); // A generation response only belongs to its original item.

  useEffect(() => {
    void Storage.getItem('foryou-display-mode-v1').then((value) => {
      if (value === 'fit' || value === 'fill' || value === 'transcript') {
        setDisplayMode(value);
      }
    });
  }, []);

  const selectDisplayMode = useCallback(
    (next: 'fit' | 'fill' | 'transcript') => {
      setDisplayMode(next);
      void Storage.setItem('foryou-display-mode-v1', next);
    },
    [],
  );

  useEffect(() => {
    feedScreenStartedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (!session || !item || diagnosedSessionId.current === session.id) {
      return;
    }
    diagnosedSessionId.current = session.id;
    // Keep first-render and session-health signals free of content/session
    // identifiers. CMS remains the only product and ranking event pipeline.
    const eventType = isOfflineSnapshot ? 'offline_snapshot' : 'stable';
    const duration_ms = elapsedMilliseconds(
      feedScreenStartedAt.current ?? performance.now(),
    );
    captureDiagnostic('foryou_first_render', {
      event_type: eventType,
      duration_ms,
    });
    captureDiagnostic('foryou_session_health', {
      event_type: eventType,
      duration_ms,
    });
  }, [isOfflineSnapshot, item, session]);

  const queueConsumption = useCallback(
    async (
      targetSessionId: string,
      targetPosition: number,
      targetIdentityScope: string,
      state: ConsumptionState,
      durationSeconds: number,
      terminal = false,
    ) => {
      const classification = classifyConsumption(state, durationSeconds);
      if (!classification) {
        return;
      }
      // A fresh item starts below the quick-skip threshold. Do not turn that
      // transient state into a negative delivery signal while the person is
      // still listening; quick/sample become final evidence when they leave.
      if (
        !terminal &&
        (classification === 'quick_skip' || classification === 'sampled')
      ) {
        return;
      }
      try {
        const recorded = await recordForYouConsumption(
          db,
          targetSessionId,
          targetPosition,
          targetIdentityScope,
          classification,
          state.accumulatedPlayedSeconds,
          state.furthestPositionSeconds,
        );
        if (recorded) {
          await outbox.flush();
        }
      } catch (error) {
        captureException('foryou_consumption_queue_failed', error);
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
    void queueConsumption(
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
    queueConsumption,
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

  const selectPosition = useCallback(
    async (nextPosition: number, options: { autoplay?: boolean } = {}) => {
      playback.cancelUpNext();
      if (
        !session ||
        nextPosition < 0 ||
        nextPosition >= session.items.length
      ) {
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
        void queueConsumption(
          session.id,
          position,
          identityScope,
          consumption.current.state,
          playback.durationSeconds || item?.duration_sec || 0,
          true,
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
    },
    [
      db,
      fetchNextPage,
      identityScope,
      item?.duration_sec,
      playback,
      position,
      queueConsumption,
      session,
    ],
  );

  const togglePlayback = useCallback(() => {
    if (!activePlaybackItem) {
      return;
    }
    if (isOfflineSnapshot) {
      // Feed metadata is preserved, but this is not an explicit download and
      // must never pretend the remote source is playable without a connection.
      setConnectionRequiredForId(activePlaybackItem.id);
      return;
    }

    if (!reducedMotion) {
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
    }

    if (isCurrent && playback.error) {
      void playback.start(activePlaybackItem, {
        positionSeconds: playback.currentTimeSeconds,
        autoplay: true,
      });
      return;
    }

    if (isCurrent && playback.phase === 'playing') {
      playback.cancelUpNext();
      playback.pause();
      return;
    }

    if (isCurrent) {
      playback.cancelUpNext();
      playback.play();
      return;
    }

    void playback.start(activePlaybackItem, {
      positionSeconds: (active?.playbackPositionMs ?? 0) / 1_000,
      autoplay: true,
    });
  }, [
    active?.playbackPositionMs,
    activePlaybackItem,
    isCurrent,
    isOfflineSnapshot,
    playback,
    reducedMotion,
  ]);

  const dispatchIntent = useCallback(
    (intent: ForYouIntent) => {
      switch (intent) {
        case 'toggle-playback':
          togglePlayback();
          return;
        case 'previous-item':
          void selectPosition(position - 1);
          return;
        case 'next-item':
          void selectPosition(position + 1);
          return;
        case 'open-comments':
          detailSheetRef.current?.open('comments');
          return;
        case 'open-about':
          detailSheetRef.current?.open('about');
          return;
        case 'open-overflow':
          setIsOverflowVisible(true);
      }
    },
    [position, selectPosition, togglePlayback],
  );

  const refreshForYouSession = useCallback(async () => {
    playback.cancelUpNext();
    playback.pause();
    setPendingAutoplay(null);
    setIsRefreshing(true);
    try {
      await refreshSession();
      setHasNewContent(false);
      hapticSuccess();
    } catch (error) {
      captureException('foryou_session_refresh_failed', error);
      hapticWarning();
    } finally {
      setIsRefreshing(false);
    }
  }, [playback, refreshSession]);

  const checkForNewContent = useCallback(async () => {
    try {
      setHasNewContent(await checkForFreshness());
    } catch (error) {
      // A freshness check is advisory. Never disturb a readable frozen session
      // if it fails or its six-hour server snapshot has expired.
      captureException('foryou_freshness_check_failed', error);
    }
  }, [checkForFreshness]);

  useEffect(() => {
    if (reconnectSequence > 0) {
      const task = setTimeout(() => void checkForNewContent(), 0);
      return () => clearTimeout(task);
    }
    return undefined;
  }, [checkForNewContent, reconnectSequence]);

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

  const hideCurrentItem = useCallback(async () => {
    if (!item) {
      return;
    }
    const shouldAutoplay = isCurrent && playback.phase === 'playing';
    try {
      const updated = await hideItem(item.id);
      await outbox.enqueue({ contentId: item.id, type: 'hide' });
      playback.dismiss();
      playback.cancelUpNext();
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
  }, [hideItem, isCurrent, item, outbox, playback]);

  const muteCurrentSource = useCallback(async () => {
    if (!item || !subject) {
      return;
    }
    try {
      await clients.cms.muteSource(item.id);
      hapticSuccess();
      await hideCurrentItem();
    } catch (error) {
      captureException('foryou_mute_source_failed', error, {
        contentId: item.id,
      });
      hapticWarning();
    }
  }, [clients.cms, hideCurrentItem, item, subject]);

  const handlePagerLayout = useCallback((event: LayoutChangeEvent) => {
    setPageHeight(event.nativeEvent.layout.height);
  }, []);

  const observePagerVelocity = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pageHeight <= 0) return;
      const timestamp = event.timeStamp;
      const offsetY = event.nativeEvent.contentOffset.y;
      const previous = scrollVelocity.current;
      if (previous.timestamp > 0 && timestamp > previous.timestamp) {
        const cardsPerSecond =
          Math.abs(offsetY - previous.offsetY) /
          pageHeight /
          ((timestamp - previous.timestamp) / 1_000);
        if (timestamp - previous.reportedAt >= 100) {
          setSwipeCardsPerSecond(Math.min(20, cardsPerSecond));
          scrollVelocity.current.reportedAt = timestamp;
        }
      }
      scrollVelocity.current.offsetY = offsetY;
      scrollVelocity.current.timestamp = timestamp;
    },
    [pageHeight],
  );

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
    void startPlayback(activePlaybackItem, {
      positionSeconds: 0,
      autoplay: autoplayEnabled,
    }).finally(() => setPendingAutoplay(null));
  }, [
    activePlaybackItem,
    autoplayEnabled,
    pendingAutoplay,
    position,
    session?.id,
    startPlayback,
  ]);

  const advanceUpNext = useCallback(
    async (
      expectedSessionId: string,
      nextPosition: number,
    ): Promise<boolean> => {
      if (
        !session ||
        session.id !== expectedSessionId ||
        nextPosition < 0 ||
        nextPosition >= session.items.length
      ) {
        return false;
      }
      if (identityScope && consumption.current) {
        void queueConsumption(
          session.id,
          position,
          identityScope,
          consumption.current.state,
          playback.durationSeconds || item?.duration_sec || 0,
          true,
        );
      }
      setSelection({ sessionId: session.id, position: nextPosition });
      setPendingAutoplay(null);
      try {
        await updateForYouSessionPosition(
          db,
          session.id,
          position,
          playback.currentTimeSeconds * 1_000,
        );
        await updateForYouSessionPosition(db, session.id, nextPosition, 0);
        return true;
      } catch (error) {
        captureException('feed_session_position_write_failed', error);
        return false;
      }
    },
    [
      db,
      identityScope,
      item?.duration_sec,
      playback.currentTimeSeconds,
      playback.durationSeconds,
      position,
      queueConsumption,
      session,
    ],
  );

  useEffect(() => {
    if (
      !session ||
      !item ||
      !isCurrent ||
      !didReachEnd ||
      playbackError ||
      (position >= session.items.length - 1 && session.cursor === null)
    ) {
      cancelUpNext();
      return;
    }
    const nextPosition = position + 1;
    const nextItem = sessionPlaybackItems[nextPosition];
    if (!nextItem) {
      const fetchKey = `${session.id}:${position}`;
      if (upNextPageFetch.current !== fetchKey) {
        upNextPageFetch.current = fetchKey;
        void fetchNextPage();
      }
      return;
    }
    upNextPageFetch.current = null;
    scheduleUpNext({
      sessionId: session.id,
      currentItemId: item.id,
      nextItem,
      onAdvance: () => advanceUpNext(session.id, nextPosition),
    });
  }, [
    advanceUpNext,
    fetchNextPage,
    isCurrent,
    item,
    cancelUpNext,
    didReachEnd,
    playbackError,
    position,
    scheduleUpNext,
    session,
    sessionPlaybackItems,
  ]);

  useEffect(
    () => () => {
      cancelUpNext();
    },
    [cancelUpNext],
  );

  useEffect(() => {
    if (!session || pageHeight <= 0) {
      return;
    }
    if (lastPagerSessionId.current !== session.id) {
      settledPagerPosition.current = null;
    }
    // A swipe has already physically settled at this item. Reissuing an
    // animated scroll here makes iOS visibly pull the page back before it
    // accepts the next gesture.
    if (settledPagerPosition.current === position) {
      return;
    }
    const animated = lastPagerSessionId.current === session.id;
    lastPagerSessionId.current = session.id;
    const timer = setTimeout(() => {
      feedListRef.current?.scrollToIndex({ index: position, animated });
      settledPagerPosition.current = position;
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
    return (
      <ForYouEmpty
        refreshing={isRefreshing}
        onRefresh={() => void refreshForYouSession()}
      />
    );
  }

  return (
    <View onLayout={handlePagerLayout} style={styles.safeArea}>
      <FlatList
        data={session.items}
        decelerationRate="fast"
        disableIntervalMomentum
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
          setSwipeCardsPerSecond(0);
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
          settledPagerPosition.current = nextPosition;
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
        onScroll={observePagerVelocity}
        scrollEventThrottle={100}
        pagingEnabled
        snapToAlignment="start"
        snapToInterval={pageHeight || undefined}
        scrollEnabled={!isTranscriptDragging}
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
            onPress={() => dispatchIntent('toggle-playback')}
            testID={index === position ? 'for-you-playback-toggle' : undefined}
            style={[styles.page, { height: pageHeight }]}
          >
            {index === position && isVideoVisible ? (
              <VideoView
                player={playback.videoPlayer}
                style={[
                  StyleSheet.absoluteFill,
                  displayMode === 'transcript' && styles.transcriptVideo,
                ]}
                contentFit={displayMode === 'fit' ? 'contain' : 'cover'}
                nativeControls={false}
              />
            ) : page.item.thumbnail_url ? (
              <Image
                source={page.item.thumbnail_url}
                style={[
                  StyleSheet.absoluteFill,
                  index === position &&
                    displayMode === 'transcript' &&
                    styles.transcriptBackgroundImage,
                ]}
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
        {displayMode === 'transcript' ? (
          <LinearGradient
            colors={[
              'rgba(98, 12, 22, 0.48)',
              'rgba(10, 10, 10, 0.76)',
              'rgba(6, 6, 6, 0.96)',
            ]}
            locations={[0, 0.48, 1]}
            pointerEvents="none"
            style={styles.transcriptBackdrop}
          />
        ) : (
          <View pointerEvents="none" style={styles.overlay} />
        )}
        <View style={styles.displayRail}>
          <Pressable
            accessibilityLabel={t('foryou.fit')}
            accessibilityRole="button"
            onPress={() => selectDisplayMode('fit')}
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
            onPress={() => selectDisplayMode('fill')}
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
            onPress={() => selectDisplayMode('transcript')}
            testID="for-you-display-transcript"
            style={({ pressed }) => [
              styles.railButton,
              displayMode === 'transcript' && styles.railButtonActive,
              pressed && styles.pressed,
            ]}
          >
            <FileText color={colors.inkInverse} size={18} />
          </Pressable>
        </View>
        <ForYouFeedChrome duration={duration} onDurationChange={setDuration} />
        <View style={styles.feedStatusRow}>
          {hasNewContent ? (
            <Pressable
              accessibilityLabel={t('foryou.newContent')}
              accessibilityRole="button"
              disabled={isRefreshing}
              onPress={() => void refreshForYouSession()}
              style={styles.newContentPill}
            >
              <Text
                style={[styles.newContentLabel, { fontFamily: font('bold') }]}
              >
                {t('foryou.newContent')}
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Text style={[styles.sessionLabel, { fontFamily: font('mono') }]}>
            {position + 1} / {session.items.length}
          </Text>
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
            canRequestTranscription={Boolean(subject)}
            generationRequested={requestTranscription.isSuccess}
            hasTranscript={Boolean(item.transcript_id)}
            isError={transcriptQuery.isError}
            isLoading={transcriptQuery.isLoading}
            isPaused={isCurrent && playback.phase !== 'playing'}
            itemId={item.id}
            isRequesting={requestTranscription.isPending}
            onRequestGeneration={() => {
              if (!subject) {
                router.push('/sign-in');
                return;
              }
              requestTranscription.mutate(item.id);
            }}
            onRetry={() => void transcriptQuery.refetch()}
            onTranscriptDragChange={setIsTranscriptDragging}
            positionSeconds={playbackPositionSeconds}
            sourceName={item.source_name}
            text={transcriptQuery.data?.full_text}
            title={item.title}
            timestamps={{
              segments: transcriptQuery.data?.segments,
              words: transcriptQuery.data?.word_timestamps,
            }}
          />
        ) : null}

        {displayMode !== 'transcript' ? (
          <View style={styles.footer}>
            <View style={styles.metaRow}>
              <Radio color={colors.pressRedDark} size={16} strokeWidth={2.2} />
              <Text style={[styles.metaText, { fontFamily: font('bold') }]}>
                {item.type}
              </Text>
              <Text style={[styles.metaText, { fontFamily: font('mono') }]}>
                {formatDuration(item.duration_sec)}
              </Text>
            </View>
            <Text
              style={[styles.title, { fontFamily: font('editorial') }]}
              numberOfLines={3}
            >
              {item.title}
            </Text>
            {!!item.source_name && (
              <Text style={[styles.source, { fontFamily: font('medium') }]}>
                {item.source_name}
              </Text>
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
                <Text style={styles.errorText}>
                  {t('foryou.connectToPlay')}
                </Text>
              </View>
            ) : playback.error && isCurrent ? (
              <View style={styles.playbackFailure}>
                <Text style={styles.errorText}>
                  {t('foryou.playbackError')}
                </Text>
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
                {t('foryou.upNext', { seconds: playback.upNextSeconds })}
              </Text>
            ) : null}

            <View style={[styles.actionRail, styles.hiddenActionRail]}>
              <Pressable
                accessibilityLabel={
                  liked ? t('foryou.unlike') : t('foryou.like')
                }
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
                onPress={() => dispatchIntent('open-comments')}
                style={({ pressed }) => [
                  styles.actionButton,
                  pressed && styles.pressed,
                ]}
              >
                <MessageCircle color={colors.inkInverse} size={22} />
                <Text style={styles.actionCount}>{item.comment_count}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t('foryou.moreActions')}
                accessibilityRole="button"
                onPress={() => dispatchIntent('open-overflow')}
                style={({ pressed }) => [
                  styles.actionButton,
                  pressed && styles.pressed,
                ]}
              >
                <MoreHorizontal color={colors.inkInverse} size={22} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
      {installationId ? (
        <ForYouDetailSheet
          ref={detailSheetRef}
          installationId={installationId}
          item={item}
          collapsedContent={
            <View style={styles.sheetActionRail}>
              <Pressable
                accessibilityLabel={
                  liked ? t('foryou.unlike') : t('foryou.like')
                }
                accessibilityRole="button"
                onPress={() => void toggleEngagement('like')}
                style={styles.sheetActionButton}
              >
                <Heart
                  color={colors.ink}
                  fill={liked ? colors.ink : 'transparent'}
                  size={21}
                />
                <Text style={styles.sheetActionText}>
                  {item.like_count + Number(liked) - Number(item.is_liked)}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t('foryou.comments')}
                accessibilityRole="button"
                onPress={() => detailSheetRef.current?.open('comments')}
                style={styles.sheetActionButton}
              >
                <MessageCircle color={colors.ink} size={21} />
                <Text style={styles.sheetActionText}>{item.comment_count}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={
                  bookmarked ? t('foryou.removeBookmark') : t('foryou.bookmark')
                }
                accessibilityRole="button"
                onPress={() => void toggleEngagement('bookmark')}
                style={styles.sheetActionButton}
              >
                <Bookmark
                  color={colors.ink}
                  fill={bookmarked ? colors.ink : 'transparent'}
                  size={21}
                />
              </Pressable>
              <Pressable
                accessibilityLabel={t('foryou.moreActions')}
                accessibilityRole="button"
                onPress={() => dispatchIntent('open-overflow')}
                style={styles.sheetActionButton}
              >
                <MoreHorizontal color={colors.ink} size={21} />
              </Pressable>
            </View>
          }
        />
      ) : null}
      <ForYouOverflowSheet
        onClose={() => setIsOverflowVisible(false)}
        onMuteSource={subject ? () => void muteCurrentSource() : undefined}
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
    </View>
  );
}

function ForYouTranscriptMode({
  canRequestTranscription,
  generationRequested,
  hasTranscript,
  isError,
  isLoading,
  isPaused,
  isRequesting,
  itemId,
  onRequestGeneration,
  onRetry,
  onTranscriptDragChange,
  positionSeconds,
  sourceName,
  text,
  title,
  timestamps,
}: {
  canRequestTranscription: boolean;
  generationRequested: boolean;
  hasTranscript: boolean;
  isError: boolean;
  isLoading: boolean;
  isPaused: boolean;
  isRequesting: boolean;
  itemId: string;
  onRequestGeneration: () => void;
  onRetry: () => void;
  onTranscriptDragChange: (dragging: boolean) => void;
  positionSeconds: number;
  sourceName?: string;
  text?: string;
  title: string;
  timestamps: unknown;
}) {
  const { t } = useTranslation();
  const { font } = useWahbTypography();
  const contentTextStyle = (value: string) => ({
    textAlign: /[\u0600-\u06FF\u0750-\u077F]/u.test(value)
      ? ('right' as const)
      : ('left' as const),
    writingDirection: /[\u0600-\u06FF\u0750-\u077F]/u.test(value)
      ? ('rtl' as const)
      : ('ltr' as const),
  });
  const insets = useSafeAreaInsets();
  const presentation = useMemo(
    () => normalizeTranscript(text, timestamps),
    [text, timestamps],
  );
  const activeIndex = activeTranscriptCueIndex(
    presentation.cues,
    positionSeconds,
  );
  const scrollRef = useRef<ScrollView>(null);
  const rowLayouts = useRef(new Map<number, { height: number; y: number }>());
  const [viewportHeight, setViewportHeight] = useState(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [followLive, setFollowLive] = useState(true);
  const previousActiveIndex = useRef<number | null>(null);

  useEffect(() => {
    rowLayouts.current.clear();
    previousActiveIndex.current = null;
    setFollowLive(true);
    onTranscriptDragChange(false);
  }, [itemId, onTranscriptDragChange]);

  useEffect(() => {
    if (
      presentation.mode !== 'timed' ||
      !followLive ||
      previousActiveIndex.current === activeIndex
    )
      return;
    const layout = rowLayouts.current.get(activeIndex);
    if (!layout || viewportHeight <= 0) return;
    previousActiveIndex.current = activeIndex;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({
        animated: true,
        y: Math.max(0, layout.y + layout.height / 2 - viewportHeight / 2),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [
    activeIndex,
    followLive,
    layoutRevision,
    presentation.mode,
    viewportHeight,
  ]);

  const manualScrollStart = () => {
    setFollowLive(false);
    onTranscriptDragChange(true);
  };
  const manualScrollEnd = () => onTranscriptDragChange(false);

  return (
    <View
      style={[
        styles.transcriptSurface,
        {
          bottom: insets.bottom + 78,
          left: layoutMetrics.pageGutter,
          right: 72,
          top: insets.top + 122,
        },
      ]}
      testID="for-you-transcript-surface"
    >
      <View style={styles.transcriptEyebrowRow}>
        <Text style={[styles.transcriptEyebrow, { fontFamily: font('bold') }]}>
          {t('foryou.liveTranscript')}
        </Text>
        {!!sourceName && (
          <Text
            numberOfLines={1}
            style={[styles.transcriptSource, { fontFamily: font('medium') }]}
          >
            {sourceName}
          </Text>
        )}
      </View>
      <Text
        numberOfLines={2}
        style={[
          styles.transcriptTitle,
          contentTextStyle(title),
          { fontFamily: fontForText(title, 'bold') },
        ]}
      >
        {title}
      </Text>
      {isPaused ? (
        <View style={styles.transcriptPaused}>
          <Pause color={colors.inkInverse} size={12} />
          <Text
            style={[
              styles.transcriptPausedText,
              { fontFamily: font('medium') },
            ]}
          >
            {t('foryou.transcriptPaused')}
          </Text>
        </View>
      ) : null}
      <View style={styles.transcriptReadingArea}>
        {isLoading ? <ActivityIndicator color={colors.pressRed} /> : null}
        {!isLoading &&
        (isError || !hasTranscript || presentation.mode === 'unavailable') ? (
          <View style={styles.transcriptState}>
            <Text
              style={[styles.transcriptEmpty, { fontFamily: font('medium') }]}
            >
              {isError
                ? t('foryou.transcriptUnavailable')
                : generationRequested
                  ? t('foryou.transcriptRequested')
                  : t('foryou.noTranscript')}
            </Text>
            {!isError && !generationRequested ? (
              <Pressable
                accessibilityRole="button"
                disabled={isRequesting}
                onPress={onRequestGeneration}
                style={styles.transcriptAction}
              >
                <Text
                  style={[
                    styles.transcriptActionText,
                    { fontFamily: font('bold') },
                  ]}
                >
                  {isRequesting
                    ? t('foryou.transcriptRequesting')
                    : canRequestTranscription
                      ? t('foryou.requestTranscript')
                      : t('account.signIn')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {!isLoading && isError ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={styles.transcriptRetry}
          >
            <Text
              style={[styles.transcriptRetryText, { fontFamily: font('bold') }]}
            >
              {t('foryou.retry')}
            </Text>
          </Pressable>
        ) : null}
        {!isLoading && !isError && presentation.mode === 'reader' ? (
          <ScrollView
            nestedScrollEnabled
            onMomentumScrollEnd={manualScrollEnd}
            onScrollBeginDrag={manualScrollStart}
            onScrollEndDrag={manualScrollEnd}
            showsVerticalScrollIndicator={false}
            style={styles.transcriptScroll}
          >
            <Text
              style={[
                styles.transcriptReaderText,
                contentTextStyle(presentation.text),
                { fontFamily: fontForText(presentation.text, 'body') },
              ]}
            >
              {presentation.text}
            </Text>
          </ScrollView>
        ) : null}
        {!isLoading && !isError && presentation.mode === 'timed' ? (
          <ScrollView
            nestedScrollEnabled
            onLayout={(event) =>
              setViewportHeight(event.nativeEvent.layout.height)
            }
            onMomentumScrollEnd={manualScrollEnd}
            onScrollBeginDrag={manualScrollStart}
            onScrollEndDrag={manualScrollEnd}
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            style={styles.transcriptScroll}
            testID="for-you-transcript-list"
          >
            <View style={styles.transcriptCueStack}>
              {presentation.cues.map((cue, index) => {
                const active = index === activeIndex;
                return (
                  <View
                    key={cue.id}
                    onLayout={(event) => {
                      rowLayouts.current.set(index, event.nativeEvent.layout);
                      setLayoutRevision((revision) => revision + 1);
                    }}
                    style={styles.transcriptCueRow}
                  >
                    <Text
                      style={[
                        active
                          ? styles.transcriptCueActive
                          : styles.transcriptCue,
                        contentTextStyle(cue.text),
                        {
                          fontFamily: fontForText(
                            cue.text,
                            active ? 'bold' : 'body',
                          ),
                        },
                      ]}
                    >
                      {cue.text}
                    </Text>
                    {active && formatTranscriptTime(cue.startSeconds) ? (
                      <Text
                        style={[
                          styles.transcriptTimecode,
                          { fontFamily: font('mono') },
                        ]}
                      >
                        {formatTranscriptTime(cue.startSeconds)}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : null}
      </View>
      {!followLive ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setFollowLive(true);
            onTranscriptDragChange(false);
          }}
          style={styles.returnToLive}
          testID="for-you-transcript-return-live"
        >
          <Text style={[styles.returnToLiveText, { fontFamily: font('bold') }]}>
            {t('foryou.returnToLive')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ForYouOverflowSheet({
  onClose,
  onHide,
  onMuteSource,
  onReport,
  visible,
}: {
  onClose: () => void;
  onHide: () => void;
  onMuteSource?: () => void;
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
          {onMuteSource ? (
            <Pressable
              accessibilityHint={t('foryou.muteSourceDescription')}
              accessibilityRole="button"
              onPress={onMuteSource}
              style={({ pressed }) => [
                styles.hideAction,
                pressed && styles.overflowPressed,
              ]}
            >
              <EyeOff color={colors.ink} size={21} />
              <View style={styles.hideActionCopy}>
                <Text style={styles.hideActionTitle}>
                  {t('foryou.muteSource')}
                </Text>
                <Text style={styles.hideActionDescription}>
                  {t('foryou.muteSourceDescription')}
                </Text>
              </View>
            </Pressable>
          ) : null}
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

function ForYouEmpty({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.loadingScreen}>
      <Text style={styles.failureTitle}>{t('foryou.caughtUp')}</Text>
      <Text style={styles.failureText}>{t('foryou.caughtUpDescription')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('foryou.refreshSession')}
        disabled={refreshing}
        onPress={onRefresh}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
      >
        <RotateCcw color={colors.inkInverse} size={18} />
        <Text style={styles.retryText}>
          {refreshing ? t('foryou.refreshing') : t('foryou.refreshSession')}
        </Text>
      </Pressable>
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
  transcriptBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  transcriptBackgroundImage: {
    ...StyleSheet.absoluteFill,
    opacity: 0.52,
    transform: [{ scale: 1.06 }],
  },
  transcriptVideo: { opacity: 0.24 },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.42)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  transcriptSurface: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(8,8,8,0.22)',
    borderColor: 'rgba(248,245,242,0.18)',
    borderRadius: radii.compact,
    borderWidth: 1,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    position: 'absolute',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  transcriptHalo: {
    backgroundColor: 'rgba(230,57,70,0.24)',
    borderRadius: radii.round,
    height: 180,
    opacity: 0.78,
    position: 'absolute',
    top: -30,
    width: 280,
  },
  transcriptEyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginBottom: spacing.lg,
  },
  transcriptEyebrow: {
    backgroundColor: colors.pressRed,
    borderRadius: radii.round,
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.label,
    letterSpacing: 1.1,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  transcriptSource: {
    color: 'rgba(248,245,242,0.78)',
    flex: 1,
    fontFamily: fontFamilies.bodyMedium,
    ...typeScale.meta,
  },
  transcriptCueStack: {
    alignItems: 'stretch',
    alignSelf: 'stretch',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
  },
  transcriptCueRow: { minHeight: 64 },
  transcriptReadingArea: { flex: 1, marginTop: spacing.md },
  transcriptScroll: { flex: 1 },
  transcriptTitle: {
    color: colors.inkInverse,
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'left',
  },
  transcriptPaused: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderColor: 'rgba(248,245,242,0.25)',
    borderRadius: radii.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  transcriptPausedText: { color: colors.inkInverse, ...typeScale.micro },
  transcriptCue: {
    color: 'rgba(248,245,242,0.46)',
    fontSize: 17,
    lineHeight: 27,
    textAlign: 'left',
  },
  transcriptCueActive: {
    color: colors.inkInverse,
    fontSize: 21,
    lineHeight: 32,
    textAlign: 'left',
  },
  transcriptEmpty: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyMedium,
    ...typeScale.bodyLarge,
    textAlign: 'center',
  },
  transcriptState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  transcriptAction: {
    backgroundColor: colors.pressRed,
    borderRadius: radii.round,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  transcriptActionText: { color: colors.inkInverse, ...typeScale.label },
  transcriptRetry: {
    alignSelf: 'center',
    borderColor: colors.inkInverse,
    borderRadius: radii.round,
    borderWidth: 1,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  transcriptRetryText: { color: colors.inkInverse, ...typeScale.label },
  transcriptReaderText: {
    color: colors.inkInverse,
    fontSize: 18,
    lineHeight: 31,
    paddingBottom: spacing.xl,
    textAlign: 'left',
  },
  returnToLive: {
    alignSelf: 'center',
    backgroundColor: colors.pressRed,
    borderRadius: radii.round,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  returnToLiveText: { color: colors.inkInverse, ...typeScale.label },
  transcriptTimecode: {
    borderColor: colors.pressRed,
    borderRadius: radii.round,
    borderWidth: 1,
    color: colors.inkInverse,
    fontFamily: fontFamilies.mono,
    ...typeScale.micro,
    marginTop: spacing.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
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
  feedStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: layoutMetrics.pageGutter,
    paddingTop: spacing.xs,
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
    end: spacing.md,
    // The web rail begins beneath the cinematic header and duration strip.
    // Keeping it out of that chrome avoids an accidental four-layer overlap.
    top: 196,
  },
  railButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderColor: 'rgba(248,245,242,0.54)',
    borderRadius: radii.round,
    borderWidth: 1,
    height: componentMetrics.displayRailControl,
    justifyContent: 'center',
    width: componentMetrics.displayRailControl,
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
    ...typeScale.label,
    letterSpacing: 0.8,
    marginLeft: 'auto',
  },
  newContentPill: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderColor: 'rgba(248,245,242,0.32)',
    borderRadius: radii.round,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  sessionLabel: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.mono,
    ...typeScale.meta,
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
    ...typeScale.label,
  },
  footer: {
    marginTop: 'auto',
    // Reserve the compact action sheet without crowding the media metadata.
    paddingBottom: 102,
    paddingHorizontal: layoutMetrics.pageGutter,
    paddingTop: spacing.lg,
  },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  metaText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
    letterSpacing: 0.8,
  },
  title: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.editorial,
    ...typeScale.heading,
    marginTop: spacing.sm,
  },
  source: {
    color: '#e9e3de',
    fontFamily: fontFamilies.bodyMedium,
    ...typeScale.meta,
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
    ...typeScale.body,
  },
  errorText: {
    color: colors.pressRedDark,
    fontFamily: fontFamilies.bodyBold,
    marginTop: spacing.md,
  },
  upNextText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    ...typeScale.meta,
    marginTop: spacing.sm,
  },
  actionRail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  hiddenActionRail: { display: 'none' },
  sheetActionRail: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: 44,
  },
  sheetActionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
  },
  sheetActionText: {
    color: colors.ink,
    fontFamily: fontFamilies.mono,
    ...typeScale.label,
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
  sheetLauncher: {
    alignItems: 'center',
    backgroundColor: 'rgba(20,20,20,0.82)',
    borderColor: 'rgba(248,245,242,0.16)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.md,
  },
  sheetHandle: {
    backgroundColor: 'rgba(248,245,242,0.4)',
    borderRadius: radii.round,
    height: 3,
    position: 'absolute',
    top: 6,
    width: 42,
  },
  sheetTab: {
    alignItems: 'center',
    gap: 3,
    minHeight: 44,
    minWidth: 72,
    justifyContent: 'center',
  },
  sheetTabText: { color: colors.inkInverse, fontSize: 11 },
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
