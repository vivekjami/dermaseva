const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow Metro to bundle .txt files as static assets for RAG documents
config.resolver = {
  ...config.resolver,
  assetExts: [...config.resolver.assetExts, 'txt'],
  extraNodeModules: {
    'react-native-litert-lm': path.resolve(__dirname, 'modules/stubs/react-native-litert-lm'),
  },
};

module.exports = config;
