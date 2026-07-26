const {
  createRunOncePlugin,
  IOSConfig,
  withXcodeProject,
} = require('@expo/config-plugins');

function withIosLocalDevelopment(config) {
  return withXcodeProject(config, (nextConfig) => {
    const project = nextConfig.modResults;
    const projectSection = project.pbxProjectSection();
    const projectEntry = Object.values(projectSection).find(
      (entry) =>
        entry && typeof entry === 'object' && entry.isa === 'PBXProject',
    );

    for (const [targetId, target] of IOSConfig.Target.getNativeTargets(
      project,
    )) {
      if (projectEntry) {
        projectEntry.attributes ??= {};
        projectEntry.attributes.TargetAttributes ??= {};
        projectEntry.attributes.TargetAttributes[targetId] ??= {};
        projectEntry.attributes.TargetAttributes[targetId].ProvisioningStyle =
          'Automatic';
      }

      for (const [
        ,
        buildConfiguration,
      ] of IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
        project,
        target.buildConfigurationList,
      )) {
        buildConfiguration.buildSettings.CODE_SIGN_STYLE = 'Automatic';
        if (IOSConfig.XcodeUtils.unquote(buildConfiguration.name) === 'Debug') {
          buildConfiguration.buildSettings.SENTRY_DISABLE_AUTO_UPLOAD = 'true';
        }
      }
    }

    return nextConfig;
  });
}

module.exports = createRunOncePlugin(
  withIosLocalDevelopment,
  'wahb-ios-local-development',
  '1.0.0',
);
