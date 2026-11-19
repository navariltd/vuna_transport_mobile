// Native Maps SDK keys are build-time client credentials, not server Routes keys.
// Restrict Android keys to the package + signing SHA-1, and iOS keys to the bundle ID.
module.exports = ({ config }) => {
  const androidKey = process.env.VUNA_TRANSPORT_GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const iosKey = process.env.VUNA_TRANSPORT_GOOGLE_MAPS_IOS_API_KEY?.trim();
  const plugins = (config.plugins || []).filter((plugin) =>
    !['react-native-maps', '@googlemaps/react-native-navigation-sdk', 'expo-location'].includes(Array.isArray(plugin) ? plugin[0] : plugin),
  );
  // SDK 58 requires these native plugins; keep the dynamic config idempotent.
  for (const name of ['expo-font', 'expo-secure-store', 'expo-status-bar', 'expo-asset']) {
    if (!plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name)) plugins.push(name);
  }
  return {
    ...config,
    android: { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: androidKey || '' } } },
    ios: { ...config.ios, config: { ...config.ios?.config, googleMapsApiKey: iosKey || '' } },
    plugins: [
      ...plugins,
      '@googlemaps/react-native-navigation-sdk',
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
