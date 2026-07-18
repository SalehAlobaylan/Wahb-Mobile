import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Wahb',
  slug: 'wahb-mobile',
  version: '0.1.0',
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  icon: './assets/brand/wahb-logo-circle-red.png',
  scheme: 'wahb',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.salehspace.wahb',
    buildNumber: '1',
  },
  android: {
    package: 'com.salehspace.wahb',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#f8f5f2',
      foregroundImage: './assets/brand/wahb-logo-circle-red.png',
      monochromeImage: './assets/brand/wahb-logo-circle.png',
    },
    predictiveBackGestureEnabled: true,
  },
  plugins: [
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
};

export default config;
