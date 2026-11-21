// Mobile Google keys come only from the authenticated customer site at runtime.
module.exports = ({ config }) => {
  const plugins = (config.plugins || []).filter((plugin) =>
    !['react-native-maps', '@googlemaps/react-native-navigation-sdk', './plugins/with-runtime-google-maps', 'expo-location'].includes(Array.isArray(plugin) ? plugin[0] : plugin),
  );
  // SDK 58 requires these native plugins; keep the dynamic config idempotent.
  for (const name of ['expo-font', 'expo-secure-store', 'expo-status-bar', 'expo-asset']) {
    if (!plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === name)) plugins.push(name);
  }
  const androidConfig = { ...config.android?.config };
  delete androidConfig.googleMaps;
  const iosConfig = { ...config.ios?.config };
  delete iosConfig.googleMapsApiKey;
  const extra = { ...config.extra };
  delete extra.mobileMaps;
  return {
    ...config,
    android: { ...config.android, config: androidConfig },
    ios: { ...config.ios, config: iosConfig },
    plugins: [
      ...plugins,
      './plugins/with-runtime-google-maps',
      ['expo-location', {
        locationWhenInUsePermission: 'Allow Vuna Transport to show your position relative to delivery stops.',
      }],
    ],
    extra,
  };
};
