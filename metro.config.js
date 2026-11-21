const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Bundle the SDK's unmodified legal text for offline access, not as JavaScript.
if (!config.resolver.assetExts.includes('txt')) config.resolver.assetExts.push('txt');
module.exports = config;
