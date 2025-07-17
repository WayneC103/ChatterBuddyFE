const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Add GLB files to asset extensions
config.resolver.assetExts.push("glb");

// Ensure proper handling of binary assets in release builds
config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  keep_fnames: true,
  mangle: {
    ...config.transformer.minifierConfig?.mangle,
    keep_fnames: true,
  },
};

module.exports = config;
