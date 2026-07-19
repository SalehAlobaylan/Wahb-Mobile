import { describe, expect, it } from '@jest/globals';

import {
  consumePaginationToken,
  createPaginationBudget,
} from './pagination-policy';

describe('pagination token bucket', () => {
  it('allows only a three-request burst then refills at one request per second', () => {
    let budget = createPaginationBudget(0);
    for (let index = 0; index < 3; index += 1) {
      const result = consumePaginationToken(budget, 0);
      expect(result.allowed).toBe(true);
      budget = result.budget;
    }
    expect(consumePaginationToken(budget, 0).allowed).toBe(false);
    expect(consumePaginationToken(budget, 1_000).allowed).toBe(true);
  });
});
