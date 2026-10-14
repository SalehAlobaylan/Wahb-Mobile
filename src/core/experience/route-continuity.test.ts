import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import type { MockedFunction } from 'jest-mock';
import { emitEvent } from './collector';
import { createRouteContinuityExperience } from './route-continuity';
import { notifyIntentionalSeek, setExperienceForeground } from './lifecycle';
jest.mock('./collector', () => ({ emitEvent: jest.fn() }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
}));
let clock = 0;
const frame = {
  path: '/news',
  contentId: 'one',
  position: 10,
  rate: 2,
  phase: 'playing' as const,
  buffering: false,
};
const terminals = () =>
  (emitEvent as MockedFunction<typeof emitEvent>).mock.calls
    .map((call) => call[0])
    .filter(
      (event) =>
        event.event_type === 'journey_terminal' && event.phase === 'handoff',
    );
beforeEach(() => {
  jest.useFakeTimers();
  clock = 0;
  setExperienceForeground(true);
  jest.spyOn(performance, 'now').mockImplementation(() => clock);
  (emitEvent as MockedFunction<typeof emitEvent>).mockClear();
});
afterEach(() => {
  setExperienceForeground(false);
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});
it('natural clock progress at 2x is continuity rather than position drift', () => {
  const observer = createRouteContinuityExperience('/');
  observer.observe(frame);
  clock = 1500;
  observer.observe({ ...frame, position: 13 });
  expect(terminals()[0]).toMatchObject({
    outcome: 'success',
    measurements: { position_drift_ms: 0 },
  });
  observer.dispose();
});
it('a different item cannot settle the previous handoff', () => {
  const observer = createRouteContinuityExperience('/');
  observer.observe(frame);
  clock = 250;
  observer.observe({ ...frame, contentId: 'two', position: 100 });
  expect(terminals()[0]).toMatchObject({
    outcome: 'cancelled',
    content_id: 'one',
  });
  observer.dispose();
});
it('intentional seeks cancel the handoff while unexpected jumps fail it', () => {
  const observer = createRouteContinuityExperience('/');
  observer.observe(frame);
  notifyIntentionalSeek();
  clock = 250;
  observer.observe({ ...frame, position: 100 });
  expect(terminals()[0]).toMatchObject({ outcome: 'cancelled' });
  observer.dispose();
  (emitEvent as MockedFunction<typeof emitEvent>).mockClear();
  clock = 0;
  const other = createRouteContinuityExperience('/');
  other.observe(frame);
  clock = 250;
  other.observe({ ...frame, position: 100 });
  expect(terminals()[0]).toMatchObject({ outcome: 'failed' });
  other.dispose();
});
it('returning to Pods and backgrounding cannot prove route continuity', () => {
  const observer = createRouteContinuityExperience('/');
  observer.observe(frame);
  observer.observe({ ...frame, path: '/', position: 10.2 });
  expect(terminals()[0]).toMatchObject({ outcome: 'cancelled' });
  observer.dispose();
  (emitEvent as MockedFunction<typeof emitEvent>).mockClear();
  const other = createRouteContinuityExperience('/');
  other.observe(frame);
  setExperienceForeground(false);
  other.observe({ ...frame, position: 11 });
  expect(terminals()[0]).toMatchObject({ outcome: 'backgrounded' });
  other.dispose();
});
