import Slider from '@react-native-community/slider';
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useWahbTypography } from '@/design/typography';
import { playbackRates } from '@/features/playback/playback-model';

export function audioTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

/** One seek at gesture completion; the existing provider retains playback ownership. */
export function AudioPlayerControls({
  position,
  duration,
  playing,
  buffering,
  disabled,
  seekable = true,
  rate,
  onToggle,
  onSeek,
  onRate,
  onScrubChange,
}: {
  position: number;
  duration: number;
  playing: boolean;
  buffering: boolean;
  disabled: boolean;
  seekable?: boolean;
  rate: number;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onRate: (rate: number) => void;
  onScrubChange: (scrubbing: boolean) => void;
}) {
  const { t } = useTranslation();
  const { font } = useWahbTypography();
  const [scrub, setScrub] = useState<number | null>(null);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const time = Math.min(safeDuration, Math.max(0, scrub ?? position));
  const canSeek = !disabled && seekable && safeDuration > 0;
  useEffect(() => () => onScrubChange(false), [onScrubChange]);
  const seek = (seconds: number) => {
    if (canSeek && Number.isFinite(seconds))
      onSeek(Math.min(safeDuration, Math.max(0, seconds)));
  };
  return (
    <View
      testID="pods-audio-player"
      onTouchCancel={() => {
        setScrub(null);
        onScrubChange(false);
      }}
    >
      <Slider
        accessibilityLabel={t('nowPlaying.scrubber')}
        accessibilityValue={{
          min: 0,
          max: Math.round(safeDuration),
          now: Math.round(time),
          text: `${audioTime(time)} / ${audioTime(safeDuration)}`,
        }}
        testID="pods-audio-scrubber"
        disabled={!canSeek}
        minimumValue={0}
        maximumValue={safeDuration || 1}
        step={0.1}
        value={time}
        minimumTrackTintColor="#ffffff"
        maximumTrackTintColor="#ffffff45"
        thumbTintColor="#ffffff"
        style={styles.slider}
        onSlidingStart={() => {
          setScrub(position);
          onScrubChange(true);
        }}
        onValueChange={setScrub}
        onSlidingComplete={(value) => {
          setScrub(null);
          onScrubChange(false);
          seek(value);
        }}
      />
      <View style={styles.times}>
        <Text style={[styles.time, { fontFamily: font('mono') }]}>
          {audioTime(time)}
        </Text>
        <Text style={[styles.time, { fontFamily: font('mono') }]}>
          −{audioTime(safeDuration - time)}
        </Text>
      </View>
      <View style={styles.transport}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pods.changeSpeed', { rate })}
          disabled={disabled || !seekable}
          onPress={() =>
            onRate(
              playbackRates[
                (playbackRates.findIndex((value) => value === rate) + 1) %
                  playbackRates.length
              ]!,
            )
          }
          style={({ pressed }) => [styles.speed, pressed && styles.pressed]}
        >
          <Text style={[styles.speedText, { fontFamily: font('medium') }]}>
            {rate}×
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('nowPlaying.back15')}
          disabled={!canSeek}
          onPress={() => seek(position - 15)}
          style={[styles.skip, !canSeek && styles.disabled]}
        >
          <RotateCcw color="#ffffff" size={24} />
          <Text style={[styles.skipNumber, { fontFamily: font('mono') }]}>
            15
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(playing ? 'pods.pause' : 'pods.play')}
          accessibilityState={{ disabled }}
          disabled={disabled}
          testID="pods-audio-play-pause"
          onPress={onToggle}
          style={({ pressed }) => [
            styles.play,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {buffering ? (
            <ActivityIndicator color="#ffffff" />
          ) : playing ? (
            <Pause size={20} color="#ffffff" fill="#ffffff" />
          ) : (
            <Play size={20} color="#ffffff" fill="#ffffff" />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('nowPlaying.forward15')}
          disabled={!canSeek}
          onPress={() => seek(position + 15)}
          style={[styles.skip, !canSeek && styles.disabled]}
        >
          <RotateCw color="#ffffff" size={24} />
          <Text style={[styles.skipNumber, { fontFamily: font('mono') }]}>
            15
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slider: { height: 44, width: '100%' },
  times: {
    flexDirection: 'row',
    direction: 'ltr',
    justifyContent: 'space-between',
  },
  time: { color: '#e9e3e0', fontSize: 11, writingDirection: 'ltr' },
  transport: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 4,
  },
  speed: {
    minWidth: 44,
    minHeight: 44,
    marginEnd: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  speedText: { color: '#ffffff', fontSize: 12, writingDirection: 'ltr' },
  skip: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipNumber: {
    position: 'absolute',
    color: '#ffffff',
    fontSize: 9,
    paddingTop: 3,
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#ffffff26',
    backgroundColor: '#00000045',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },
});
