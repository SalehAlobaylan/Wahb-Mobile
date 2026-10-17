import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';
import type { PlaybackItem } from './playback-model';
import { useLockScreenPlayback } from './use-lock-screen-playback';

describe('native Now Playing ownership', () => {
  it('waits for loading, restores controls on lock, and transfers ownership to video', async () => {
    let listener: ((state: string) => void) | undefined;
    const remove = jest.fn();
    const subscription = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, handler) => {
        listener = handler as (state: string) => void;
        return { remove };
      });
    const audio = {
      setActiveForLockScreen: jest.fn(),
      clearLockScreenControls: jest.fn(),
    };
    const video = { showNowPlayingNotification: true };
    const base = {
      audio,
      video: { current: video },
      item: {
        id: 'pod',
        title: 'Podcast',
        sourceName: 'Publisher',
      } as PlaybackItem,
      kind: 'audio' as 'audio' | 'video',
      ready: false,
      playing: false,
    };
    const view = await renderHook(
      (props: typeof base) => useLockScreenPlayback(props),
      { initialProps: base },
    );
    expect(audio.setActiveForLockScreen).not.toHaveBeenCalled();
    await view.rerender({ ...base, ready: true, playing: true });
    expect(video.showNowPlayingNotification).toBe(false);
    expect(audio.setActiveForLockScreen).toHaveBeenLastCalledWith(true, {
      title: 'Podcast',
      artist: 'Publisher',
    });
    audio.setActiveForLockScreen.mockClear();
    await act(async () => {
      listener?.('background');
    });
    expect(audio.setActiveForLockScreen).toHaveBeenCalledTimes(1);
    await view.rerender({ ...base, ready: true, playing: true, kind: 'video' });
    expect(audio.clearLockScreenControls).toHaveBeenCalledTimes(1);
    expect(video.showNowPlayingNotification).toBe(true);
    await view.unmount();
    expect(remove).toHaveBeenCalled();
    subscription.mockRestore();
  });
});
