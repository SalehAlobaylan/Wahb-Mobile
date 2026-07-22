export function anonymousIdentityScope(installationId: string): string {
  return `anonymous:${installationId}`;
}

export function userIdentityScope(userId: string): string {
  return `user:${userId}`;
}

export function identityScope(
  installationId: string,
  userId?: string | null,
): string {
  return userId
    ? userIdentityScope(userId)
    : anonymousIdentityScope(installationId);
}
