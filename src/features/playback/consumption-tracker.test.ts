import { describe, expect, it } from '@jest/globals';
import { ConsumptionTracker } from './consumption-tracker';

describe('playback owner consumption', () => {
  it('checkpoints replayed listening independently of the furthest position', () => {
    const tracker = new ConsumptionTracker();
    tracker.observe(0, true, 0);
    tracker.observe(30, true, 30000);
    expect(tracker.event(300)?.played).toBe(30);
    tracker.seek(0);
    tracker.observe(30, true, 30100); // stale status while the native seek is pending
    tracker.observe(0, true, 30200);
    tracker.observe(30, true, 60200);
    expect(tracker.event(300)?.played).toBe(60);
  });
  it('retains cumulative listening across audio/video handoffs without charging the seek', () => {
    const tracker = new ConsumptionTracker();
    tracker.observe(0, true, 0);
    tracker.observe(10, true, 10000);
    tracker.seek(10);
    tracker.observe(10, true, 11000);
    tracker.observe(20, true, 21000);
    expect(tracker.event(300, true)?.played).toBe(20);
  });
  it('handles sparse background updates and speed, but excludes impossible jumps and paused time', () => {
    const tracker = new ConsumptionTracker();
    tracker.observe(0, true, 0, 2);
    tracker.observe(60, true, 30000, 2);
    tracker.observe(120, false, 60000, 2);
    tracker.observe(180, false, 90000, 2);
    tracker.observe(240, true, 120000, 2);
    tracker.observe(500, true, 121000, 2);
    expect(tracker.state.accumulatedPlayedSeconds).toBe(120);
    tracker.observe(NaN, true, 122000);
    expect(Number.isFinite(tracker.state.accumulatedPlayedSeconds)).toBe(true);
  });
  it('flushes partial sessions once and does not create transient zero-play quick skips', () => {
    const tracker = new ConsumptionTracker();
    tracker.observe(0, false, 0);
    expect(tracker.event(300, true)).toBeNull();
    tracker.observe(0, true, 1000);
    tracker.observe(7, false, 8000);
    expect(tracker.event(300, true)).toMatchObject({
      type: 'sampled',
      played: 7,
    });
    expect(tracker.event(300, true)).toBeNull();
  });
});

it('does not claim completion from seeking to the end with too little listening', () => {
 const tracker = new ConsumptionTracker();
 tracker.observe(0,true,0);tracker.observe(3,true,3000);
 tracker.seek(300);tracker.observe(300,false,3100);
 expect(tracker.event(300,true,true)).toMatchObject({type:'quick_skip',played:3});
});
