import { Image } from 'expo-image';
import { VideoView } from 'expo-video';
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Radio,
  RotateCcw,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useTranslation } from 'react-i18next';

import { captureException } from '@/core/diagnostics/diagnostics';
import { updateForYouSessionPosition } from '@/features/feed-session/for-you-session-repository';
import { useForYouSession } from '@/features/feed-session/use-for-you-session';
import { usePlaybackController } from '@/features/playback/playback-provider';
import type { PlaybackItem } from '@/features/playback/playback-model';

import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

function formatDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ForYouSliceScreen() {
  const { t } = useTranslation();
  const db = useSQLiteContext();
  const { identityQuery, sessionQuery } = useForYouSession();
  const playback = usePlaybackController();
  const [selection, setSelection] = useState<{
    sessionId: string;
    position: number;
  } | null>(null);
  const session = sessionQuery.data;
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
            title: item.title,
            ...(item.source_name ? { sourceName: item.source_name } : {}),
            ...(item.thumbnail_url ? { artworkUrl: item.thumbnail_url } : {}),
            playback: item.playback,
          }
        : null,
    [item],
  );
  const isCurrent = playback.item?.id === item?.id;
  const isVideoVisible = isCurrent && playback.kind === 'video';

  async function selectPosition(nextPosition: number) {
    if (!session || nextPosition < 0 || nextPosition >= session.items.length) {
      return;
    }

    playback.pause();
    setSelection({ sessionId: session.id, position: nextPosition });
    try {
      await updateForYouSessionPosition(db, session.id, nextPosition, 0);
    } catch (error) {
      captureException('feed_session_position_write_failed', error);
    }
  }

  function togglePlayback() {
    if (!activePlaybackItem) {
      return;
    }

    if (isCurrent && playback.phase === 'playing') {
      playback.pause();
      return;
    }

    if (isCurrent) {
      playback.play();
      return;
    }

    void playback.start(activePlaybackItem, {
      positionSeconds: (active?.playbackPositionMs ?? 0) / 1_000,
      autoplay: true,
    });
  }

  if (identityQuery.isPending || sessionQuery.isPending) {
    return <ForYouLoading />;
  }

  if (identityQuery.isError || sessionQuery.isError) {
    return <ForYouFailure onRetry={() => void sessionQuery.refetch()} />;
  }

  if (!session || !item) {
    return <ForYouEmpty />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.card}>
        {isVideoVisible ? (
          <VideoView
            player={playback.videoPlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        ) : item.thumbnail_url ? (
          <Image
            source={item.thumbnail_url}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={styles.audioFallback} />
        )}

        <View style={styles.overlay} />
        <View style={styles.header}>
          <Text style={styles.feedLabel}>{t('foryou.feedLabel')}</Text>
          <Text style={styles.sessionLabel}>
            {position + 1} / {session.items.length}
          </Text>
        </View>

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

          {playback.error && isCurrent ? (
            <Text style={styles.errorText}>{t('foryou.playbackError')}</Text>
          ) : null}

          <View style={styles.controls}>
            <Pressable
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
              disabled={position >= session.items.length - 1}
              onPress={() => void selectPosition(position + 1)}
              style={({ pressed }) => [
                styles.secondaryButton,
                position >= session.items.length - 1 && styles.disabledButton,
                pressed && styles.pressed,
              ]}
            >
              <ChevronRight color={colors.inkInverse} size={22} />
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
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

function ForYouFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.loadingScreen}>
      <Text style={styles.failureTitle}>{t('foryou.unavailable')}</Text>
      <Text style={styles.failureText}>
        {t('foryou.unavailableDescription')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('foryou.retry')}
        onPress={onRetry}
        style={styles.retryButton}
      >
        <RotateCcw color={colors.inkInverse} size={18} />
        <Text style={styles.retryText}>{t('foryou.retry')}</Text>
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
  card: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  feedLabel: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    letterSpacing: 1.3,
  },
  sessionLabel: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.mono,
    fontSize: 12,
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
  errorText: {
    color: colors.pressRedDark,
    fontFamily: fontFamilies.bodyBold,
    marginTop: spacing.md,
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
