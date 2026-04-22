const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    'react-native-litert-lm': path.resolve(__dirname, 'modules/stubs/react-native-litert-lm'),
  },
};

module.exports = config;
