export type TranscriptCue = {
  endSeconds?: number;
  startSeconds?: number;
  text: string;
};

type TimestampRecord = Record<string, unknown>;

function recordsFrom(value: unknown): TimestampRecord[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is TimestampRecord =>
        typeof entry === 'object' && entry !== null,
    );
  }
  if (typeof value !== 'object' || value === null) return [];
  const record = value as TimestampRecord;
  return recordsFrom(record.words ?? record.segments ?? record.timestamps);
}

function numberAt(record: TimestampRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    const number = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function textAt(record: TimestampRecord) {
  for (const key of ['text', 'word', 'token']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * CMS exposes several timestamp shapes depending on the transcription source.
 * Normalize them into short readable cue lines without inventing timestamps.
 */
export function transcriptCues(
  fullText: string | undefined,
  timestamps: unknown,
): TranscriptCue[] {
  const timed = recordsFrom(timestamps)
    .map((record) => ({
      endSeconds: numberAt(record, ['end', 'end_time', 'end_seconds']),
      startSeconds: numberAt(record, ['start', 'start_time', 'start_seconds']),
      text: textAt(record),
    }))
    .filter((entry) => entry.text);

  if (timed.length) {
    const cues: TranscriptCue[] = [];
    for (let index = 0; index < timed.length; index += 8) {
      const group = timed.slice(index, index + 8);
      cues.push({
        endSeconds: group.at(-1)?.endSeconds,
        startSeconds: group[0]?.startSeconds,
        text: group.map((entry) => entry.text).join(' '),
      });
    }
    return cues;
  }

  const normalized = fullText?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return [];
  const parts = normalized.match(/[^.!?؟]+[.!?؟]?/g) ?? [normalized];
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((text) => ({ text }));
}

export function activeTranscriptCueIndex(
  cues: readonly TranscriptCue[],
  positionSeconds: number,
): number {
  if (!cues.length) return 0;
  const timedIndex = cues.findIndex(
    (cue) =>
      cue.startSeconds !== undefined &&
      cue.endSeconds !== undefined &&
      positionSeconds >= cue.startSeconds &&
      positionSeconds <= cue.endSeconds,
  );
  if (timedIndex >= 0) return timedIndex;
  const nextTimedIndex = cues.findIndex(
    (cue) =>
      cue.startSeconds !== undefined && cue.startSeconds > positionSeconds,
  );
  return nextTimedIndex > 0 ? nextTimedIndex - 1 : 0;
}

export function formatTranscriptTime(seconds: number | undefined) {
  if (seconds === undefined || !Number.isFinite(seconds)) return null;
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
