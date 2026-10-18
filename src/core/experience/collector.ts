import { experienceId } from './id';
import type {
  RuxEvent,
  RuxEventType,
  RuxMeasurements,
  RuxSurface,
  RuxClientContext,
} from './types';

export type EmitInput = {
  event_type: RuxEventType;
  surface: RuxSurface;
  phase?: RuxEvent['phase'];
  outcome?: RuxEvent['outcome'];
  journey_id?: string | null;
  content_id?: string | null;
  feed_session_id?: string | null;
  story_id?: string | null;
  playback_type?: RuxEvent['playback_type'];
  measurements?: RuxMeasurements | null;
};
type Transport = (
  path: string,
  body: unknown,
  ticket?: string,
) => Promise<{
  disabled?: boolean;
  ticket?: string;
  expires_at?: number;
  ticketRejected?: boolean;
  runtime_id?: string;
}>;

// A process session is ephemeral and independent of login/installation/outbox
// identity. Delivery is bounded, quiet and never persisted into business state.
export function createExperienceCollector(input: {
  release: string;
  client: RuxClientContext;
  locale: 'ar' | 'en' | 'unknown' | (() => 'ar' | 'en' | 'unknown');
  transport: Transport;
  id?: () => string;
}) {
  const id = input.id ?? experienceId;
  const session = id(),
    page = id();
  let sequence = 0,
    inFlight = 0,
    pendingBytes = 0,
    generation = 0;
  let disabled = !/^[A-Za-z0-9._-]{1,80}$/.test(input.release);
  let queue: RuxEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ticket: string | undefined,
    expires = 0;
  let admission: Promise<void> | undefined;
  let admittedRuntime: string | undefined;
  const retries = new Set<ReturnType<typeof setTimeout>>();
  async function admit() {
    if (ticket && Date.now() / 1000 < expires - 30) return;
    admission ??= input
      .transport('/experience/native/admission', {
        platform: input.client.platform,
        session_id: session,
        page_load_id: page,
        release: input.release,
      })
      .then((response) => {
        if (
          response.disabled ||
          (admittedRuntime !== undefined &&
            (response.runtime_id ?? '') !== admittedRuntime)
        ) {
          disabled = true;
          queue = [];
          return;
        }
        if (
          !response.ticket ||
          response.ticket.length > 1024 ||
          !response.expires_at
        )
          throw Error('admission unavailable');
        admittedRuntime = response.runtime_id ?? '';
        ticket = response.ticket;
        expires = response.expires_at;
      })
      .finally(() => {
        admission = undefined;
      });
    await admission;
  }
  async function deliver(events: RuxEvent[], retry = false) {
    const body = { schema_version: 3, events };
    const size = JSON.stringify(body).length * 3; // conservative UTF-8 bound
    if (disabled || inFlight >= 2 || pendingBytes + size > 60_000) return;
    inFlight++;
    pendingBytes += size;
    const current = generation;
    try {
      await admit();
      if (disabled || generation !== current || !ticket) return;
      const result = await input.transport(
        '/experience/native/events',
        body,
        ticket,
      );
      if (result.ticketRejected) {
        ticket = undefined;
        expires = 0;
        throw Error('admission expired');
      }
      if (result.disabled) {
        disabled = true;
        queue = [];
      }
    } catch {
      if (!retry && !disabled && retries.size < 2 && current === generation) {
        const handle = setTimeout(() => {
          retries.delete(handle);
          void deliver(events, true);
        }, 1000);
        retries.add(handle);
      }
    } finally {
      if (current === generation) {
        inFlight--;
        pendingBytes -= size;
      }
    }
  }
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (disabled || !queue.length) return;
    if (inFlight < 2) {
      // Select a batch before dequeueing. A busy shared byte budget must not
      // silently discard terminals, especially the larger failure batches.
      let count = Math.min(queue.length, 20);
      while (
        count > 0 &&
        JSON.stringify({ schema_version: 3, events: queue.slice(0, count) })
          .length *
          3 >
          60_000 - pendingBytes
      )
        count--;
      if (count > 0) void deliver(queue.splice(0, count));
      else if (pendingBytes === 0) queue.shift(); // one invalid oversized event
    }
    if (queue.length) timer = setTimeout(flush, 5000);
  }
  return {
    emit(event: EmitInput) {
      if (disabled) return;
      if (queue.length >= 200) {
        const disposable = queue.findIndex(
          (event) =>
            event.event_type !== 'client_failure' &&
            !(
              event.event_type === 'journey_terminal' &&
              ['failed', 'timeout'].includes(event.outcome || '')
            ),
        );
        queue.splice(disposable < 0 ? 0 : disposable, 1);
      }
      queue.push({
        ...event,
        event_id: id(),
        schema_version: 3,
        occurred_at: new Date().toISOString(),
        session_id: session,
        page_load_id: page,
        sequence: sequence++,
        release: input.release,
        locale:
          typeof input.locale === 'function' ? input.locale() : input.locale,
        client: input.client,
      });
      if (
        queue.length >= 20 ||
        event.event_type === 'client_failure' ||
        (event.event_type === 'journey_terminal' &&
          ['failed', 'timeout'].includes(event.outcome || ''))
      )
        flush();
      else timer ??= setTimeout(flush, 5000);
    },
    flush,
    dispose() {
      generation++;
      inFlight = 0;
      pendingBytes = 0;
      disabled = true;
      queue = [];
      clearTimeout(timer);
      retries.forEach(clearTimeout);
      retries.clear();
    },
    inspect: () => ({
      queued: queue.length,
      inFlight,
      disabled,
      session,
      page,
    }),
  };
}
let collector: ReturnType<typeof createExperienceCollector> | undefined;
export function setExperienceCollector(
  next?: ReturnType<typeof createExperienceCollector>,
) {
  collector?.dispose();
  collector = next;
}
export function emitEvent(input: EmitInput) {
  try {
    collector?.emit(input);
  } catch {
    /* instrumentation cannot affect the product */
  }
}
export function flushExperience() {
  collector?.flush();
}
