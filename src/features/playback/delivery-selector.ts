import type { PlaybackSource, TypedRendition } from '@/core/api';

export type StreamingQuality = 'auto' | 'data_saver' | 'standard' | 'high';
export type QualityTier = Exclude<StreamingQuality, 'auto'>;
export type DeliveryDisplayMode = 'fit' | 'fill' | 'transcript';
export type DeliveryNetwork =
  'wifi' | 'cellular' | 'expensive' | 'offline' | 'unknown';

export type DeliverySelectionInput = {
  source: PlaybackSource;
  displayMode: DeliveryDisplayMode;
  streamingQuality: StreamingQuality;
  audioQuality: QualityTier;
  preferAudioWhenAvailable: boolean;
  allowCellularHighQuality: boolean;
  network: DeliveryNetwork;
  lowPowerMode?: boolean;
  memoryPressure?: boolean;
};

export type DeliverySelection = {
  rendition?: TypedRendition;
  effectiveTier: QualityTier;
  reason:
    'legacy' | 'transcript_audio' | 'preferred_audio' | 'quality' | 'fallback';
};

const tierRank: Record<QualityTier, number> = {
  data_saver: 0,
  standard: 1,
  high: 2,
};

export function effectiveQualityTier(
  input: Omit<
    DeliverySelectionInput,
    'source' | 'displayMode' | 'preferAudioWhenAvailable'
  >,
): QualityTier {
  if (
    input.lowPowerMode ||
    input.memoryPressure ||
    input.streamingQuality === 'data_saver'
  )
    return 'data_saver';
  if (input.streamingQuality === 'standard') return 'standard';
  if (input.streamingQuality === 'high')
    return input.network === 'wifi' || input.allowCellularHighQuality
      ? 'high'
      : 'standard';
  return input.network === 'wifi' ? 'high' : 'standard';
}

function compatible(rendition: TypedRendition, tier: QualityTier) {
  return tierRank[rendition.quality_tier ?? 'standard'] <= tierRank[tier];
}

function first(
  candidates: TypedRendition[],
  predicate: (rendition: TypedRendition) => boolean,
) {
  return candidates.find(predicate);
}

/** Pure, cap-first selector. It never selects a rendition higher than the
 * resolved tier and keeps v1/v2 feeds playable by returning legacy undefined. */
export function selectDeliveryRendition(
  input: DeliverySelectionInput,
): DeliverySelection {
  const effectiveTier = effectiveQualityTier(input);
  const renditions = input.source.renditions ?? [];
  if (!renditions.length) return { effectiveTier, reason: 'legacy' };
  const legal = renditions.filter((rendition) =>
    compatible(rendition, effectiveTier),
  );
  const audio = legal
    .filter(
      (rendition) => rendition.type === 'audio' && rendition.has_video !== true,
    )
    .filter((rendition) => compatible(rendition, input.audioQuality))
    .sort(
      (left, right) =>
        tierRank[right.quality_tier ?? 'standard'] -
        tierRank[left.quality_tier ?? 'standard'],
    );
  if (input.displayMode === 'transcript' && audio.length)
    return { rendition: audio[0], effectiveTier, reason: 'transcript_audio' };
  if (
    effectiveTier === 'data_saver' &&
    input.source.deliveryClass !== 'visual_dependent' &&
    audio.length
  )
    return { rendition: audio[0], effectiveTier, reason: 'preferred_audio' };
  if (input.preferAudioWhenAvailable && audio.length)
    return { rendition: audio[0], effectiveTier, reason: 'preferred_audio' };
  const wanted =
    effectiveTier === 'data_saver'
      ? first(
          legal,
          (rendition) =>
            rendition.type === 'mp4' && rendition.quality_tier === 'data_saver',
        )
      : (first(
          legal,
          (rendition) =>
            rendition.type === 'hls' &&
            rendition.quality_tier === effectiveTier,
        ) ??
        first(
          legal,
          (rendition) =>
            rendition.type === 'mp4' &&
            rendition.quality_tier === effectiveTier,
        ));
  if (wanted) return { rendition: wanted, effectiveTier, reason: 'quality' };
  const fallback = [...legal].sort(
    (a, b) =>
      tierRank[b.quality_tier ?? 'standard'] -
      tierRank[a.quality_tier ?? 'standard'],
  )[0];
  return { rendition: fallback, effectiveTier, reason: 'fallback' };
}

export function playbackSourceForSelection(
  source: PlaybackSource,
  selection: DeliverySelection,
): PlaybackSource {
  if (!selection.rendition) return source;
  const alternatives = (source.renditions ?? []).filter(
    (rendition) => rendition.url !== selection.rendition!.url,
  );
  const fallback = alternatives.find(
    (rendition) => rendition.type === 'mp4' || rendition.type === 'audio',
  );
  return {
    ...source,
    url: selection.rendition.url,
    type: selection.rendition.type,
    hasVideo:
      selection.rendition.has_video ?? selection.rendition.type !== 'audio',
    ...(fallback
      ? {
          fallbackUrl: fallback.url,
          fallbackType: fallback.type,
          fallbackHasVideo: fallback.has_video ?? fallback.type !== 'audio',
        }
      : {}),
  };
}
