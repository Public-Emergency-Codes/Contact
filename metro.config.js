const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /android[\\/]app[\\/]build[\\/].*/,
  /android[\\/]build[\\/].*/,
  /app[\\/]build[\\/].*/,
];

module.exports = config;
