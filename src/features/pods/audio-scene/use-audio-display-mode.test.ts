import { expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import Storage from 'expo-sqlite/kv-store';
import { useAudioDisplayMode } from './use-audio-display-mode';

jest.mock('expo-sqlite/kv-store', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(() => Promise.resolve()),
}));

it('does not overwrite a user choice when saved preferences arrive late', async () => {
  let finish!: (value: string) => void;
  jest.mocked(Storage.getItem).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = await renderHook(useAudioDisplayMode);
  expect(result.current[0]).toBe('transcript');
  await act(async () => result.current[1]('listen'));
  await act(async () => finish('transcript'));
  expect(result.current[0]).toBe('listen');
  expect(Storage.setItem).toHaveBeenCalledWith(
    'pods-audio-display-mode-v1',
    'listen',
  );
});

it('restores the audio preference independently of video', async () => {
  jest.mocked(Storage.getItem).mockResolvedValueOnce('listen');
  const { result } = await renderHook(useAudioDisplayMode);
  await act(async () => undefined);
  expect(result.current[0]).toBe('listen');
});
