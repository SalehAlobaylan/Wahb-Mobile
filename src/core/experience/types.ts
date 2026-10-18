// Real User Experience (RUX) — shared client contract.
//
// Foreground iOS/Android use schema v3, sharing the fixed journey catalog and
// terminal outcome rules with Web v2. Native adds platform and coarse OS major.
// CMS binds these events to short-lived telemetry admission, independent of
// login, installation, durable outbox or business API credentials.
//
// Privacy doctrine (see plan §6): this contract carries NO article/transcript
// text, comments, credentials, tokens, exact location, full request URLs, raw
// error messages/stacks, DOM, or user IDs. Only allowlisted operational
// dimensions and bounded numeric measurements.

export const RUX_SCHEMA_VERSION = 3 as const;

// ── Surfaces ────────────────────────────────────────────────────────────────
export const RUX_SURFACES = ['pods', 'news'] as const;
export type RuxSurface = (typeof RUX_SURFACES)[number];

// ── Event catalog (V1, fixed — no arbitrary custom events) ───────────────────
export const RUX_EVENT_TYPES = [
  // session / feed reachability
  'journey_terminal',
  'session_started',
  'feed_requested',
  'feed_rendered',
  'feed_failed',
  'feed_empty',
  'pagination_requested',
  'pagination_received',
  'pagination_starved',
  // playback (Pods + global audio)
  'playback_attempted',
  'playback_started',
  'playback_waiting',
  'playback_resumed',
  'playback_failed',
  'playback_backgrounded', // background terminal: measurement ineligible
  'playback_fallback',
  // handoff (foreground route continuity of the existing player)
  'handoff_started',
  'handoff_completed',
  'handoff_failed',
  // news reader
  'article_opened',
  'article_ready',
  'article_failed',
  // client stability
  'client_failure',
] as const;
export type RuxEventType = (typeof RUX_EVENT_TYPES)[number];

// Terminal events carry a journey outcome; start/attempt/waiting/resumed events
// are diagnostic evidence only (see plan §8 terminal-outcome rollup model). The
// rollup layer never divides two event types across a window.
export const RUX_TERMINAL_EVENT_TYPES: readonly RuxEventType[] = [
  'feed_rendered',
  'feed_failed',
  'feed_empty',
  'pagination_received',
  'pagination_starved',
  'playback_started',
  'playback_failed',
  'playback_backgrounded',
  'handoff_completed',
  'handoff_failed',
  'article_ready',
  'article_failed',
];

// ── Playback types ───────────────────────────────────────────────────────────
export const RUX_PLAYBACK_TYPES = ['hls', 'mp4', 'audio', 'unknown'] as const;
export type RuxPlaybackType = (typeof RUX_PLAYBACK_TYPES)[number];

// ── Failure classes (on playback_failed / feed_failed / handoff_failed) ──────
// `autoplay_blocked` is EXPECTED browser behavior before a user gesture — it is
// tracked as its own rate and excluded from fatal-failure SLIs (plan §8).
export const RUX_FAILURE_CLASSES = [
  'media_error',
  'network',
  'autoplay_blocked',
  'timeout',
  'decode',
  'not_supported',
  'parse',
  'empty',
  'unknown',
] as const;
export type RuxFailureClass = (typeof RUX_FAILURE_CLASSES)[number];

// ── Client cohort dimensions (fixed, low cardinality) ────────────────────────
export const RUX_BROWSER_FAMILIES = [
  'safari',
  'chrome',
  'firefox',
  'edge',
  'samsung',
  'other',
] as const;
export type RuxBrowserFamily = (typeof RUX_BROWSER_FAMILIES)[number];

export const RUX_DEVICE_CLASSES = ['mobile', 'tablet', 'desktop'] as const;
export type RuxDeviceClass = (typeof RUX_DEVICE_CLASSES)[number];

// navigator.connection is unsupported on Safari/iOS — expect mostly 'unknown'
// for a mobile-heavy Arabic audience. Never ratify a network-class SLO.
export const RUX_NETWORK_CLASSES = [
  'slow-2g',
  '2g',
  '3g',
  '4g',
  'unknown',
] as const;
export type RuxNetworkClass = (typeof RUX_NETWORK_CLASSES)[number];

export interface RuxClientContext {
  platform: 'ios' | 'android';
  os_major: number;
  browser_family: RuxBrowserFamily;
  browser_major: number; // 0..999
  device_class: RuxDeviceClass;
  network_class: RuxNetworkClass;
  installed_pwa: boolean;
}

// ── Measurements (bounded; server enforces ranges) ───────────────────────────
export const RUX_PHASES = [
  'feed',
  'pagination',
  'startup',
  'continuation',
  'fallback',
  'handoff',
  'reader',
] as const;
export type RuxPhase = (typeof RUX_PHASES)[number];
export const RUX_OUTCOMES = [
  'success',
  'empty',
  'failed',
  'timeout',
  'autoplay_blocked',
  'backgrounded',
  'cancelled',
  'end_of_feed',
] as const;
export type RuxOutcome = (typeof RUX_OUTCOMES)[number];
export interface RuxMeasurements {
  // Eligible foreground observation interval INCLUDING stalls, bounded segments.
  observed_playback_ms?: number;
  stall_count?: number;
  position_drift_ms?: number;
  fallback_used?: boolean;
  boundary_starved?: boolean;
  // Client-measured monotonic duration (performance.now delta). Latency SLIs use
  // ONLY this — the server never subtracts wall-clock timestamps across events.
  duration_ms?: number | null;
  // Native HTMLMediaElement.error.code (1..4) when a media error occurred.
  media_error_code?: number | null;
  // Accumulated stall time for a rebuffer measurement.
  stall_duration_ms?: number | null;
  // Terminal failure classification (see RUX_FAILURE_CLASSES).
  failure_class?: RuxFailureClass | null;
  // Whether the measurement was taken while the tab was visible. Measurements
  // taken while hidden are discarded / journeys closed as backgrounded.
  visible?: boolean | null;
}

// ── Event envelope ───────────────────────────────────────────────────────────
export interface RuxEvent {
  event_id: string; // uuid — globally unique, makes retries idempotent
  schema_version: typeof RUX_SCHEMA_VERSION;
  event_type: RuxEventType;
  phase?: RuxPhase;
  outcome?: RuxOutcome;
  occurred_at: string; // ISO-8601 client clock — ordering evidence, not authority
  session_id: string; // per-tab wahb_session_id (sessionStorage)
  page_load_id: string; // uuid minted at collector init — resets per page load
  sequence: number; // monotonic within (session_id, page_load_id)
  release: string; // build/commit id, stable for one deployment
  surface: RuxSurface;
  journey_id?: string | null; // uuid grouping one journey attempt
  content_id?: string | null; // optional uuid — failure top-N only, never rolled up
  feed_session_id?: string | null; // CMS frozen-session UUID for exact Pods evidence
  story_id?: string | null;
  playback_type?: RuxPlaybackType | null;
  locale?: string | null;
  client: RuxClientContext;
  measurements?: RuxMeasurements | null;
}

export interface RuxEventBatch {
  runtime_id?: string;
  schema_version: typeof RUX_SCHEMA_VERSION;
  events: RuxEvent[];
}

export interface RuxIngestResult {
  accepted: number;
  duplicate: number;
  rejected: number;
}
