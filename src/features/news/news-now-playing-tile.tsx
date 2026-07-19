import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  Clock3,
  Newspaper,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { hapticLightImpact, hapticSelection } from '@/core/haptics/feedback';
import { colors, fontFamilies, radii, spacing } from '@/design/tokens';
import { playbackRates } from '@/features/playback/playback-model';
import { usePlaybackController } from '@/features/playback/playback-provider';

const ringSize = 52;
const ringRadius = 22;
const ringLength = 2 * Math.PI * ringRadius;

/** The News-only player affordance deliberately replaces the create square. */
export function NewsNowPlayingTile() {
  const { t } = useTranslation();
  const playback = usePlaybackController();
  const [expanded, setExpanded] = useState(false);
  const active = playback.item;
  const progress =
    playback.durationSeconds > 0
      ? Math.max(
          0,
          Math.min(1, playback.currentTimeSeconds / playback.durationSeconds),
        )
      : 0;
  const isPlaying = playback.phase === 'playing';
  const toggle = () => {
    if (isPlaying) {
      playback.pause();
    } else {
      playback.play();
    }
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

  return (
    <>
      <Pressable
        accessibilityHint={t('news.nowPlayingHint')}
        accessibilityLabel={
          active
            ? `${active.title}. ${isPlaying ? t('foryou.pause') : t('foryou.play')}`
            : t('news.idlePlayer')
        }
        accessibilityRole="button"
        delayLongPress={400}
        onLongPress={() => {
          if (active) {
            hapticLightImpact();
            setExpanded(true);
          }
        }}
        onPress={active ? toggle : undefined}
        style={styles.tile}
      >
        {active?.artworkUrl ? (
          <Image
            contentFit="cover"
            source={active.artworkUrl}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.idleFace}>
            <Clock3 color={colors.pressRed} size={20} />
            <Newspaper color={colors.ink} size={16} />
          </View>
        )}
        {active ? (
          <View pointerEvents="none" style={styles.ring}>
            <Svg height={ringSize} width={ringSize}>
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                stroke="rgba(248,245,242,0.72)"
                strokeWidth={3}
                fill="rgba(26,26,26,0.26)"
              />
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                stroke={colors.pressRed}
                strokeDasharray={`${ringLength} ${ringLength}`}
                strokeDashoffset={ringLength * (1 - progress)}
                strokeLinecap="square"
                strokeWidth={3}
                fill="transparent"
                rotation="-90"
                origin={`${ringSize / 2}, ${ringSize / 2}`}
              />
            </Svg>
            {isPlaying ? (
              <Pause
                color={colors.inkInverse}
                fill={colors.inkInverse}
                size={16}
              />
            ) : (
              <Play
                color={colors.inkInverse}
                fill={colors.inkInverse}
                size={16}
              />
            )}
          </View>
        ) : null}
      </Pressable>
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
                style={styles.close}
              >
                <X color={colors.ink} size={20} />
              </Pressable>
            </View>
            <View style={styles.controls}>
              <Pressable
                accessibilityLabel={t('nowPlaying.back15')}
                accessibilityRole="button"
                onPress={() => void playback.seekBy(-15)}
                style={styles.secondary}
              >
                <SkipBack color={colors.ink} size={24} />
              </Pressable>
              <Pressable
                accessibilityLabel={
                  isPlaying ? t('foryou.pause') : t('foryou.play')
                }
                accessibilityRole="button"
                onPress={toggle}
                style={styles.primary}
              >
                {isPlaying ? (
                  <Pause
                    color={colors.inkInverse}
                    fill={colors.inkInverse}
                    size={27}
                  />
                ) : (
                  <Play
                    color={colors.inkInverse}
                    fill={colors.inkInverse}
                    size={27}
                  />
                )}
              </Pressable>
              <Pressable
                accessibilityLabel={t('nowPlaying.forward15')}
                accessibilityRole="button"
                onPress={() => void playback.seekBy(15)}
                style={styles.secondary}
              >
                <SkipForward color={colors.ink} size={24} />
              </Pressable>
            </View>
            <Pressable
              accessibilityLabel={t('foryou.changeSpeed', {
                rate: playback.rate,
              })}
              accessibilityRole="button"
              onPress={cycleRate}
              style={styles.rate}
            >
              <Text style={styles.rateText}>{playback.rate}×</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  idleFace: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  ring: {
    alignItems: 'center',
    height: ringSize,
    justifyContent: 'center',
    position: 'absolute',
    width: ringSize,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(26,26,26,0.48)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopColor: colors.ink,
    borderTopWidth: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: fontFamilies.editorial,
    fontSize: 24,
    lineHeight: 30,
  },
  close: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  secondary: {
    alignItems: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  primary: {
    alignItems: 'center',
    backgroundColor: colors.pressRed,
    borderRadius: radii.compact,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  rate: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: colors.ink,
    borderRadius: radii.compact,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.lg,
    minHeight: 44,
    minWidth: 72,
  },
  rateText: { color: colors.ink, fontFamily: fontFamilies.mono, fontSize: 14 },
});
