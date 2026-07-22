const {
  createRunOncePlugin,
  withProjectBuildGradle,
} = require('@expo/config-plugins');

const MIN_ANDROID_SDK = 24;

function withAndroidMinSdk(config) {
  return withProjectBuildGradle(config, (nextConfig) => {
    if (nextConfig.modResults.language !== 'groovy') {
      throw new Error('Wahb expects a Groovy Android project build file.');
    }

    if (
      nextConfig.modResults.contents.includes(
        `minSdkVersion = ${MIN_ANDROID_SDK}`,
      )
    ) {
      return nextConfig;
    }

    const marker = 'allprojects {';
    if (!nextConfig.modResults.contents.includes(marker)) {
      throw new Error('Unable to set the Android minimum SDK version.');
    }

    nextConfig.modResults.contents = nextConfig.modResults.contents.replace(
      marker,
      `ext {\n  minSdkVersion = ${MIN_ANDROID_SDK}\n}\n\n${marker}`,
    );
    return nextConfig;
  });
}

module.exports = createRunOncePlugin(
  withAndroidMinSdk,
  'wahb-android-min-sdk',
  '1.0.0',
);
