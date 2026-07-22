import { readFile } from 'node:fs/promises';

const manifestPath = new URL(
  '../android/app/src/main/AndroidManifest.xml',
  import.meta.url,
);
const manifest = await readFile(manifestPath, 'utf8');
const projectBuildGradlePath = new URL(
  '../android/build.gradle',
  import.meta.url,
);
const projectBuildGradle = await readFile(projectBuildGradlePath, 'utf8');

const permissionDeclarations = [
  ...manifest.matchAll(/<uses-permission\b([^>]*)\/>/g),
].map((match) => ({
  name: match[1].match(/android:name="([^"]+)"/)?.[1],
  removed: match[1].includes('tools:node="remove"'),
}));
const permissions = permissionDeclarations
  .filter((declaration) => !declaration.removed)
  .map((declaration) => declaration.name)
  .filter((name) => Boolean(name));
const allowedPermissions = new Set([
  'android.permission.INTERNET',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  // Expo Haptics uses the vibration permission without a runtime prompt.
  'android.permission.VIBRATE',
]);
const unexpectedPermissions = permissions.filter(
  (permission) => !allowedPermissions.has(permission),
);

if (unexpectedPermissions.length > 0) {
  throw new Error(
    `Unexpected Android permissions: ${unexpectedPermissions.join(', ')}`,
  );
}

const blockedPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
];
const missingBlockedPermissionRemovals = blockedPermissions.filter(
  (permission) =>
    !permissionDeclarations.some(
      (declaration) => declaration.name === permission && declaration.removed,
    ),
);

if (missingBlockedPermissionRemovals.length > 0) {
  throw new Error(
    `Android manifest does not remove: ${missingBlockedPermissionRemovals.join(', ')}`,
  );
}

const requiredFragments = [
  'android:enableOnBackInvokedCallback="true"',
  'android:supportsRtl="true"',
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.video.playbackService.ExpoVideoPlaybackService',
  'android:foregroundServiceType="mediaPlayback"',
];
const missingFragments = requiredFragments.filter(
  (fragment) => !manifest.includes(fragment),
);

if (missingFragments.length > 0) {
  throw new Error(
    `Android manifest is missing: ${missingFragments.join(', ')}`,
  );
}

if (!projectBuildGradle.includes('minSdkVersion = 24')) {
  throw new Error('Android 7/API 24 minimum SDK is not enforced.');
}

console.log(
  `Android manifest verified (${permissions.length} declared permissions).`,
);
