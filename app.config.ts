import type { ExpoConfig } from 'expo/config';

// This public EAS project identifier is intentionally absent until an owner
// creates the real project. It is not a credential; EAS supplies it at build
// time through EXPO_PUBLIC_EAS_PROJECT_ID instead of committing a placeholder.
const easProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
if (easProjectId && !/^[0-9a-f-]{36}$/i.test(easProjectId)) {
  throw new Error('EXPO_PUBLIC_EAS_PROJECT_ID must be an EAS UUID.');
}

const config: ExpoConfig = {
  name: 'Wahb',
  slug: 'wahb-mobile',
  version: '0.1.0',
  runtimeVersion: { policy: 'fingerprint' },
  updates: {
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
    ...(easProjectId ? { url: `https://u.expo.dev/${easProjectId}` } : {}),
  },
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  icon: './assets/brand/wahb-logo-circle-red.png',
  scheme: 'wahb',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.salehspace.wahb',
    buildNumber: '1',
    config: {
      // Wahb uses only platform-exempt transport encryption; no proprietary
      // encryption implementation ships in the app.
      usesNonExemptEncryption: false,
    },
    // Expo static Pods are not reliably represented in Apple's generated
    // privacy report, so the app target carries the required-reason union.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['0A2A.1', '3B52.1', 'C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType:
            'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
      ],
      NSPrivacyCollectedDataTypes: [
        privacyData('NSPrivacyCollectedDataTypeEmailAddress'),
        privacyData('NSPrivacyCollectedDataTypeUserID'),
        privacyData('NSPrivacyCollectedDataTypeDeviceID'),
        privacyData('NSPrivacyCollectedDataTypeProductInteraction', [
          'NSPrivacyCollectedDataTypePurposeAppFunctionality',
          'NSPrivacyCollectedDataTypePurposeProductPersonalization',
        ]),
        privacyData('NSPrivacyCollectedDataTypeOtherUserContent'),
        privacyData('NSPrivacyCollectedDataTypeCrashData'),
        privacyData('NSPrivacyCollectedDataTypePerformanceData'),
        privacyData('NSPrivacyCollectedDataTypeOtherDiagnosticData'),
      ],
    },
  },
  android: {
    package: 'com.salehspace.wahb',
    versionCode: 1,
    // Wahb neither reads shared storage nor draws over other apps. Expo's
    // transitive manifests can otherwise add these legacy permissions.
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    adaptiveIcon: {
      backgroundColor: '#f8f5f2',
      foregroundImage: './assets/brand/wahb-logo-circle-red.png',
      monochromeImage: './assets/brand/wahb-logo-circle.png',
    },
    predictiveBackGestureEnabled: true,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host: 'wahb.salehspace.dev' }],
      },
      {
        action: 'VIEW',
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'wahb' }],
      },
    ],
  },
  plugins: [
    './plugins/with-android-min-sdk',
    'expo-router',
    'expo-asset',
    [
      'expo-localization',
      {
        supportsRTL: true,
      },
    ],
    'expo-secure-store',
    'expo-sqlite',
    [
      '@sentry/react-native',
      {
        // Build-only values. The plugin falls back to these same environment
        // variables when they are absent locally; SENTRY_AUTH_TOKEN is never
        // placed in app config.
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
    [
      'expo-audio',
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundPlayback: true,
        enableBackgroundRecording: false,
      },
    ],
    [
      'expo-video',
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#f8f5f2',
        image: './assets/brand/wahb-wordmark.png',
        imageWidth: 180,
        dark: {
          backgroundColor: '#1a1a1a',
          image: './assets/brand/wahb-wordmark-light.png',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  ...(easProjectId ? { extra: { eas: { projectId: easProjectId } } } : {}),
};

export default config;

function privacyData(
  NSPrivacyCollectedDataType: string,
  NSPrivacyCollectedDataTypePurposes = [
    'NSPrivacyCollectedDataTypePurposeAppFunctionality',
  ],
) {
  return {
    NSPrivacyCollectedDataType,
    NSPrivacyCollectedDataTypeLinked: true,
    NSPrivacyCollectedDataTypeTracking: false,
    NSPrivacyCollectedDataTypePurposes,
  };
}
