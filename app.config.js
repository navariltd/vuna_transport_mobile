// Native Maps SDK keys are build-time client credentials, not server Routes keys.
// Restrict Android keys to the package + signing SHA-1, and iOS keys to the bundle ID.
module.exports = ({ config }) => {
  const androidKey = process.env.VUNA_TRANSPORT_GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const iosKey = process.env.VUNA_TRANSPORT_GOOGLE_MAPS_IOS_API_KEY?.trim();
  const plugins = (config.plugins || []).filter((plugin) =>
    !['react-native-maps', 'expo-location'].includes(Array.isArray(plugin) ? plugin[0] : plugin),
  );
  return {
    ...config,
    plugins: [
      ...plugins,
      ['react-native-maps', {
        ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
        ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
      }],
      ['expo-location', {
        locationWhenInUsePermission: 'Allow Vuna Transport to show your position relative to delivery stops.',
      }],
    ],
    extra: {
      ...config.extra,
      mobileMaps: {
        googleAndroidConfigured: Boolean(androidKey),
        googleIosConfigured: Boolean(iosKey),
      },
    },
  };
};
