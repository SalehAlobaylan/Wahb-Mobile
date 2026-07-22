import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { useEvent, useEventListener } from 'expo';
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

import {
  captureDiagnostic,
  captureException,
  elapsedMilliseconds,
} from '@/core/diagnostics/diagnostics';
import {
  defaultExperiencePreferences,
  readExperiencePreferences,
  writeExperiencePreferences,
} from '@/features/settings/experience-preferences';

import {
  createInitialPlaybackSnapshot,
  defaultPlaybackRates,
  isSupportedPlaybackRate,
  playbackRateClassFor,
  resolvePlaybackKind,
  type PlaybackItem,
  type PlaybackRateClass,
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
import { createUpNextCountdown } from './up-next-countdown';

type StartPlaybackOptions = {
  positionSeconds?: number;
  autoplay?: boolean;
  /** Internal failover continuation; callers should never infer this from URLs. */
  candidateStartIndex?: number;
};

export type UpNextRequest = {
  /** The caller must supply a frozen-session identity, never a feed cursor. */
  sessionId: string;
  currentItemId: string;
  nextItem: PlaybackItem;
  /** Returns false when the frozen session/item is no longer current. */
  onAdvance(): Promise<boolean> | boolean;
};

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export type PlaybackController = PlaybackSnapshot & {
  videoPlayer: VideoPlayer;
  autoplayEnabled: boolean;
  rateDefaults: PlaybackRateDefaults;
  upNextSeconds: number | null;
  start(item: PlaybackItem, options?: StartPlaybackOptions): Promise<void>;
  play(): void;
  pause(): void;
  seekBy(seconds: number): Promise<void>;
  /** Applies to only the current item; never mutates class defaults. */
  setTemporaryRate(rate: number): void;
  /** @deprecated Use setTemporaryRate or setDefaultRate explicitly. */
  setRate(rate: number): void;
  setDefaultRate(rateClass: PlaybackRateClass, rate: number): void;
  setAutoplayEnabled(enabled: boolean): void;
  scheduleUpNext(request: UpNextRequest): void;
  cancelUpNext(): void;
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
  const [autoplayEnabled, setAutoplayEnabledState] = useState(
    defaultExperiencePreferences.autoplayEnabled,
  );
  const operation = useRef(0);
  const videoPlayerRef = useRef(videoPlayer);
  const audioPlayerRef = useRef(audioPlayer);
  const rateDefaultsRef = useRef(rateDefaults);
  const lastDiagnosticPhase = useRef<string | null>(null);
  const startRequestedAt = useRef<number | null>(null);
  const bufferingStartedAt = useRef<number | null>(null);
  const fallbackStartedAt = useRef<number | null>(null);
  const activeSourceIndex = useRef(0);
  const handledRuntimeFailure = useRef<string | null>(null);
  const upNextCountdown = useRef(createUpNextCountdown());
  const upNextRequest = useRef<UpNextRequest | null>(null);
  const upNextKey = useRef<string | null>(null);
  const [upNextSeconds, setUpNextSeconds] = useState<number | null>(null);

  useEventListener(videoPlayer, 'playToEnd', () => {
    setSnapshot((current) =>
      current.kind === 'video' ? { ...current, didReachEnd: true } : current,
    );
  });

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
    void readExperiencePreferences().then((preferences) => {
      setAutoplayEnabledState(preferences.autoplayEnabled);
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
  const isBuffering =
    snapshot.kind === 'video'
      ? videoPlayer.status === 'loading'
      : snapshot.kind === 'audio'
        ? audioStatus.isBuffering
        : false;

  useEffect(() => {
    if (phase === lastDiagnosticPhase.current) return;
    lastDiagnosticPhase.current = phase;
    if (phase === 'playing') {
      captureDiagnostic('playback_start', {
        playback_source: snapshot.sourceStage ?? snapshot.kind ?? 'none',
      });
      if (startRequestedAt.current !== null) {
        captureDiagnostic('playback_start_latency', {
          duration_ms: elapsedMilliseconds(startRequestedAt.current),
          playback_source: snapshot.sourceStage ?? snapshot.kind ?? 'none',
        });
        startRequestedAt.current = null;
      }
    } else if (phase === 'failed') {
      captureDiagnostic('playback_fallback_exhausted', {
        playback_source: snapshot.kind ?? 'none',
      });
    }
  }, [phase, snapshot.kind, snapshot.sourceStage]);

  useEffect(() => {
    if (isBuffering) {
      if (bufferingStartedAt.current === null) {
        bufferingStartedAt.current = performance.now();
        captureDiagnostic('playback_buffering', {
          playback_source: snapshot.sourceStage ?? snapshot.kind ?? 'none',
        });
      }
      return;
    }
    if (bufferingStartedAt.current !== null) {
      captureDiagnostic('playback_buffer_duration', {
        duration_ms: elapsedMilliseconds(bufferingStartedAt.current),
        playback_source: snapshot.sourceStage ?? snapshot.kind ?? 'none',
      });
      bufferingStartedAt.current = null;
    }
  }, [isBuffering, snapshot.kind, snapshot.sourceStage]);
  const start = useCallback(
    async (item: PlaybackItem, options: StartPlaybackOptions = {}) => {
      upNextCountdown.current.cancel();
      upNextRequest.current = null;
      upNextKey.current = null;
      setUpNextSeconds(null);
      const request = ++operation.current;
      startRequestedAt.current = performance.now();
      const kind = resolvePlaybackKind(item.playback);
      const rate = rateDefaultsRef.current[playbackRateClassFor(item)];
      const positionSeconds = options.positionSeconds ?? 0;
      const autoplay = options.autoplay ?? autoplayEnabled;
      const candidateStartIndex = options.candidateStartIndex ?? 0;
      if (candidateStartIndex === 0) {
        fallbackStartedAt.current = null;
      }
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
        didReachEnd: false,
        sourceStage: null,
        error: null,
      });

      const sources = remotePlaybackSourceResolver.resolve(item.playback);
      for (
        let sourceIndex = candidateStartIndex;
        sourceIndex < sources.length;
        sourceIndex += 1
      ) {
        const source = sources[sourceIndex]!;
        if (source.stage === 'fallback' && fallbackStartedAt.current === null) {
          fallbackStartedAt.current = performance.now();
          captureDiagnostic('playback_fallback_start', {
            playback_source: source.stage,
          });
        }
        for (
          let attempt = 0;
          attempt < attemptsForSource(source);
          attempt += 1
        ) {
          try {
            const sourceKind = source.hasVideo ? 'video' : 'audio';
            if (sourceKind === 'video') {
              audio.pause();
              audio.clearLockScreenControls();
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
              video.pause();
              video.showNowPlayingNotification = false;
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
                    kind: sourceKind,
                    phase: autoplay ? 'playing' : 'paused',
                    sourceStage: source.stage,
                    error: null,
                  }
                : current,
            );
            activeSourceIndex.current = sourceIndex;
            handledRuntimeFailure.current = null;
            if (
              source.stage === 'fallback' &&
              fallbackStartedAt.current !== null
            ) {
              captureDiagnostic('playback_fallback_duration', {
                duration_ms: elapsedMilliseconds(fallbackStartedAt.current),
                playback_source: source.stage,
              });
              fallbackStartedAt.current = null;
            }
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
    [autoplayEnabled],
  );

  const play = useCallback(() => {
    upNextCountdown.current.cancel();
    upNextRequest.current = null;
    upNextKey.current = null;
    setUpNextSeconds(null);
    setSnapshot((current) => ({ ...current, didReachEnd: false }));
    if (snapshot.kind === 'video') {
      videoPlayerRef.current.play();
    } else if (snapshot.kind === 'audio') {
      audioPlayerRef.current.play();
    }
  }, [snapshot.kind]);

  const failOverFromRuntimeError = useCallback(
    (kind: 'audio' | 'video') => {
      const item = snapshot.item;
      if (!item || snapshot.kind !== kind) {
        return;
      }
      const failureKey = `${operation.current}:${activeSourceIndex.current}`;
      if (handledRuntimeFailure.current === failureKey) {
        return;
      }
      handledRuntimeFailure.current = failureKey;
      const positionSeconds =
        kind === 'video'
          ? videoPlayerRef.current.currentTime
          : audioStatus.currentTime;
      captureDiagnostic('playback_runtime_failover', {
        playback_source: snapshot.sourceStage ?? kind,
      });
      void start(item, {
        autoplay: true,
        candidateStartIndex: activeSourceIndex.current + 1,
        positionSeconds,
      });
    },
    [audioStatus.currentTime, snapshot, start],
  );

  useEventListener(videoPlayer, 'statusChange', ({ status }) => {
    if (status === 'error') {
      failOverFromRuntimeError('video');
    }
  });

  useEffect(() => {
    if (audioStatus.error) {
      failOverFromRuntimeError('audio');
    }
  }, [audioStatus.error, failOverFromRuntimeError]);

  const pause = useCallback(() => {
    upNextCountdown.current.cancel();
    upNextRequest.current = null;
    upNextKey.current = null;
    setUpNextSeconds(null);
    if (snapshot.kind === 'video') {
      videoPlayerRef.current.pause();
    } else if (snapshot.kind === 'audio') {
      audioPlayerRef.current.pause();
    }
  }, [snapshot.kind]);

  const seekBy = useCallback(
    async (seconds: number) => {
      if (seconds < 0) {
        upNextCountdown.current.cancel();
        upNextRequest.current = null;
        upNextKey.current = null;
        setUpNextSeconds(null);
      }
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

  const setTemporaryRate = useCallback(
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
    },
    [snapshot.kind],
  );

  const setRate = setTemporaryRate;

  const setDefaultRate = useCallback(
    (rateClass: PlaybackRateClass, rate: number) => {
      if (!isSupportedPlaybackRate(rate)) {
        return;
      }
      void writePlaybackRateDefault(
        rateDefaultsRef.current,
        rateClass,
        rate,
      ).then((defaults) => {
        rateDefaultsRef.current = defaults;
        setRateDefaults(defaults);
      });
      if (snapshot.item && playbackRateClassFor(snapshot.item) === rateClass) {
        setTemporaryRate(rate);
      }
    },
    [setTemporaryRate, snapshot.item],
  );

  const setAutoplayEnabled = useCallback((enabled: boolean) => {
    setAutoplayEnabledState(enabled);
    void readExperiencePreferences()
      .then((preferences) =>
        writeExperiencePreferences({
          ...preferences,
          autoplayEnabled: enabled,
        }),
      )
      .catch((error) =>
        captureException('autoplay_preference_write_failed', error),
      );
  }, []);

  const cancelUpNext = useCallback(() => {
    upNextCountdown.current.cancel();
    upNextRequest.current = null;
    upNextKey.current = null;
    setUpNextSeconds(null);
  }, []);

  const scheduleUpNext = useCallback(
    (request: UpNextRequest) => {
      const key = `${request.sessionId}:${request.currentItemId}:${request.nextItem.id}`;
      upNextRequest.current = request;
      if (upNextKey.current === key && upNextCountdown.current.isScheduled()) {
        return;
      }
      cancelUpNext();
      upNextKey.current = key;
      upNextRequest.current = request;
      upNextCountdown.current.schedule(setUpNextSeconds, () => {
        const activeRequest = upNextRequest.current;
        if (!activeRequest || upNextKey.current !== key) return;
        void Promise.resolve(activeRequest.onAdvance())
          .then((didAdvance) =>
            didAdvance
              ? start(activeRequest.nextItem, { autoplay: true })
              : undefined,
          )
          .catch((error) =>
            captureException('feed_session_position_write_failed', error),
          );
      });
    },
    [cancelUpNext, start],
  );

  const dismiss = useCallback(() => {
    cancelUpNext();
    ++operation.current;
    videoPlayerRef.current.pause();
    videoPlayerRef.current.showNowPlayingNotification = false;
    audioPlayerRef.current.pause();
    audioPlayerRef.current.clearLockScreenControls();
    setSnapshot(createInitialPlaybackSnapshot());
  }, [cancelUpNext]);

  useEffect(
    () => () => {
      upNextCountdown.current.cancel();
    },
    [],
  );

  const controller = useMemo<PlaybackController>(() => {
    const playbackMetrics =
      snapshot.kind === 'video'
        ? {
            currentTimeSeconds: videoTimeUpdate.currentTime,
            durationSeconds: videoPlayer.duration,
            bufferedPositionSeconds: videoTimeUpdate.bufferedPosition,
            isBuffering,
          }
        : snapshot.kind === 'audio'
          ? {
              currentTimeSeconds: audioStatus.currentTime,
              durationSeconds: audioStatus.duration,
              bufferedPositionSeconds: audioStatus.currentTime,
              isBuffering,
            }
          : {
              currentTimeSeconds: 0,
              durationSeconds: 0,
              bufferedPositionSeconds: 0,
              isBuffering: false,
            };
    const didReachEnd =
      snapshot.kind === 'audio'
        ? audioStatus.didJustFinish
        : snapshot.didReachEnd;
    return {
      ...snapshot,
      phase,
      ...playbackMetrics,
      didReachEnd,
      videoPlayer,
      autoplayEnabled,
      rateDefaults,
      upNextSeconds,
      start,
      play,
      pause,
      seekBy,
      setTemporaryRate,
      setRate,
      setDefaultRate,
      setAutoplayEnabled,
      scheduleUpNext,
      cancelUpNext,
      dismiss,
    };
  }, [
    dismiss,
    audioStatus,
    autoplayEnabled,
    cancelUpNext,
    pause,
    phase,
    play,
    seekBy,
    setTemporaryRate,
    setRate,
    setDefaultRate,
    setAutoplayEnabled,
    rateDefaults,
    scheduleUpNext,
    snapshot,
    start,
    upNextSeconds,
    isBuffering,
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
