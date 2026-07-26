import Slider from '@react-native-community/slider';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AlertTriangle,
  Lock,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Share2,
  Sparkles,
  X,
  Zap,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect } from 'react-native-svg';

import {
  DraggableBottomSheet,
  type DraggableBottomSheetHandle,
} from '@/components/feed/draggable-bottom-sheet';
import { newsCollapsedSheetBaseHeight } from '@/components/feed/draggable-bottom-sheet-model';
import type { NewsFeedResponse } from '@/core/api';
import { captureException } from '@/core/diagnostics/diagnostics';
import {
  hapticLightImpact,
  hapticSelection,
  hapticWarning,
} from '@/core/haptics/feedback';
import { componentMetrics, radii, spacing, typeScale } from '@/design/tokens';
import { useWahbTheme } from '@/design/theme';
import { fontForText, useWahbTypography } from '@/design/typography';
import { playbackRates } from '@/features/playback/playback-model';
import { usePlaybackController } from '@/features/playback/playback-provider';

import {
  formatPlaybackTime,
  newsIdleFaces,
  newsTilePressIntent,
  nextIdleFaceIndex,
  normalizedPlaybackProgress,
} from './news-now-playing-model';

type NewsSlide = NewsFeedResponse['slides'][number];
export type NewsStory = NewsSlide['featured'];
type PlayerTab = 'upnext' | 'tts';

const tileSize = componentMetrics.nowPlayingTile;
const tileRadius = 18;
const progressInset = 2;
const progressSide = tileSize - progressInset * 2;
const progressPerimeter =
  2 * (progressSide * 2 - 4 * tileRadius) + 2 * Math.PI * tileRadius;

export function NewsNowPlayingTile({
  breaking,
  onOpenBreaking,
  onOpenSheet,
}: {
  breaking?: NewsStory | null;
  onOpenBreaking?: (story: NewsStory) => void;
  onOpenSheet?: () => void;
}) {
  const { t } = useTranslation();
  const playback = usePlaybackController();
  const active = playback.item;

  if (!active) {
    return <NewsIdleTile breaking={breaking} onOpenBreaking={onOpenBreaking} />;
  }

  const isPlaying = playback.phase === 'playing';
  const isBusy = playback.phase === 'loading' || playback.isBuffering;
  const failed = playback.phase === 'failed';
  const progress = normalizedPlaybackProgress(
    playback.currentTimeSeconds,
    playback.durationSeconds,
  );
  const toggle = () => {
    const intent = newsTilePressIntent({
      hasPlayback: true,
      longPress: false,
      idleFace: 'clock',
      hasMultipleIdleFaces: false,
    });
    if (intent !== 'toggle_playback') return;
    hapticSelection();
    if (isPlaying) playback.pause();
    else playback.play();
  };

  return (
    <Pressable
      accessibilityHint={t('news.nowPlayingHint')}
      accessibilityLabel={`${active.title}. ${
        failed
          ? t('nowPlaying.failed')
          : isPlaying
            ? t('foryou.pause')
            : t('foryou.play')
      }`}
      accessibilityRole="button"
      delayLongPress={450}
      onLongPress={() => {
        const intent = newsTilePressIntent({
          hasPlayback: true,
          longPress: true,
          idleFace: 'clock',
          hasMultipleIdleFaces: false,
        });
        if (intent !== 'open_player') return;
        hapticLightImpact();
        onOpenSheet?.();
      }}
      onPress={failed ? onOpenSheet : toggle}
      style={({ pressed }) => [
        styles.tile,
        styles.activeTile,
        pressed && styles.tilePressed,
      ]}
      testID="news-now-playing-tile"
    >
      {active.artworkUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          contentFit="cover"
          source={active.artworkUrl}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={styles.artworkFallback} />
      )}
      <LinearGradient
        colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.72)']}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <SquareProgressRing failed={failed} progress={progress} />
      <View pointerEvents="none" style={styles.playDisc}>
        {isBusy ? (
          <ActivityIndicator color="#f8f5f2" size="small" />
        ) : failed ? (
          <AlertTriangle color="#f8f5f2" size={15} strokeWidth={2.4} />
        ) : isPlaying ? (
          <Pause color="#f8f5f2" fill="#f8f5f2" size={15} />
        ) : (
          <Play color="#f8f5f2" fill="#f8f5f2" size={15} />
        )}
      </View>
    </Pressable>
  );
}

function SquareProgressRing({
  failed,
  progress,
}: {
  failed: boolean;
  progress: number;
}) {
  const { theme } = useWahbTheme();
  return (
    <Svg
      height={tileSize}
      pointerEvents="none"
      style={styles.progressRing}
      viewBox={`0 0 ${tileSize} ${tileSize}`}
      width={tileSize}
    >
      <Rect
        fill="none"
        height={progressSide}
        rx={tileRadius}
        stroke="rgba(248,245,242,0.30)"
        strokeWidth={2.5}
        width={progressSide}
        x={progressInset}
        y={progressInset}
      />
      <Rect
        fill="none"
        height={progressSide}
        origin={`${tileSize / 2}, ${tileSize / 2}`}
        rotation={-90}
        rx={tileRadius}
        stroke={failed ? '#ff6b6b' : theme.accent}
        strokeDasharray={`${progressPerimeter} ${progressPerimeter}`}
        strokeDashoffset={progressPerimeter * (1 - progress)}
        strokeLinecap="round"
        strokeWidth={2.5}
        width={progressSide}
        x={progressInset}
        y={progressInset}
      />
    </Svg>
  );
}

function NewsIdleTile({
  breaking,
  onOpenBreaking,
}: {
  breaking?: NewsStory | null;
  onOpenBreaking?: (story: NewsStory) => void;
}) {
  const { i18n, t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  const [now, setNow] = useState(() => new Date());
  const faces = useMemo(() => newsIdleFaces(Boolean(breaking)), [breaking]);
  const [faceIndex, setFaceIndex] = useState(0);
  const face = faces[faceIndex % faces.length] ?? 'clock';

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (faces.length < 2) return;
    const timer = setInterval(
      () => setFaceIndex((current) => nextIdleFaceIndex(current, faces.length)),
      5_000,
    );
    return () => clearInterval(timer);
  }, [faces.length]);

  const locale = i18n.language.startsWith('ar') ? 'ar-SA' : 'en';
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    weekday: 'short',
  }).format(now);
  const accessibilityLabel =
    face === 'breaking' && breaking
      ? `${t('nowPlaying.breaking')}: ${breaking.title}`
      : `${time}، ${date}`;

  const handlePress = () => {
    const intent = newsTilePressIntent({
      hasPlayback: false,
      longPress: false,
      idleFace: face,
      hasMultipleIdleFaces: faces.length > 1,
    });
    if (intent === 'open_breaking' && breaking) {
      hapticSelection();
      onOpenBreaking?.(breaking);
    } else if (intent === 'advance_idle') {
      hapticSelection();
      setFaceIndex((current) => nextIdleFaceIndex(current, faces.length));
    }
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.accent },
        pressed && styles.tilePressed,
      ]}
      testID="news-idle-tile"
    >
      {face === 'breaking' ? (
        <View style={styles.breakingFace}>
          <View style={styles.breakingIconRow}>
            <View style={styles.breakingDot} />
            <Zap color="#f8f5f2" fill="#f8f5f2" size={14} />
          </View>
          <Text
            numberOfLines={1}
            style={[styles.breakingLabel, { fontFamily: font('bold') }]}
          >
            {t('nowPlaying.breaking')}
          </Text>
        </View>
      ) : (
        <View style={styles.clockFace}>
          <Text style={[styles.clockTime, { fontFamily: font('bold') }]}>
            {time}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.clockDate, { fontFamily: font('medium') }]}
          >
            {date}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function NewsPlaybackSheet({
  activeStory,
  concealed = false,
  openSignal = 0,
}: {
  activeStory?: NewsStory | null;
  concealed?: boolean;
  openSignal?: number;
}) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  const playback = usePlaybackController();
  const active = playback.item;
  const sheetRef = useRef<DraggableBottomSheetHandle>(null);
  const [tab, setTab] = useState<PlayerTab>('upnext');
  const [scrub, setScrub] = useState<{
    itemId: string;
    position: number;
  } | null>(null);
  const scrubPosition =
    scrub && scrub.itemId === active?.id ? scrub.position : null;
  const duration = Math.max(0, playback.durationSeconds);
  const displayPosition = Math.max(
    0,
    Math.min(
      duration || Number.MAX_SAFE_INTEGER,
      scrubPosition ?? playback.currentTimeSeconds,
    ),
  );
  const isPlaying = playback.phase === 'playing';
  const canSeek = Boolean(active && duration > 0);

  useEffect(() => {
    if (openSignal > 0) sheetRef.current?.expand();
  }, [openSignal]);

  const toggle = () => {
    hapticSelection();
    if (isPlaying) playback.pause();
    else playback.play();
  };
  const skip = (seconds: number) => {
    hapticSelection();
    void playback.seekBy(seconds);
  };
  const cycleRate = () => {
    const index = playbackRates.indexOf(
      playback.rate as (typeof playbackRates)[number],
    );
    playback.setTemporaryRate(
      playbackRates[(index + 1) % playbackRates.length] ?? playbackRates[0]!,
    );
    hapticSelection();
  };
  const share = async () => {
    const id = activeStory?.lead_id ?? active?.id;
    if (!id) return;
    try {
      await Share.share({
        message: `https://wahb.salehspace.dev/content/${id}`,
        title: activeStory?.title || active?.title || 'Wahb',
      });
      hapticSelection();
    } catch (error) {
      hapticWarning();
      captureException('news_share_failed', error);
    }
  };
  const dismiss = () => {
    playback.dismiss();
    sheetRef.current?.collapse();
    hapticLightImpact();
  };

  return (
    <DraggableBottomSheet
      collapsedHeight={newsCollapsedSheetBaseHeight}
      concealed={concealed}
      ref={sheetRef}
      expandedContent={
        <View style={styles.playerPanel}>
          <View
            style={[styles.playerHeader, isRTL && styles.logicalRowReverse]}
          >
            <View
              style={[
                styles.sheetArtwork,
                { backgroundColor: theme.muted, borderColor: theme.border },
              ]}
            >
              {active?.artworkUrl ? (
                <Image
                  accessibilityIgnoresInvertColors
                  contentFit="cover"
                  source={active.artworkUrl}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <Sparkles color={theme.mutedForeground} size={20} />
              )}
            </View>
            <View style={styles.playerHeaderCopy}>
              <Text
                numberOfLines={2}
                style={[
                  styles.sheetTitle,
                  {
                    color: theme.foreground,
                    fontFamily: fontForText(
                      active?.title || activeStory?.title,
                      'editorial',
                    ),
                    textAlign: isRTL ? 'right' : 'left',
                  },
                ]}
              >
                {active?.title || activeStory?.title || t('news.idlePlayer')}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.sheetSource,
                  {
                    color: theme.mutedForeground,
                    fontFamily: font('body'),
                    textAlign: isRTL ? 'right' : 'left',
                  },
                ]}
              >
                {active?.sourceName ||
                  activeStory?.source_name ||
                  t('nowPlaying.newsEdition')}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t('nowPlaying.dismiss')}
              accessibilityRole="button"
              disabled={!active}
              hitSlop={8}
              onPress={dismiss}
              style={({ pressed }) => [
                styles.dismiss,
                pressed && styles.controlPressed,
              ]}
            >
              <X
                color={active ? theme.foreground : theme.mutedForeground}
                size={19}
              />
            </Pressable>
          </View>

          <View style={styles.scrubber}>
            <Slider
              accessibilityLabel={t('nowPlaying.scrubber')}
              disabled={!canSeek}
              maximumTrackTintColor={theme.mutedForeground}
              maximumValue={duration || 1}
              minimumTrackTintColor={theme.accent}
              minimumValue={0}
              onSlidingComplete={(value) => {
                setScrub(null);
                void playback.seekTo(value);
                hapticSelection();
              }}
              onSlidingStart={() =>
                setScrub({
                  itemId: active?.id ?? '',
                  position: playback.currentTimeSeconds,
                })
              }
              onValueChange={(position) =>
                setScrub({ itemId: active?.id ?? '', position })
              }
              step={0.1}
              style={styles.slider}
              thumbTintColor={theme.accent}
              value={canSeek ? displayPosition : 0}
            />
            <View style={[styles.timeRow, isRTL && styles.logicalRowReverse]}>
              <Text
                style={[
                  styles.timecode,
                  { color: theme.mutedForeground, fontFamily: font('mono') },
                ]}
              >
                {formatPlaybackTime(displayPosition)}
              </Text>
              <Text
                style={[
                  styles.timecode,
                  { color: theme.mutedForeground, fontFamily: font('mono') },
                ]}
              >
                {canSeek ? formatPlaybackTime(duration) : '--:--'}
              </Text>
            </View>
          </View>

          <View style={[styles.transport, isRTL && styles.logicalRowReverse]}>
            <TransportButton
              disabled={!active}
              label={t('nowPlaying.back15')}
              onPress={() => skip(-15)}
              theme={theme}
            >
              <RotateCcw color={theme.foreground} size={20} />
              <Text
                style={[
                  styles.skipNumber,
                  { color: theme.foreground, fontFamily: font('bold') },
                ]}
              >
                15
              </Text>
            </TransportButton>
            <Pressable
              accessibilityLabel={
                isPlaying ? t('foryou.pause') : t('foryou.play')
              }
              accessibilityRole="button"
              disabled={!active || playback.phase === 'loading'}
              onPress={toggle}
              style={({ pressed }) => [
                styles.primaryControl,
                { backgroundColor: theme.accent },
                pressed && styles.controlPressed,
                (!active || playback.phase === 'loading') &&
                  styles.controlDisabled,
              ]}
            >
              {playback.phase === 'loading' || playback.isBuffering ? (
                <ActivityIndicator color={theme.inverse} />
              ) : isPlaying ? (
                <Pause color={theme.inverse} fill={theme.inverse} size={24} />
              ) : (
                <Play color={theme.inverse} fill={theme.inverse} size={24} />
              )}
            </Pressable>
            <TransportButton
              disabled={!active}
              label={t('nowPlaying.forward15')}
              onPress={() => skip(15)}
              theme={theme}
            >
              <RotateCw color={theme.foreground} size={20} />
              <Text
                style={[
                  styles.skipNumber,
                  { color: theme.foreground, fontFamily: font('bold') },
                ]}
              >
                15
              </Text>
            </TransportButton>
            <Pressable
              accessibilityLabel={t('foryou.changeSpeed', {
                rate: playback.rate,
              })}
              accessibilityRole="button"
              disabled={!active}
              onPress={cycleRate}
              style={({ pressed }) => [
                styles.rateControl,
                { borderColor: theme.border },
                pressed && styles.controlPressed,
                !active && styles.controlDisabled,
              ]}
            >
              <Text
                style={[
                  styles.rateText,
                  { color: theme.foreground, fontFamily: font('mono') },
                ]}
              >
                {playback.rate}×
              </Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.tabs,
              { borderBottomColor: theme.border },
              isRTL && styles.logicalRowReverse,
            ]}
          >
            <PlayerTabButton
              active={tab === 'upnext'}
              label={t('nowPlaying.upNextTitle')}
              onPress={() => setTab('upnext')}
            />
            <PlayerTabButton
              active={tab === 'tts'}
              icon={<Lock color={theme.mutedForeground} size={12} />}
              label={t('nowPlaying.ttsTitle')}
              onPress={() => setTab('tts')}
            />
            <Pressable
              accessibilityLabel={t('foryou.share')}
              accessibilityRole="button"
              disabled={!activeStory && !active}
              onPress={() => void share()}
              style={({ pressed }) => [
                styles.shareButton,
                pressed && styles.controlPressed,
              ]}
            >
              <Share2 color={theme.mutedForeground} size={16} />
              <Text
                style={[
                  styles.shareLabel,
                  {
                    color: theme.mutedForeground,
                    fontFamily: font('bold'),
                  },
                ]}
              >
                {t('foryou.share')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.tabContent}>
            {tab === 'upnext' ? (
              <UpNextPanel activeStory={activeStory} />
            ) : (
              <TtsLockedPanel />
            )}
          </View>
        </View>
      }
      testID="news-bottom-sheet"
    >
      <View style={styles.collapsedHandle} />
    </DraggableBottomSheet>
  );
}

function TransportButton({
  children,
  disabled,
  label,
  onPress,
  theme,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useWahbTheme>['theme'];
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.transportButton,
        { borderColor: theme.border },
        pressed && styles.controlPressed,
        disabled && styles.controlDisabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

function PlayerTabButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon?: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={() => {
        onPress();
        hapticSelection();
      }}
      style={styles.tabButton}
    >
      <View style={styles.tabLabelRow}>
        <Text
          style={[
            styles.tabLabel,
            {
              color: active ? theme.accent : theme.mutedForeground,
              fontFamily: font('bold'),
            },
          ]}
        >
          {label}
        </Text>
        {icon}
      </View>
      {active ? (
        <View
          style={[styles.tabUnderline, { backgroundColor: theme.accent }]}
        />
      ) : null}
    </Pressable>
  );
}

function UpNextPanel({ activeStory }: { activeStory?: NewsStory | null }) {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font, isRTL } = useWahbTypography();
  return (
    <View style={styles.upNextPanel}>
      {activeStory ? (
        <View
          style={[
            styles.storyContext,
            {
              backgroundColor: theme.background,
              borderColor: theme.accent,
            },
          ]}
        >
          <Text
            style={[
              styles.contextEyebrow,
              { color: theme.accent, fontFamily: font('bold') },
            ]}
          >
            {t('nowPlaying.featuredStory')}
          </Text>
          <Text
            numberOfLines={3}
            style={[
              styles.contextTitle,
              {
                color: theme.foreground,
                fontFamily: fontForText(
                  activeStory.title || activeStory.label,
                  'editorial',
                ),
                textAlign: isRTL ? 'right' : 'left',
              },
            ]}
          >
            {activeStory.title || activeStory.label}
          </Text>
          {activeStory.source_name ? (
            <Text
              numberOfLines={1}
              style={[
                styles.contextSource,
                {
                  color: theme.mutedForeground,
                  fontFamily: font('body'),
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
            >
              {activeStory.source_name}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Text
        style={[
          styles.emptyState,
          { color: theme.mutedForeground, fontFamily: font('body') },
        ]}
      >
        {t('nowPlaying.queueSoon')}
      </Text>
    </View>
  );
}

function TtsLockedPanel() {
  const { t } = useTranslation();
  const { theme } = useWahbTheme();
  const { font } = useWahbTypography();
  return (
    <View style={styles.ttsPanel}>
      <View style={[styles.ttsIcon, { backgroundColor: theme.background }]}>
        <Sparkles color={theme.accent} size={25} />
      </View>
      <Text
        style={[
          styles.ttsTitle,
          { color: theme.foreground, fontFamily: font('bold') },
        ]}
      >
        {t('nowPlaying.ttsHeading')}
      </Text>
      <Text
        style={[
          styles.ttsDescription,
          { color: theme.mutedForeground, fontFamily: font('body') },
        ]}
      >
        {t('nowPlaying.ttsDescription')}
      </Text>
      <View
        style={[
          styles.soonBadge,
          { backgroundColor: theme.background, borderColor: theme.accent },
        ]}
      >
        <Text
          style={[
            styles.soonBadgeText,
            { color: theme.accent, fontFamily: font('bold') },
          ]}
        >
          {t('nowPlaying.comingSoon')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: tileRadius,
    height: tileSize,
    justifyContent: 'center',
    overflow: 'hidden',
    width: tileSize,
    boxShadow: '0 6px 16px rgba(0,0,0,0.24)',
  },
  activeTile: { backgroundColor: '#171717' },
  tilePressed: { opacity: 0.9, transform: [{ scale: 0.96 }] },
  artworkFallback: {
    backgroundColor: '#171717',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  progressRing: { position: 'absolute' },
  playDisc: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: radii.round,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  clockFace: { alignItems: 'center', justifyContent: 'center' },
  clockTime: {
    color: '#f8f5f2',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    lineHeight: 16,
  },
  clockDate: {
    color: 'rgba(248,245,242,0.82)',
    fontSize: 8,
    lineHeight: 11,
    marginTop: 2,
    maxWidth: 48,
  },
  breakingFace: {
    alignItems: 'center',
    gap: 2,
    justifyContent: 'center',
  },
  breakingIconRow: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  breakingDot: {
    backgroundColor: '#f8f5f2',
    borderRadius: radii.round,
    height: 6,
    width: 6,
  },
  breakingLabel: {
    color: '#f8f5f2',
    fontSize: 8,
    letterSpacing: 0.6,
    lineHeight: 11,
    maxWidth: 48,
  },
  playerPanel: { flex: 1 },
  playerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  logicalRowReverse: { flexDirection: 'row-reverse' },
  sheetArtwork: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52,
  },
  playerHeaderCopy: { flex: 1, minWidth: 0 },
  sheetTitle: { ...typeScale.bodyLarge },
  sheetSource: { ...typeScale.label, marginTop: 2 },
  dismiss: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  scrubber: { marginTop: spacing.sm },
  slider: { height: 32, marginHorizontal: -5 },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -3,
  },
  timecode: { ...typeScale.micro, fontVariant: ['tabular-nums'] },
  transport: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  transportButton: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44,
  },
  skipNumber: { fontSize: 8, position: 'absolute' },
  primaryControl: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 22,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  rateControl: {
    alignItems: 'center',
    borderRadius: radii.compact,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: spacing.xs,
  },
  rateText: { ...typeScale.label, fontVariant: ['tabular-nums'] },
  controlPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  controlDisabled: { opacity: 0.4 },
  tabs: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginTop: spacing.md,
    minHeight: 38,
  },
  tabButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 88,
    paddingHorizontal: spacing.sm,
    position: 'relative',
  },
  tabLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  tabLabel: { ...typeScale.label, letterSpacing: 0.5 },
  tabUnderline: {
    bottom: -1,
    height: 2,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  shareButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginStart: 'auto',
    minHeight: 38,
    paddingHorizontal: spacing.sm,
  },
  shareLabel: { ...typeScale.micro },
  tabContent: { flex: 1, minHeight: 0, paddingTop: spacing.md },
  upNextPanel: { gap: spacing.md },
  storyContext: {
    borderRadius: radii.compact,
    borderWidth: 1,
    padding: spacing.sm,
  },
  contextEyebrow: { ...typeScale.micro, letterSpacing: 0.6 },
  contextTitle: { ...typeScale.bodyLarge, marginTop: 3 },
  contextSource: { ...typeScale.label, marginTop: spacing.xs },
  emptyState: {
    ...typeScale.body,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  ttsPanel: { alignItems: 'center', paddingTop: spacing.md },
  ttsIcon: {
    alignItems: 'center',
    borderRadius: radii.round,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  ttsTitle: { ...typeScale.bodyLarge, marginTop: spacing.sm },
  ttsDescription: {
    ...typeScale.body,
    marginTop: spacing.xs,
    maxWidth: 260,
    textAlign: 'center',
  },
  soonBadge: {
    borderRadius: radii.round,
    borderWidth: 1,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  soonBadgeText: { ...typeScale.micro, letterSpacing: 0.5 },
  collapsedHandle: { height: 2 },
});
