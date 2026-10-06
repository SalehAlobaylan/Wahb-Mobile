import { Image } from 'expo-image';
import { ArrowUpRight, Headphones } from 'lucide-react-native';
import { memo, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { Transcript } from '@/core/api';
import { fontForText, useWahbTypography } from '@/design/typography';
import {
  activeTranscriptCueIndex,
  normalizeTranscript,
  type TranscriptCue,
} from '../pods-transcript-model';

const CueWindow = memo(function CueWindow({
  cues,
  index,
  availableHeight,
  width,
}: {
  cues: readonly TranscriptCue[];
  index: number;
  availableHeight: number;
  width: number;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const { font } = useWahbTypography();
  const [fit, setFit] = useState<{
    key: string;
    mode: 'single' | 'reader';
  } | null>(null);
  const active = cues[index];
  const fitKey = `${active?.id}:${active?.text}:${availableHeight}:${width}:${fontScale}`;
  const fitMode = fit?.key === fitKey ? fit.mode : undefined;
  const stateStyle = [styles.state, { fontFamily: font('medium') }];
  if (!active) return <Text style={stateStyle}>{t('pods.listening')}</Text>;
  if (active.text.length > 220 || fontScale >= 1.8 || fitMode === 'reader') {
    return <Text style={stateStyle}>{t('pods.readPassage')}</Text>;
  }
  const neighbors =
    fontScale <= 1.2 &&
    active.text.length < 130 &&
    availableHeight >= 260 &&
    fitMode !== 'single';
  return (
    <View
      pointerEvents="none"
      testID="pods-audio-cues"
      style={styles.cues}
      onLayout={({ nativeEvent }) => {
        if (nativeEvent.layout.height > availableHeight) {
          setFit({ key: fitKey, mode: neighbors ? 'single' : 'reader' });
        }
      }}
    >
      {(neighbors ? cues.slice(index, index + 2) : [active]).map((cue) => (
        <Text
          key={cue.id}
          testID={cue === active ? 'pods-audio-active-cue' : undefined}
          style={[
            styles.cue,
            cue !== active && styles.neighbor,
            { fontFamily: fontForText(cue.text, 'bold') },
          ]}
        >
          {cue.text}
        </Text>
      ))}
    </View>
  );
});

export function AudioTranscriptForeground({
  itemId,
  title,
  sourceName,
  artwork,
  duration,
  transcript,
  showTranscript,
  positionSeconds,
  loading,
  error,
  onRetry,
  onRead,
  bottomClearance = 205,
}: {
  itemId: string;
  title: string;
  sourceName?: string;
  artwork?: string;
  duration: number;
  transcript?: Transcript;
  showTranscript: boolean;
  positionSeconds: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onRead: () => void;
  bottomClearance?: number;
}) {
  const { t } = useTranslation();
  const { font } = useWahbTypography();
  const { height, width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [failedArtwork, setFailedArtwork] = useState<string | null>(null);
  const [readingSize, setReadingSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const compact = height < 700 || fontScale > 1.2;
  const shortLayout =
    height - insets.top - (compact ? 124 : 132) - bottomClearance < 240 ||
    fontScale >= 1.8;
  const presentation = useMemo(
    () =>
      normalizeTranscript(
        transcript?.content_item_id === itemId
          ? transcript.full_text
          : undefined,
        transcript?.content_item_id === itemId
          ? { segments: transcript.segments, words: transcript.word_timestamps }
          : undefined,
        duration,
      ),
    [duration, itemId, transcript],
  );
  const index = activeTranscriptCueIndex(presentation.cues, positionSeconds);
  return (
    <View
      pointerEvents="box-none"
      testID="pods-audio-foreground"
      style={[
        styles.surface,
        shortLayout && styles.compactSurface,
        {
          top: insets.top + (compact ? 124 : 132),
          bottom: bottomClearance,
        },
      ]}
    >
      <View style={styles.identity} pointerEvents="none">
        {fontScale < 1.8 &&
          (artwork && failedArtwork !== artwork ? (
            <Image
              source={artwork}
              onError={() => setFailedArtwork(artwork)}
              style={styles.artwork}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.artwork, styles.initials]}>
              <Headphones size={20} color="#ffffff" />
            </View>
          ))}
        <View style={styles.identityText}>
          {!!sourceName && !shortLayout && (
            <Text
              numberOfLines={1}
              style={[
                styles.source,
                { fontFamily: fontForText(sourceName, 'medium') },
              ]}
            >
              {sourceName}
            </Text>
          )}
          <Text
            accessibilityLabel={sourceName ? `${sourceName}, ${title}` : title}
            numberOfLines={compact ? 1 : 2}
            style={[styles.title, { fontFamily: fontForText(title, 'bold') }]}
          >
            {title}
          </Text>
        </View>
      </View>
      {showTranscript ? (
        <View style={styles.reading}>
          {!shortLayout && (
            <View
              testID="pods-audio-cue-area"
              style={styles.cueArea}
              onLayout={({ nativeEvent }) => setReadingSize(nativeEvent.layout)}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : error ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onRetry}
                  style={styles.readButton}
                >
                  <Text style={[styles.state, { fontFamily: font('medium') }]}>
                    {t('pods.transcriptUnavailable')}
                  </Text>
                  <Text style={[styles.link, { fontFamily: font('medium') }]}>
                    {t('pods.retry')}
                  </Text>
                </Pressable>
              ) : presentation.mode === 'timed' ? (
                <CueWindow
                  cues={presentation.cues}
                  index={index}
                  width={readingSize?.width ?? width - 100}
                  availableHeight={
                    readingSize?.height ??
                    Math.max(0, height - insets.top - bottomClearance - 350)
                  }
                />
              ) : (
                <Text style={[styles.state, { fontFamily: font('medium') }]}>
                  {t(
                    presentation.mode === 'reader'
                      ? 'pods.untimedTranscript'
                      : 'pods.listening',
                  )}
                </Text>
              )}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('pods.openTranscript')}
            onPress={onRead}
            style={styles.readButton}
            testID="pods-audio-open-transcript"
          >
            <Text style={[styles.link, { fontFamily: font('medium') }]}>
              {t('pods.openTranscript')}
            </Text>
            <ArrowUpRight size={14} color="#e9e3e0" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: 'absolute',
    start: 24,
    end: 76,
    overflow: 'hidden',
    gap: 12,
  },
  compactSurface: { gap: 4 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  identityText: { flex: 1, minWidth: 0 },
  artwork: { width: 44, height: 44, borderRadius: 22 },
  initials: {
    backgroundColor: '#ffffff18',
    borderWidth: 1,
    borderColor: '#ffffff26',
    justifyContent: 'center',
    alignItems: 'center',
  },
  source: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
    writingDirection: 'auto',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 27,
    writingDirection: 'auto',
  },
  reading: { flex: 1, minHeight: 0 },
  cueArea: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cues: { gap: 18 },
  cue: {
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 44,
    writingDirection: 'auto',
  },
  neighbor: { color: '#ded2d5', fontSize: 15, lineHeight: 24 },
  state: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 26,
    writingDirection: 'auto',
    textAlign: 'center',
  },
  link: {
    color: '#ffffff',
    fontSize: 12,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  readButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 10,
    flexShrink: 0,
  },
});
