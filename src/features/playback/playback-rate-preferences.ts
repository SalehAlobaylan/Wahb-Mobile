import Storage from 'expo-sqlite/kv-store';

import {
  defaultPlaybackRates,
  normalizePlaybackRateDefaults,
  type PlaybackRateClass,
  type PlaybackRateDefaults,
} from './playback-model';

const playbackRateDefaultsKey = 'playback-rate-defaults-v1';

export async function readPlaybackRateDefaults(): Promise<PlaybackRateDefaults> {
  const value = await Storage.getItem(playbackRateDefaultsKey);
  if (!value) {
    return defaultPlaybackRates;
  }
  try {
    return normalizePlaybackRateDefaults(JSON.parse(value));
  } catch {
    return defaultPlaybackRates;
  }
}

export async function writePlaybackRateDefault(
  existing: PlaybackRateDefaults,
  rateClass: PlaybackRateClass,
  rate: number,
): Promise<PlaybackRateDefaults> {
  const next = { ...existing, [rateClass]: rate };
  await Storage.setItem(playbackRateDefaultsKey, JSON.stringify(next));
  return next;
}
