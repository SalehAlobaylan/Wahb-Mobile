import { useEffect, type RefObject } from 'react';
import { AppState } from 'react-native';
import type { AudioPlayer } from 'expo-audio';
import type { VideoPlayer } from 'expo-video';
import type { PlaybackItem } from './playback-model';

type LockScreenPlayback = {
  audio: Pick<
    AudioPlayer,
    'setActiveForLockScreen' | 'clearLockScreenControls'
  >;
  video: RefObject<Pick<VideoPlayer, 'showNowPlayingNotification'>>;
  item: PlaybackItem | null;
  kind: 'audio' | 'video' | null;
  ready: boolean;
  playing: boolean;
};

/** Acquire native controls after loading, and restore them at lifecycle boundaries. */
export function useLockScreenPlayback({
  audio,
  video,
  item,
  kind,
  ready,
  playing,
}: LockScreenPlayback) {
  const title = item?.title;
  const artist = item?.sourceName;
  const artworkUrl = item?.artworkUrl;
  useEffect(() => {
    if (!ready || !title || !kind) return;
    const activate = () => {
      if (kind === 'audio') {
        // Unregistering the video owner can clear the shared iOS Now Playing
        // center. Release it before the audio owner publishes its metadata.
        // eslint-disable-next-line react-hooks/immutability -- Expo native handles expose imperative properties, not React state.
        if (video.current.showNowPlayingNotification)
          video.current.showNowPlayingNotification = false;
        audio.setActiveForLockScreen(true, {
          title,
          ...(artist ? { artist } : {}),
          ...(artworkUrl ? { artworkUrl } : {}),
        });
      } else {
        audio.clearLockScreenControls();
        video.current.showNowPlayingNotification = true;
      }
    };
    activate();
    const subscription = AppState.addEventListener('change', () => {
      if (playing) activate();
    });
    return () => subscription.remove();
  }, [audio, video, title, artist, artworkUrl, kind, ready, playing]);
}
