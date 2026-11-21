const { withAndroidManifest, withAppBuildGradle, withAppDelegate, withInfoPlist, withGradleProperties } = require('expo/config-plugins');
// Keep the SDK's native build requirements, without its build-time key plugin.
const { addCoreLibraryDesugaring } = require('@googlemaps/react-native-navigation-sdk/plugin/buildGradle');
const { enableJetifier } = require('@googlemaps/react-native-navigation-sdk/plugin/gradleProperties');

function removeLaunchKey(contents) {
  return contents.replace(/^[ \t]*\/\/ @generated begin react-native-navigation-sdk-api-key[^\n]*\n[\s\S]*?^[ \t]*\/\/ @generated end react-native-navigation-sdk-api-key[^\n]*(?:\n|$)/gm, '');
}
function removeManifestKeys(manifest) {
  for (const application of manifest.application || []) {
    application['meta-data'] = (application['meta-data'] || []).filter((entry) =>
      !['com.google.android.geo.API_KEY', 'com.google.android.maps.v2.API_KEY'].includes(entry.$?.['android:name']));
  }
  return manifest;
}

module.exports = function withRuntimeGoogleMaps(config) {
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('Google navigation setup requires a Groovy app build.gradle.');
    mod.modResults.contents = addCoreLibraryDesugaring(mod.modResults.contents);
    return mod;
  });
  config = withGradleProperties(config, (mod) => { mod.modResults = enableJetifier(mod.modResults); return mod; });
  config = withAndroidManifest(config, (mod) => { removeManifestKeys(mod.modResults.manifest); return mod; });
  config = withInfoPlist(config, (mod) => { delete mod.modResults.GMSApiKey; return mod; });
  return withAppDelegate(config, (mod) => { mod.modResults.contents = removeLaunchKey(mod.modResults.contents); return mod; });
};
module.exports.removeLaunchKey = removeLaunchKey;
module.exports.removeManifestKeys = removeManifestKeys;
