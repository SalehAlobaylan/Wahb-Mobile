import { describe, expect, it } from '@jest/globals';

import { selectDeliveryRendition } from './delivery-selector';

const source = {
  url: 'https://cdn.example.test/high.m3u8',
  type: 'hls' as const,
  hasVideo: true,
  deliveryClass: 'visual_dependent' as const,
  renditions: [
    {
      schema_version: 3,
      id: 'audio',
      role: 'native_audio',
      type: 'audio' as const,
      url: 'https://cdn.example.test/audio.m4a',
      quality_tier: 'standard' as const,
      has_video: false,
      mime_type: 'audio/mp4',
      container: 'm4a',
      codec: 'aac',
      bitrate_kbps: 128,
    },
    {
      schema_version: 3,
      id: 'audio-low',
      role: 'native_audio',
      type: 'audio' as const,
      url: 'https://cdn.example.test/audio-low.m4a',
      quality_tier: 'data_saver' as const,
      has_video: false,
      mime_type: 'audio/mp4',
      container: 'm4a',
      codec: 'aac',
      bitrate_kbps: 64,
    },
    {
      schema_version: 3,
      id: 'audio-high',
      role: 'native_audio',
      type: 'audio' as const,
      url: 'https://cdn.example.test/audio-high.m4a',
      quality_tier: 'high' as const,
      has_video: false,
      mime_type: 'audio/mp4',
      container: 'm4a',
      codec: 'aac',
      bitrate_kbps: 192,
    },
    {
      schema_version: 3,
      id: 'low',
      role: 'progressive_fallback',
      type: 'mp4' as const,
      url: 'https://cdn.example.test/360.mp4',
      quality_tier: 'data_saver' as const,
      has_video: true,
    },
    {
      schema_version: 3,
      id: 'standard',
      role: 'hls_access_master',
      type: 'hls' as const,
      url: 'https://cdn.example.test/standard.m3u8',
      quality_tier: 'standard' as const,
      has_video: true,
    },
    {
      schema_version: 3,
      id: 'high',
      role: 'hls_master',
      type: 'hls' as const,
      url: 'https://cdn.example.test/high.m3u8',
      quality_tier: 'high' as const,
      has_video: true,
    },
  ],
};

describe('selectDeliveryRendition', () => {
  it('never exceeds the effective network cap', () => {
    const result = selectDeliveryRendition({
      source,
      displayMode: 'fit',
      streamingQuality: 'high',
      audioQuality: 'standard',
      preferAudioWhenAvailable: false,
      allowCellularHighQuality: false,
      network: 'cellular',
    });
    expect(result.effectiveTier).toBe('standard');
    expect(result.rendition?.id).toBe('standard');
  });

  it('uses verified native audio in transcript mode', () => {
    const result = selectDeliveryRendition({
      source,
      displayMode: 'transcript',
      streamingQuality: 'high',
      audioQuality: 'standard',
      preferAudioWhenAvailable: false,
      allowCellularHighQuality: true,
      network: 'wifi',
    });
    expect(result.rendition?.id).toBe('audio');
  });

  it('uses data-saver progressive for visual-dependent playback', () => {
    const result = selectDeliveryRendition({
      source,
      displayMode: 'fit',
      streamingQuality: 'data_saver',
      audioQuality: 'standard',
      preferAudioWhenAvailable: false,
      allowCellularHighQuality: false,
      network: 'wifi',
    });
    expect(result.rendition?.id).toBe('low');
  });

  it('honors the independent native-audio ceiling and falls downward', () => {
    const high = selectDeliveryRendition({
      source,
      displayMode: 'transcript',
      streamingQuality: 'high',
      audioQuality: 'high',
      preferAudioWhenAvailable: true,
      allowCellularHighQuality: true,
      network: 'wifi',
    });
    expect(high.rendition?.id).toBe('audio-high');

    const saver = selectDeliveryRendition({
      source,
      displayMode: 'transcript',
      streamingQuality: 'high',
      audioQuality: 'data_saver',
      preferAudioWhenAvailable: true,
      allowCellularHighQuality: true,
      network: 'wifi',
    });
    expect(saver.rendition?.id).toBe('audio-low');

    const withoutHigh = {
      ...source,
      renditions: source.renditions.filter((item) => item.id !== 'audio-high'),
    };
    const downward = selectDeliveryRendition({
      source: withoutHigh,
      displayMode: 'transcript',
      streamingQuality: 'high',
      audioQuality: 'high',
      preferAudioWhenAvailable: true,
      allowCellularHighQuality: true,
      network: 'wifi',
    });
    expect(downward.rendition?.id).toBe('audio');
  });
});
