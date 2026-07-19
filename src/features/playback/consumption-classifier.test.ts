import { describe, expect, it } from '@jest/globals';

import {
  classifyConsumption,
  createConsumptionState,
  observeConsumption,
} from './consumption-classifier';

describe('consumption classifier', () => {
  it('counts continuous listening but not a seek jump', () => {
    let state = createConsumptionState();
    state = observeConsumption(state, 4, true);
    state = observeConsumption(state, 200, true);
    expect(state).toMatchObject({
      accumulatedPlayedSeconds: 4,
      furthestPositionSeconds: 200,
    });
    expect(classifyConsumption(state, 220)).toBe('quick_skip');
  });

  it('classifies meaningful and completed playback with duration-aware thresholds', () => {
    let meaningful = createConsumptionState();
    for (let second = 1; second <= 18; second += 1) {
      meaningful = observeConsumption(meaningful, second, true);
    }
    expect(classifyConsumption(meaningful, 180)).toBe('meaningful');

    let completed = createConsumptionState();
    for (let second = 1; second <= 30; second += 1) {
      completed = observeConsumption(completed, second, true);
    }
    completed = observeConsumption(completed, 170, false);
    expect(classifyConsumption(completed, 180)).toBe('completed');
  });
});
