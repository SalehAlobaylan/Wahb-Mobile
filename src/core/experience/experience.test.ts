import { jest, beforeEach, afterEach, it, expect } from '@jest/globals';
import type { MockedFunction } from 'jest-mock';
import { createExperienceCollector, emitEvent } from './collector';
import { beginPlayback } from './journeys';
import { createPlaybackExperience } from './playback-experience';
import { setExperienceForeground } from './lifecycle';
jest.mock('./collector', () => ({
  ...jest.requireActual<typeof import('./collector')>('./collector'),
  emitEvent: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
}));
let time = 0;
const terminal = (phase: string) =>
  (emitEvent as MockedFunction<typeof emitEvent>).mock.calls
    .map((call) => call[0])
    .filter(
      (event) =>
        event.event_type === 'journey_terminal' && event.phase === phase,
    );
const firstTerminal = (phase: string) => {
  const event = terminal(phase)[0];
  if (!event) throw Error('missing terminal');
  return event;
};
beforeEach(() => {
  jest.useFakeTimers();
  time = 0;
  jest.spyOn(performance, 'now').mockImplementation(() => time);
  (emitEvent as MockedFunction<typeof emitEvent>).mockClear();
  setExperienceForeground(true);
});
afterEach(() => {
  setExperienceForeground(false);
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('playing status alone cannot settle startup; clock progress and repeated buffering are measured', () => {
  const observer = createPlaybackExperience();
  observer.attempt('content', 'audio', 0);
  observer.observe(0, true, false, false, false);
  expect(terminal('startup')).toHaveLength(0);
  time = 250;
  observer.observe(0.25, true, false, false, false);
  expect(firstTerminal('startup').outcome).toBe('success');
  time = 1000;
  observer.observe(0.25, true, true, false, false);
  observer.observe(0.25, true, true, false, false);
  time = 2500;
  observer.observe(0.5, true, false, false, false);
  time = 3000;
  observer.pause();
  expect(firstTerminal('continuation').measurements).toMatchObject({
    stall_count: 1,
    stall_duration_ms: 1500,
  });
  observer.dispose();
});
it('a hung attempt times out and backgrounding is ineligible', () => {
  const observer = createPlaybackExperience();
  observer.attempt('content', 'audio', 0);
  jest.advanceTimersByTime(10_000);
  expect(firstTerminal('startup').outcome).toBe('timeout');
  observer.dispose();
  const journey = beginPlayback({ surface: 'pods' });
  setExperienceForeground(false);
  expect(terminal('startup').at(-1)?.outcome).toBe('backgrounded');
  journey.finish();
});
it('approved native fallback retains the original user attempt', () => {
  const observer = createPlaybackExperience();
  observer.attempt('content', 'mp4', 0);
  observer.fallback('audio');
  observer.attempt('content', 'audio', 0, true);
  time = 250;
  observer.observe(0.25, true, false, false, false);
  expect(terminal('startup')).toHaveLength(1);
  expect(firstTerminal('startup').measurements?.fallback_used).toBe(true);
  expect(firstTerminal('fallback').outcome).toBe('success');
  observer.dispose();
});
it('intentional seek cannot masquerade as playable progress', () => {
  const observer = createPlaybackExperience();
  observer.attempt('content', 'audio', 0);
  observer.position(100);
  observer.observe(100, true, false, false, false);
  expect(terminal('startup')).toHaveLength(0);
  time = 250;
  observer.observe(100.25, true, false, false, false);
  expect(firstTerminal('startup').outcome).toBe('success');
  observer.dispose();
});
it('uses ticket-bound ephemeral process identity and quiet server-off delivery', async () => {
  const transport = jest
    .fn<
      (
        path: string,
        body: unknown,
        ticket?: string,
      ) => Promise<{ ticket?: string; expires_at?: number; disabled?: boolean }>
    >()
    .mockResolvedValueOnce({
      ticket: 'opaque-admission',
      expires_at: Date.now() / 1000 + 1800,
    })
    .mockResolvedValue({});
  let sequence = 0;
  const collector = createExperienceCollector({
    release: 'ios-build-1',
    locale: 'ar',
    client: {
      platform: 'ios',
      os_major: 26,
      browser_family: 'other',
      browser_major: 0,
      device_class: 'mobile',
      network_class: 'unknown',
      installed_pwa: false,
    },
    id: () => `fixture-${++sequence}`,
    transport,
  });
  collector.emit({
    event_type: 'journey_terminal',
    phase: 'feed',
    outcome: 'failed',
    surface: 'pods',
    feed_session_id: '00000000-0000-4000-8000-000000000002',
  });
  for (let step = 0; step < 20; step++) await Promise.resolve();
  const admissionCall = transport.mock.calls[0];
  const eventCall = transport.mock.calls[1];
  if (!admissionCall || !eventCall) throw Error('missing transport call');
  expect(admissionCall[0]).toBe('/experience/native/admission');
  expect(eventCall[2]).toBe('opaque-admission');
  expect((eventCall[1] as { events: unknown[] }).events[0]).toMatchObject({
    schema_version: 3,
    session_id: collector.inspect().session,
    page_load_id: collector.inspect().page,
    feed_session_id: '00000000-0000-4000-8000-000000000002',
    client: { platform: 'ios' },
  });
  collector.dispose();
  const off = createExperienceCollector({
    release: 'r2',
    locale: 'en',
    client: {
      platform: 'android',
      os_major: 16,
      browser_family: 'other',
      browser_major: 0,
      device_class: 'mobile',
      network_class: 'unknown',
      installed_pwa: false,
    },
    transport: jest
      .fn<
        (
          path: string,
          body: unknown,
          ticket?: string,
        ) => Promise<{ disabled?: boolean }>
      >()
      .mockResolvedValue({ disabled: true }),
  });
  off.emit({
    event_type: 'journey_terminal',
    surface: 'news',
    phase: 'reader',
    outcome: 'failed',
  });
  for (let step = 0; step < 20; step++) await Promise.resolve();
  expect(off.inspect().disabled).toBe(true);
  off.dispose();
});

it('clock watchdog measures an unreported stall and foreground resume excludes background time', () => {
  const observer = createPlaybackExperience();
  observer.attempt('content', 'audio', 0);
  time = 250;
  observer.observe(0.25, true, false, false, false);
  time = 2000;
  jest.advanceTimersByTime(1500);
  time = 2500;
  observer.observe(0.5, true, false, false, false);
  setExperienceForeground(false);
  expect(firstTerminal('continuation').measurements).toMatchObject({
    stall_count: 1,
    stall_duration_ms: 500,
  });
  time = 60000;
  setExperienceForeground(true);
  observer.observe(58, true, false, false, false);
  time = 60250;
  observer.observe(58.25, true, false, false, false);
  observer.pause();
  expect(
    terminal('startup').filter((event) => event.outcome === 'success'),
  ).toHaveLength(1);
  expect(terminal('continuation').at(-1)?.measurements?.stall_count).toBe(0);
  observer.dispose();
});
it('invalid build identity never makes an admission request', () => {
  const transport = jest.fn<() => Promise<{ disabled?: boolean }>>();
  const collector = createExperienceCollector({
    release: '',
    locale: 'en',
    client: {
      platform: 'ios',
      os_major: 26,
      browser_family: 'other',
      browser_major: 0,
      device_class: 'mobile',
      network_class: 'unknown',
      installed_pwa: false,
    },
    transport,
  });
  collector.emit({ event_type: 'client_failure', surface: 'pods' });
  collector.flush();
  jest.advanceTimersByTime(30000);
  expect(transport).not.toHaveBeenCalled();
  expect(collector.inspect().disabled).toBe(true);
  collector.dispose();
});

it('keeps queued terminals until the shared byte budget can deliver them', async () => {
  const deliveries: { events: { event_id: string }[] }[] = [];
  const finish: (() => void)[] = [];
  const transport = async (path: string, body: unknown) => {
    if (path.endsWith('/admission'))
      return { ticket: 'admission', expires_at: Date.now() / 1000 + 1800 };
    deliveries.push(body as { events: { event_id: string }[] });
    return await new Promise<{ disabled?: boolean }>((resolve) =>
      finish.push(() => resolve({})),
    );
  };
  let id = 0;
  const collector = createExperienceCollector({
    release: 'r'.repeat(80),
    locale: 'en',
    client: {
      platform: 'ios',
      os_major: 26,
      browser_family: 'other',
      browser_major: 0,
      device_class: 'mobile',
      network_class: 'unknown',
      installed_pwa: false,
    },
    id: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    transport,
  });
  for (let n = 0; n < 40; n++)
    collector.emit({
      event_type: 'journey_terminal',
      surface: 'pods',
      phase: 'continuation',
      outcome: 'success',
      journey_id: '00000000-0000-4000-8000-000000000001',
      content_id: '00000000-0000-4000-8000-000000000002',
      story_id: '00000000-0000-4000-8000-000000000003',
      playback_type: 'audio',
      measurements: {
        duration_ms: 600000,
        observed_playback_ms: 600000,
        stall_duration_ms: 1000,
        stall_count: 1,
        position_drift_ms: 1000,
        fallback_used: false,
        boundary_starved: false,
        visible: true,
        failure_class: 'unknown',
      },
    });
  for (let step = 0; step < 20; step++) await Promise.resolve();
  expect(
    deliveries.reduce((n, body) => n + body.events.length, 0) +
      collector.inspect().queued,
  ).toBe(40);
  expect(collector.inspect().queued).toBeGreaterThan(0);
  for (let step = 0; step < 10; step++) {
    finish.splice(0).forEach((done) => done());
    for (let n = 0; n < 20; n++) await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5000);
  }
  expect(deliveries.flatMap((body) => body.events)).toHaveLength(40);
  expect(
    new Set(
      deliveries.flatMap((body) => body.events.map((event) => event.event_id)),
    ).size,
  ).toBe(40);
  collector.dispose();
});
it('refreshes rejected admission once with the same event identities', async () => {
  let admissions = 0,
    events = 0;
  const bodies: unknown[] = [];
  const tickets: (string | undefined)[] = [];
  const transport = async (path: string, body: unknown, ticket?: string) => {
    if (path.endsWith('/admission'))
      return {
        ticket: `ticket-${++admissions}`,
        expires_at: Date.now() / 1000 + 1800,
      };
    bodies.push(body);
    tickets.push(ticket);
    return { ticketRejected: ++events === 1 };
  };
  const collector = createExperienceCollector({
    release: 'r2',
    locale: 'en',
    client: {
      platform: 'ios',
      os_major: 26,
      browser_family: 'other',
      browser_major: 0,
      device_class: 'mobile',
      network_class: 'unknown',
      installed_pwa: false,
    },
    transport,
  });
  collector.emit({ event_type: 'client_failure', surface: 'pods' });
  for (let n = 0; n < 20; n++) await Promise.resolve();
  await jest.advanceTimersByTimeAsync(1000);
  expect(tickets).toEqual(['ticket-1', 'ticket-2']);
  expect(bodies[1]).toEqual(bodies[0]);
  collector.dispose();
});
it('records the current interface language without changing process identity', async () => {
  let locale: 'ar' | 'en' = 'ar';
  const batches: { events: { locale: string; session_id: string }[] }[] = [];
  const transport = async (path: string, body: unknown) => {
    if (path.endsWith('/admission'))
      return { ticket: 'admission', expires_at: Date.now() / 1000 + 1800 };
    batches.push(body as (typeof batches)[number]);
    return {};
  };
  const collector = createExperienceCollector({
    release: 'r2',
    locale: () => locale,
    client: {
      platform: 'ios',
      os_major: 26,
      browser_family: 'other',
      browser_major: 0,
      device_class: 'mobile',
      network_class: 'unknown',
      installed_pwa: false,
    },
    transport,
  });
  collector.emit({ event_type: 'session_started', surface: 'pods' });
  locale = 'en';
  collector.emit({ event_type: 'session_started', surface: 'news' });
  collector.flush();
  for (let n = 0; n < 20; n++) await Promise.resolve();
  expect(batches[0]?.events.map((event) => event.locale)).toEqual(['ar', 'en']);
  expect(
    new Set(batches[0]?.events.map((event) => event.session_id)).size,
  ).toBe(1);
  collector.dispose();
});

it('a renewed ticket for a different managed runtime cannot replay queued outcomes', async () => {
  let admissions = 0,
    eventRequests = 0;
  const transport = async (path: string) => {
    if (path.endsWith('/admission'))
      return {
        ticket: 'opaque',
        expires_at: Date.now() / 1000 + 1800,
        runtime_id: ++admissions === 1 ? 'old-launch' : 'new-launch',
      };
    eventRequests++;
    return { ticketRejected: true };
  };
  const collector = createExperienceCollector({
    release: 'r2',
    locale: 'en',
    client: {
      platform: 'ios',
      os_major: 26,
      browser_family: 'other',
      browser_major: 0,
      device_class: 'mobile',
      network_class: 'unknown',
      installed_pwa: false,
    },
    transport,
  });
  collector.emit({ event_type: 'client_failure', surface: 'pods' });
  for (let n = 0; n < 20; n++) await Promise.resolve();
  await jest.advanceTimersByTimeAsync(1000);
  expect(eventRequests).toBe(1);
  expect(collector.inspect()).toMatchObject({ disabled: true, queued: 0 });
  collector.dispose();
});

it('does not keep the stall polling timer alive while idle, paused or backgrounded', () => {
  const interval = jest.spyOn(globalThis, 'setInterval');
  const observer = createPlaybackExperience();
  expect(interval).not.toHaveBeenCalled();
  observer.attempt('one', 'audio', 0);
  expect(interval).not.toHaveBeenCalled();
  time = 250;
  observer.observe(0.25, true, false, false, false);
  expect(interval).toHaveBeenCalledTimes(1);
  setExperienceForeground(false);
  expect(jest.getTimerCount()).toBe(0);
  setExperienceForeground(true);
  expect(interval).toHaveBeenCalledTimes(2);
  observer.pause();
  expect(jest.getTimerCount()).toBe(0);
  observer.dispose();
});

it('continuation is allowed only for the same active content owner', () => {
  const observer = createPlaybackExperience();
  observer.attempt('one', 'audio', 0);
  observer.attempt('two', 'audio', 0, true);
  time = 250;
  observer.observe(0.25, true, false, false, false);
  expect(
    terminal('startup').map((event) => ({
      content: event.content_id,
      outcome: event.outcome,
    })),
  ).toEqual([
    { content: 'one', outcome: 'cancelled' },
    { content: 'two', outcome: 'success' },
  ]);
  observer.dispose();
});

it('late recovery measures listening without rewriting a timed-out startup', () => {
  const observer = createPlaybackExperience();
  observer.attempt('one', 'audio', 0);
  jest.advanceTimersByTime(10000);
  time = 12000;
  observer.observe(0.25, true, false, false, false);
  time = 13000;
  observer.pause();
  expect(terminal('startup').map((event) => event.outcome)).toEqual([
    'timeout',
  ]);
  expect(firstTerminal('continuation')).toMatchObject({
    outcome: 'success',
    measurements: { observed_playback_ms: 1000 },
  });
  observer.dispose();
});
