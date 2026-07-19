export const forYouSessionLifetimeMs = 6 * 60 * 60 * 1_000;

export function createSessionExpiry(now: Date): Date {
  return new Date(now.getTime() + forYouSessionLifetimeMs);
}

export function isSessionFresh(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() > now.getTime();
}
