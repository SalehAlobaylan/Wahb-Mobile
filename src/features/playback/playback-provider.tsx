import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { useEvent } from 'expo';
import { useVideoPlayer, type VideoPlayer } from 'expo-video';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { captureException } from '@/core/diagnostics/diagnostics';

import {
  createInitialPlaybackSnapshot,
  defaultPlaybackRates,
  isSupportedPlaybackRate,
  playbackRateClassFor,
  resolvePlaybackKind,
  type PlaybackItem,
  type PlaybackRateDefaults,
  type PlaybackSnapshot,
} from './playback-model';
import {
  readPlaybackRateDefaults,
  writePlaybackRateDefault,
} from './playback-rate-preferences';
import {
  attemptsForSource,
  remotePlaybackSourceResolver,
  retryDelayMs,
} from './source-resolver';

type StartPlaybackOptions = {
  positionSeconds?: number;
  autoplay?: boolean;
};

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export type PlaybackController = PlaybackSnapshot & {
  videoPlayer: VideoPlayer;
  start(item: PlaybackItem, options?: StartPlaybackOptions): Promise<void>;
  play(): void;
  pause(): void;
  seekBy(seconds: number): Promise<void>;
  setRate(rate: number): void;
  dismiss(): void;
};

const PlaybackContext = createContext<PlaybackController | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const videoPlayer = useVideoPlayer(null, (player) => {
    player.staysActiveInBackground = true;
    player.showNowPlayingNotification = false;
    player.timeUpdateEventInterval = 0.25;
  });
  const audioPlayer = useAudioPlayer(null, { updateInterval: 250 });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const videoPlaying = useEvent(videoPlayer, 'playingChange', {
    isPlaying: videoPlayer.playing,
  });
  const videoTimeUpdate = useEvent(videoPlayer, 'timeUpdate', {
    currentTime: videoPlayer.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: videoPlayer.bufferedPosition,
  });
  const [snapshot, setSnapshot] = useState(createInitialPlaybackSnapshot);
  const [rateDefaults, setRateDefaults] =
    useState<PlaybackRateDefaults>(defaultPlaybackRates);
  const operation = useRef(0);
  const videoPlayerRef = useRef(videoPlayer);
  const audioPlayerRef = useRef(audioPlayer);
  const rateDefaultsRef = useRef(rateDefaults);

  useEffect(() => {
    rateDefaultsRef.current = rateDefaults;
  }, [rateDefaults]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  }, []);

  useEffect(() => {
    void readPlaybackRateDefaults().then((defaults) => {
      rateDefaultsRef.current = defaults;
      setRateDefaults(defaults);
    });
  }, []);

  const phase =
    snapshot.phase === 'loading' || snapshot.phase === 'failed'
      ? snapshot.phase
      : snapshot.kind === 'video'
        ? videoPlaying.isPlaying
          ? 'playing'
          : 'paused'
        : snapshot.kind === 'audio'
          ? audioStatus.playing
            ? 'playing'
            : 'paused'
          : 'idle';
  const start = useCallback(
    async (item: PlaybackItem, options: StartPlaybackOptions = {}) => {
      const request = ++operation.current;
      const kind = resolvePlaybackKind(item.playback);
      const rate = rateDefaultsRef.current[playbackRateClassFor(item)];
      const positionSeconds = options.positionSeconds ?? 0;
      const autoplay = options.autoplay ?? true;
      const video = videoPlayerRef.current;
      const audio = audioPlayerRef.current;

      // Pause both before loading a replacement. The generation check below
      // prevents a late asynchronous video load from reviving an older item.
      video.pause();
      audio.pause();
      audio.clearLockScreenControls();
      video.showNowPlayingNotification = false;
      setSnapshot({
        item,
        kind,
        phase: 'loading',
        rate,
        currentTimeSeconds: 0,
        durationSeconds: 0,
        bufferedPositionSeconds: 0,
        isBuffering: false,
        sourceStage: null,
        error: null,
      });

      for (const source of remotePlaybackSourceResolver.resolve(
        item.playback,
      )) {
        for (
          let attempt = 0;
          attempt < attemptsForSource(source);
          attempt += 1
        ) {
          try {
            if (kind === 'video') {
              await video.replaceAsync({
                uri: source.url,
                metadata: {
                  title: item.title,
                  ...(item.sourceName ? { artist: item.sourceName } : {}),
                  ...(item.artworkUrl ? { artwork: item.artworkUrl } : {}),
                },
                useCaching: false,
              });
              if (request !== operation.current) {
                return;
              }

              video.currentTime = positionSeconds;
              video.playbackRate = rate;
              video.staysActiveInBackground = true;
              video.showNowPlayingNotification = true;
              if (autoplay) {
                video.play();
              }
            } else {
              audio.replace({ uri: source.url, name: item.title });
              audio.shouldCorrectPitch = true;
              audio.setPlaybackRate(rate);
              audio.setActiveForLockScreen(true, {
                title: item.title,
                ...(item.sourceName ? { artist: item.sourceName } : {}),
                ...(item.artworkUrl ? { artworkUrl: item.artworkUrl } : {}),
              });
              await audio.seekTo(positionSeconds);
              if (request !== operation.current) {
                return;
              }

              if (autoplay) {
                audio.play();
              }
            }

            setSnapshot((current) =>
              current.item?.id === item.id
                ? {
                    ...current,
                    phase: autoplay ? 'playing' : 'paused',
                    sourceStage: source.stage,
                    error: null,
                  }
                : current,
            );
            return;
          } catch (error) {
            if (request !== operation.current) {
              return;
            }
            captureException('playback_source_attempt_failed', error, {
              stage: source.stage,
              attempt: attempt + 1,
            });
            if (attempt + 1 < attemptsForSource(source)) {
              await waitForRetry(retryDelayMs(attempt));
            }
          }
        }
      }

      if (request !== operation.current) {
        return;
      }
      setSnapshot((current) =>
        current.item?.id === item.id
          ? {
              ...current,
              phase: 'failed',
              sourceStage: null,
              error: 'source_load_failed',
            }
          : current,
      );
    },
    [],
  );

  const play = useCallback(() => {
    if (snapshot.kind === 'video') {
      videoPlayerRef.current.play();
    } else if (snapshot.kind === 'audio') {
      audioPlayerRef.current.play();
    }
  }, [snapshot.kind]);

  const pause = useCallback(() => {
    if (snapshot.kind === 'video') {
      videoPlayerRef.current.pause();
    } else if (snapshot.kind === 'audio') {
      audioPlayerRef.current.pause();
    }
  }, [snapshot.kind]);

  const seekBy = useCallback(
    async (seconds: number) => {
      if (snapshot.kind === 'video') {
        videoPlayerRef.current.seekBy(seconds);
      } else if (snapshot.kind === 'audio') {
        await audioPlayerRef.current.seekTo(
          Math.max(0, audioStatus.currentTime + seconds),
        );
      }
    },
    [audioStatus.currentTime, snapshot.kind],
  );

  const setRate = useCallback(
    (rate: number) => {
      if (!isSupportedPlaybackRate(rate)) {
        return;
      }
      if (snapshot.kind === 'video') {
        videoPlayerRef.current.playbackRate = rate;
      } else if (snapshot.kind === 'audio') {
        audioPlayerRef.current.shouldCorrectPitch = true;
        audioPlayerRef.current.setPlaybackRate(rate);
      }
      setSnapshot((current) => ({ ...current, rate }));
      if (snapshot.item) {
        const rateClass = playbackRateClassFor(snapshot.item);
        void writePlaybackRateDefault(
          rateDefaultsRef.current,
          rateClass,
          rate,
        ).then((defaults) => {
          rateDefaultsRef.current = defaults;
          setRateDefaults(defaults);
        });
      }
    },
    [snapshot.item, snapshot.kind],
  );

  const dismiss = useCallback(() => {
    ++operation.current;
    videoPlayerRef.current.pause();
    videoPlayerRef.current.showNowPlayingNotification = false;
    audioPlayerRef.current.pause();
    audioPlayerRef.current.clearLockScreenControls();
    setSnapshot(createInitialPlaybackSnapshot());
  }, []);

  const controller = useMemo<PlaybackController>(() => {
    const playbackMetrics =
      snapshot.kind === 'video'
        ? {
            currentTimeSeconds: videoTimeUpdate.currentTime,
            durationSeconds: videoPlayer.duration,
            bufferedPositionSeconds: videoTimeUpdate.bufferedPosition,
            isBuffering: videoPlayer.status === 'loading',
          }
        : snapshot.kind === 'audio'
          ? {
              currentTimeSeconds: audioStatus.currentTime,
              durationSeconds: audioStatus.duration,
              bufferedPositionSeconds: audioStatus.currentTime,
              isBuffering: audioStatus.isBuffering,
            }
          : {
              currentTimeSeconds: 0,
              durationSeconds: 0,
              bufferedPositionSeconds: 0,
              isBuffering: false,
            };
    return {
      ...snapshot,
      phase,
      ...playbackMetrics,
      videoPlayer,
      start,
      play,
      pause,
      seekBy,
      setRate,
      dismiss,
    };
  }, [
    dismiss,
    audioStatus,
    pause,
    phase,
    play,
    seekBy,
    setRate,
    snapshot,
    start,
    videoTimeUpdate,
    videoPlayer,
  ]);

  return (
    <PlaybackContext.Provider value={controller}>
      {children}
    </PlaybackContext.Provider>
  );
}

export function usePlaybackController(): PlaybackController {
  const controller = useContext(PlaybackContext);
  if (!controller) {
    throw new Error(
      'usePlaybackController must be used inside PlaybackProvider.',
    );
  }
  return controller;
}
