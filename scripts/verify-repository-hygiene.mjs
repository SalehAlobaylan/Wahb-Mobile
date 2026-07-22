import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const tracked = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

const forbiddenPathPatterns = [
  [/^(?:ios|android)\//, 'generated native project'],
  [
    /(?:^|\/)(?:credentials?|certificates?|provisioning)(?:\/|$)/i,
    'signing directory',
  ],
  [/\.env(?:\.|$)/i, 'private environment file'],
  [
    /\.(?:jks|keystore|p8|p12|mobileprovision|pem|key|cer|der)$/i,
    'signing artifact',
  ],
  [/(?:^|\/)GoogleService-Info\.plist$/i, 'iOS service credential'],
  [/(?:^|\/)google-services\.json$/i, 'Android service credential'],
];

const contentPatterns = [
  [/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, 'private key material'],
  [
    /\b(?:EAS_ACCESS_TOKEN|SENTRY_AUTH_TOKEN|EXPO_TOKEN)\s*=\s*[^\s]+/,
    'service token assignment',
  ],
  [
    /\b(?:APPLE_APP_SPECIFIC_PASSWORD|FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD)\s*=\s*[^\s]+/,
    'Apple credential assignment',
  ],
];

const failures = [];
for (const path of tracked) {
  for (const [pattern, kind] of forbiddenPathPatterns) {
    if (pattern.test(path) && path !== '.env.example') {
      failures.push(`${path}: ${kind}`);
      break;
    }
  }
}

for (const path of tracked.filter((candidate) =>
  /\.(?:[cm]?[jt]sx?|json|ya?ml|md|properties|xml|plist)$/i.test(candidate),
)) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    // A file removed in the current worktree remains in `git ls-files` until
    // commit. It cannot leak a credential from this checkout, so skip it.
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
  for (const [pattern, kind] of contentPatterns) {
    if (pattern.test(text)) {
      // Never echo a match or a surrounding line: it may itself be a secret.
      failures.push(`${path}: ${kind}`);
      break;
    }
  }
}

for (const path of ['ios', 'android']) {
  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', path]);
  } catch {
    failures.push(`${path}: generated native output is not ignored`);
  }
}

if (failures.length > 0) {
  console.error(
    'Repository hygiene failed. Rotate any confirmed credential before release.',
  );
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Repository hygiene verified.');
}
