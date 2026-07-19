export type PaginationBudget = {
  tokens: number;
  lastRefillAtMs: number;
};

const maximumBurst = 3;
const refillPerSecond = 1;

export function createPaginationBudget(nowMs: number): PaginationBudget {
  return { tokens: maximumBurst, lastRefillAtMs: nowMs };
}

export function consumePaginationToken(
  budget: PaginationBudget,
  nowMs: number,
): { allowed: boolean; budget: PaginationBudget } {
  const elapsedSeconds = Math.max(0, nowMs - budget.lastRefillAtMs) / 1_000;
  const tokens = Math.min(
    maximumBurst,
    budget.tokens + elapsedSeconds * refillPerSecond,
  );
  if (tokens < 1) {
    return {
      allowed: false,
      budget: { tokens, lastRefillAtMs: nowMs },
    };
  }
  return {
    allowed: true,
    budget: { tokens: tokens - 1, lastRefillAtMs: nowMs },
  };
}
