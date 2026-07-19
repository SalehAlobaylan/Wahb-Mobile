import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { hapticSelection } from '@/core/haptics/feedback';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';

import { playbackRates, type PlaybackItem } from './playback-model';
import { usePlaybackController } from './playback-provider';

type DismissedPlayback = {
  item: PlaybackItem;
  positionSeconds: number;
  wasPlaying: boolean;
};

function isFeedPath(pathname: string): boolean {
  return (
    pathname === '/' || pathname === '/news' || pathname.startsWith('/news/')
  );
}

export function NonFeedNowPlaying() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const playback = usePlaybackController();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<DismissedPlayback | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eligible = !isFeedPath(pathname);
  const active = eligible ? playback.item : null;

  useEffect(
    () => () => {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
      }
    },
    [],
  );

  const togglePlayback = () => {
    if (playback.phase === 'playing') {
      playback.pause();
      return;
    }
    playback.play();
  };

  const cycleRate = () => {
    const index = playbackRates.indexOf(
      playback.rate as (typeof playbackRates)[number],
    );
    const next =
      playbackRates[(index + 1) % playbackRates.length] ?? playbackRates[0]!;
    playback.setRate(next);
    hapticSelection();
  };

  const dismiss = () => {
    if (!playback.item) {
      return;
    }
    const nextDismissed = {
      item: playback.item,
      positionSeconds: playback.currentTimeSeconds,
      wasPlaying: playback.phase === 'playing',
    } satisfies DismissedPlayback;
    playback.dismiss();
    setExpanded(false);
    setDismissed(nextDismissed);
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
    }
    undoTimer.current = setTimeout(() => setDismissed(null), 5_000);
  };

  const undoDismiss = () => {
    if (!dismissed) {
      return;
    }
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    const previous = dismissed;
    setDismissed(null);
    void playback.start(previous.item, {
      autoplay: previous.wasPlaying,
      positionSeconds: previous.positionSeconds,
    });
  };

  if (!eligible || (!active && !dismissed)) {
    return null;
  }

  const progress =
    playback.durationSeconds > 0
      ? Math.min(
          1,
          Math.max(0, playback.currentTimeSeconds / playback.durationSeconds),
        )
      : 0;

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {active ? (
        <Pressable
          accessibilityLabel={t('nowPlaying.open')}
          accessibilityRole="button"
          onPress={() => setExpanded(true)}
          style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
        >
          <View style={styles.barCopy}>
            <Text numberOfLines={1} style={styles.title}>
              {active.title}
            </Text>
            {!!active.sourceName && (
              <Text numberOfLines={1} style={styles.source}>
                {active.sourceName}
              </Text>
            )}
          </View>
          <Pressable
            accessibilityLabel={
              playback.phase === 'playing'
                ? t('foryou.pause')
                : t('foryou.play')
            }
            accessibilityRole="button"
            onPress={togglePlayback}
            style={styles.playButton}
          >
            {playback.phase === 'playing' ? (
              <Pause
                color={colors.inkInverse}
                fill={colors.inkInverse}
                size={20}
              />
            ) : (
              <Play
                color={colors.inkInverse}
                fill={colors.inkInverse}
                size={20}
              />
            )}
          </Pressable>
          <View style={[styles.progress, { width: `${progress * 100}%` }]} />
        </Pressable>
      ) : null}
      {dismissed ? (
        <View accessibilityLiveRegion="polite" style={styles.undoToast}>
          <Text style={styles.undoText}>{t('nowPlaying.dismissed')}</Text>
          <Pressable
            accessibilityLabel={t('nowPlaying.undo')}
            accessibilityRole="button"
            onPress={undoDismiss}
            style={styles.undoButton}
          >
            <RotateCcw color={colors.inkInverse} size={16} />
            <Text style={styles.undoButtonText}>{t('nowPlaying.undo')}</Text>
          </Pressable>
        </View>
      ) : null}
      <Modal
        animationType="slide"
        onRequestClose={() => setExpanded(false)}
        transparent
        visible={expanded && Boolean(active)}
      >
        <View style={styles.modalRoot}>
          <Pressable onPress={() => setExpanded(false)} style={styles.scrim} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text numberOfLines={2} style={styles.sheetTitle}>
                {active?.title}
              </Text>
              <Pressable
                accessibilityLabel={t('nowPlaying.close')}
                accessibilityRole="button"
                onPress={() => setExpanded(false)}
                style={styles.closeButton}
              >
                <X color={colors.ink} size={20} />
              </Pressable>
            </View>
            <View style={styles.controls}>
              <Pressable
                accessibilityLabel={t('nowPlaying.back15')}
                accessibilityRole="button"
                onPress={() => void playback.seekBy(-15)}
                style={styles.secondaryButton}
              >
                <SkipBack color={colors.ink} size={22} />
              </Pressable>
              <Pressable
                accessibilityLabel={
                  playback.phase === 'playing'
                    ? t('foryou.pause')
                    : t('foryou.play')
                }
                accessibilityRole="button"
                onPress={togglePlayback}
                style={styles.sheetPlayButton}
              >
                {playback.phase === 'playing' ? (
                  <Pause
                    color={colors.inkInverse}
                    fill={colors.inkInverse}
                    size={26}
                  />
                ) : (
                  <Play
                    color={colors.inkInverse}
                    fill={colors.inkInverse}
                    size={26}
                  />
                )}
              </Pressable>
              <Pressable
                accessibilityLabel={t('nowPlaying.forward15')}
                accessibilityRole="button"
                onPress={() => void playback.seekBy(15)}
                style={styles.secondaryButton}
              >
                <SkipForward color={colors.ink} size={22} />
              </Pressable>
            </View>
            <View style={styles.row}>
              <Pressable
                accessibilityLabel={t('foryou.changeSpeed', {
                  rate: playback.rate,
                })}
                accessibilityRole="button"
                onPress={cycleRate}
                style={styles.textButton}
              >
                <Text style={styles.textButtonLabel}>{playback.rate}×</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t('nowPlaying.dismiss')}
                accessibilityRole="button"
                onPress={dismiss}
                style={styles.textButton}
              >
                <Text style={styles.textButtonLabel}>
                  {t('nowPlaying.dismiss')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    bottom: spacing.md,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
  },
  bar: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderColor: colors.inkInverse,
    borderRadius: radii.compact,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    overflow: 'hidden',
    paddingLeft: spacing.md,
  },
  barCopy: { flex: 1, paddingRight: spacing.sm },
  title: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
  },
  source: {
    color: 'rgba(248,245,242,0.74)',
    fontFamily: fontFamilies.body,
    fontSize: 12,
    marginTop: 2,
  },
  playButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 52,
  },
  progress: {
    backgroundColor: colors.pressRed,
    bottom: 0,
    height: 3,
    left: 0,
    position: 'absolute',
  },
  undoToast: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.ink,
    borderRadius: radii.compact,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingLeft: spacing.md,
  },
  undoText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
  },
  undoButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  undoButtonText: {
    color: colors.inkInverse,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.58)' },
  sheet: {
    backgroundColor: colors.paper,
    borderColor: colors.ink,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    padding: spacing.lg,
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sheetTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.editorial,
    fontSize: 24,
    lineHeight: 30,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.round,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  sheetPlayButton: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderRadius: radii.round,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  textButton: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: spacing.md,
  },
  textButtonLabel: {
    color: colors.ink,
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
  },
  pressed: { opacity: 0.78 },
});
