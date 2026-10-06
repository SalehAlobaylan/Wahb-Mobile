export type TranscriptCue = {
  id: string;
  endSeconds?: number;
  startSeconds?: number;
  text: string;
};

export type TranscriptPresentation = {
  cues: TranscriptCue[];
  mode: 'timed' | 'reader' | 'unavailable';
  text: string;
};

type TimestampRecord = Record<string, unknown>;
type RawCue = Omit<TranscriptCue, 'id'> & { isWord: boolean };

function recordsFrom(value: unknown): TimestampRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => recordsFrom(entry));
  }
  if (typeof value !== 'object' || value === null) return [];
  const record = value as TimestampRecord;
  const nested = [
    record.segments,
    record.words,
    record.timestamps,
    record.results,
  ].flatMap((entry) => recordsFrom(entry));
  return nested.length ? nested : [record];
}

function numberAt(record: TimestampRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      return value;
  }
  return undefined;
}

function timeAt(record: TimestampRecord, kind: 'start' | 'end') {
  const seconds = numberAt(
    record,
    kind === 'start'
      ? ['start', 'start_time', 'start_seconds', 'from']
      : ['end', 'end_time', 'end_seconds', 'to'],
  );
  if (seconds !== undefined) return seconds;
  const milliseconds = numberAt(
    record,
    kind === 'start' ? ['start_ms', 'startMillis'] : ['end_ms', 'endMillis'],
  );
  return milliseconds === undefined ? undefined : milliseconds / 1_000;
}

function textAt(record: TimestampRecord) {
  for (const key of ['text', 'punctuated_word', 'word', 'token']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function rawCues(timestamps: unknown): RawCue[] {
  return recordsFrom(timestamps)
    .map((record) => ({
      endSeconds: timeAt(record, 'end'),
      isWord:
        typeof record.word === 'string' ||
        typeof record.token === 'string' ||
        typeof record.punctuated_word === 'string',
      startSeconds: timeAt(record, 'start'),
      text: textAt(record),
    }))
    .filter((cue) => cue.text);
}

function groupWords(words: RawCue[]): TranscriptCue[] {
  const groups: TranscriptCue[] = [];
  let group: RawCue[] = [];
  const flush = () => {
    if (!group.length) return;
    const first = group[0]!;
    const last = group[group.length - 1]!;
    groups.push({
      id: `word-${groups.length}-${first.startSeconds ?? 'untimed'}`,
      endSeconds: last.endSeconds,
      startSeconds: first.startSeconds,
      text: group.map((word) => word.text).join(' '),
    });
    group = [];
  };

  for (const word of words) {
    const previous = group[group.length - 1];
    if (
      previous &&
      previous.endSeconds !== undefined &&
      word.startSeconds !== undefined &&
      word.startSeconds - previous.endSeconds >= 0.8
    ) {
      flush();
    }
    group.push(word);
    const firstStart = group[0]?.startSeconds;
    const elapsed =
      firstStart !== undefined && word.endSeconds !== undefined
        ? word.endSeconds - firstStart
        : 0;
    if (
      /[.!?؟؛:…]\s*$/u.test(word.text) ||
      elapsed >= 8 ||
      group.length >= 12
    ) {
      flush();
    }
  }
  flush();
  return groups;
}

/** Normalizes provider-native timestamp envelopes without inventing content. */
export function normalizeTranscript(
  fullText: string | undefined,
  timestamps: unknown,
  durationSeconds = Infinity,
): TranscriptPresentation {
  const text = fullText?.replace(/\s+/g, ' ').trim() ?? '';
  const raw = rawCues(timestamps);
  const rawSegments = raw.filter((cue) => !cue.isWord);
  const readerText =
    text ||
    (rawSegments.length ? rawSegments : raw).map((cue) => cue.text).join(' ');
  const valid = raw.filter(
    (cue) =>
      cue.startSeconds !== undefined &&
      cue.endSeconds !== undefined &&
      cue.endSeconds > cue.startSeconds &&
      cue.startSeconds < durationSeconds,
  );
  const segments = valid.filter((cue) => !cue.isWord);
  const words = valid
    .filter((cue) => cue.isWord)
    .sort((a, b) => a.startSeconds! - b.startSeconds!);
  if (valid.length) {
    const source = segments.length
      ? segments.map((cue, index) => ({
          id: `segment-${index}-${cue.startSeconds}`,
          endSeconds: cue.endSeconds,
          startSeconds: cue.startSeconds,
          text: cue.text,
        }))
      : groupWords(words);
    const cues = source
      .sort((a, b) => a.startSeconds! - b.startSeconds!)
      .filter(
        (cue, index, all) =>
          index === 0 || cue.startSeconds !== all[index - 1]!.startSeconds,
      )
      .map((cue, index, all) => ({
        ...cue,
        endSeconds: Math.min(
          cue.endSeconds!,
          all[index + 1]?.startSeconds ?? Infinity,
          durationSeconds,
        ),
      }));
    return {
      cues,
      mode: 'timed',
      text: readerText,
    };
  }

  return readerText
    ? { cues: [], mode: 'reader', text: readerText }
    : { cues: [], mode: 'unavailable', text: '' };
}

export function transcriptCues(
  fullText: string | undefined,
  timestamps: unknown,
) {
  return normalizeTranscript(fullText, timestamps).cues;
}

/** Normalized cues are ordered/nonoverlapping. Silence has no active cue. */
export function activeTranscriptCueIndex(
  cues: readonly TranscriptCue[],
  positionSeconds: number,
): number {
  if (!cues.length || !Number.isFinite(positionSeconds) || positionSeconds < 0)
    return -1;
  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if ((cues[middle]!.startSeconds ?? Infinity) <= positionSeconds)
      low = middle + 1;
    else high = middle - 1;
  }
  const cue = cues[high];
  return cue?.endSeconds !== undefined && positionSeconds < cue.endSeconds
    ? high
    : -1;
}

export function formatTranscriptTime(seconds: number | undefined) {
  if (seconds === undefined || !Number.isFinite(seconds)) return null;
  const rounded = Math.max(0, Math.floor(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
