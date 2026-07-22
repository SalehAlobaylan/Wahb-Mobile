import { readFile } from 'node:fs/promises';

const iosRoot = new URL('../ios/Wahb/', import.meta.url);
const [infoPlist, privacyManifest, easConfig, appConfig, packageJson] =
  await Promise.all([
    readFile(new URL('Info.plist', iosRoot), 'utf8'),
    readFile(new URL('PrivacyInfo.xcprivacy', iosRoot), 'utf8'),
    readFile(new URL('../eas.json', import.meta.url), 'utf8'),
    readFile(new URL('../app.config.ts', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);

const requiredPrivacyFragments = [
  'NSPrivacyTracking',
  'NSPrivacyAccessedAPICategoryFileTimestamp',
  'NSPrivacyAccessedAPICategoryDiskSpace',
  'NSPrivacyAccessedAPICategoryUserDefaults',
  'NSPrivacyAccessedAPICategorySystemBootTime',
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypeDeviceID',
  'NSPrivacyCollectedDataTypeProductInteraction',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypeCrashData',
  'NSPrivacyCollectedDataTypePerformanceData',
  'NSPrivacyCollectedDataTypeOtherDiagnosticData',
];
const missingPrivacyFragments = requiredPrivacyFragments.filter(
  (fragment) => !privacyManifest.includes(fragment),
);

if (missingPrivacyFragments.length > 0) {
  throw new Error(
    `Privacy manifest is missing: ${missingPrivacyFragments.join(', ')}`,
  );
}

if (!/ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(infoPlist)) {
  throw new Error('iOS export-compliance encryption declaration is missing.');
}

const eas = JSON.parse(easConfig);
for (const profile of ['development', 'preview', 'testflight', 'production']) {
  if (!eas.build?.[profile]?.channel) {
    throw new Error(`EAS build profile ${profile} is missing a channel.`);
  }
}
if (
  eas.build.testflight.channel !== 'preview' ||
  eas.build.production.channel !== 'production'
) {
  throw new Error('EAS TestFlight/production channel separation is invalid.');
}
if (
  eas.build.development.channel === eas.build.preview.channel ||
  eas.build.preview.channel === eas.build.production.channel ||
  eas.build.development.channel === eas.build.production.channel
) {
  throw new Error(
    'EAS development, preview, and production channels must differ.',
  );
}

if (
  !/runtimeVersion:\s*\{\s*policy:\s*['"]fingerprint['"]\s*\}/.test(appConfig)
) {
  throw new Error('Runtime fingerprint policy is required for OTA safety.');
}
if (!/checkAutomatically:\s*['"]ON_LOAD['"]/.test(appConfig)) {
  throw new Error('Expo Updates must check on load.');
}

const packageManifest = JSON.parse(packageJson);
const otaRuntimePresent = Boolean(
  packageManifest.dependencies?.['expo-updates'],
);
const easProjectId = process.env.EAS_PROJECT_ID?.trim();
const publicEasProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
if (process.env.REQUIRE_OTA_AUTHORITY === '1') {
  if (!otaRuntimePresent) {
    throw new Error(
      'expo-updates must be installed after the EAS project is linked.',
    );
  }
  if (!easProjectId) {
    throw new Error('EAS_PROJECT_ID is required when verifying OTA authority.');
  }
  if (!/^[0-9a-f-]{36}$/i.test(easProjectId)) {
    throw new Error('EAS_PROJECT_ID must be a UUID supplied by EAS.');
  }
  if (publicEasProjectId !== easProjectId) {
    throw new Error(
      'EXPO_PUBLIC_EAS_PROJECT_ID must match EAS_PROJECT_ID when verifying OTA authority.',
    );
  }
}

console.log(
  otaRuntimePresent && easProjectId
    ? 'Release configuration and OTA authority verified.'
    : 'Release configuration verified; OTA authority remains an explicit external gate.',
);
