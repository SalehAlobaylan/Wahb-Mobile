/**
 * Future-download domain contracts. These are intentionally dependency-free:
 * v1 has no download UI, persisted catalog, or transfer implementation.
 */
export type DownloadArtifactManifest = {
  artifactId: string;
  revision: string;
  relativePath: string;
  mimeType: string;
  codecs?: string;
  bytes: number;
  sha256: string;
  rightsRevision: string;
  expiresAt: string;
};

export type DownloadGrant = {
  artifactId: string;
  revision: string;
  scope: string;
  expiresAt: string;
};

export type VerifiedLocalArtifact = DownloadArtifactManifest & {
  scope: string;
  verification: 'complete';
};

export type DownloadTransport = {
  fetchManifest(contentId: string): Promise<DownloadArtifactManifest>;
  requestGrant(artifactId: string): Promise<DownloadGrant>;
};

export type DownloadEngine = {
  prepare(
    manifest: DownloadArtifactManifest,
    grant: DownloadGrant,
  ): Promise<void>;
  remove(artifactId: string): Promise<void>;
};

export function isVerifiedLocalArtifact(
  artifact: VerifiedLocalArtifact,
  scope: string,
  now = new Date(),
): boolean {
  // Artifact identity is immutable server metadata, never a signed URL.
  if (!artifact.artifactId || /^https?:\/\//i.test(artifact.artifactId))
    return false;
  if (!/^[a-f0-9]{64}$/i.test(artifact.sha256)) return false;
  if (artifact.verification !== 'complete') return false;
  if (!artifact.relativePath || artifact.relativePath.startsWith('/'))
    return false;
  if (!Number.isFinite(artifact.bytes) || artifact.bytes <= 0) return false;
  return (
    artifact.scope === scope &&
    new Date(artifact.expiresAt).getTime() > now.getTime()
  );
}

/**
 * This is not a download record. It is the only shape a future catalog may
 * hand to playback after it has verified a complete file under the current
 * identity scope.
 */
export type VerifiedLocalPlaybackArtifact = VerifiedLocalArtifact & {
  fileUrl: string;
  playbackType: 'hls' | 'mp4' | 'audio';
  hasVideo: boolean;
};

export function isVerifiedLocalPlaybackArtifact(
  artifact: VerifiedLocalPlaybackArtifact,
  scope: string,
  now = new Date(),
): boolean {
  return (
    isVerifiedLocalArtifact(artifact, scope, now) &&
    artifact.fileUrl.startsWith('file://')
  );
}

export type TemporaryCacheEntry = {
  key: string;
  bytes: number;
  lastAccessedAt: string;
  createdAt: string;
};

export function evictTemporaryCache(
  entries: readonly TemporaryCacheEntry[],
  now: Date,
  limits = {
    maxBytes: 25 * 1024 * 1024,
    maxEntries: 100,
    maxAgeMs: 7 * 86_400_000,
  },
): TemporaryCacheEntry[] {
  const fresh = entries.filter(
    (entry) =>
      Number.isFinite(new Date(entry.createdAt).getTime()) &&
      now.getTime() - new Date(entry.createdAt).getTime() <= limits.maxAgeMs,
  );
  const newestFirst = [...fresh].sort(
    (a, b) =>
      new Date(b.lastAccessedAt).getTime() -
      new Date(a.lastAccessedAt).getTime(),
  );
  let used = 0;
  return newestFirst.filter((entry, index) => {
    used += entry.bytes;
    return index < limits.maxEntries && used <= limits.maxBytes;
  });
}
