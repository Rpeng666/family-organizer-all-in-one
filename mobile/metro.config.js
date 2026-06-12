const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, '..');

config.watchFolders = Array.from(new Set([...(config.watchFolders || []), workspaceRoot]));
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The web app at the repo root uses React 18 while Expo SDK 54 uses React 19.
// Force only React (and react subpaths) to resolve from the mobile workspace,
// while preserving Expo's default monorepo resolver behavior for everything
// else so nested transitive deps resolve correctly (e.g. Expo's own
// webidl-conversions@5 nested under whatwg-url-without-unicode).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    const target = path.resolve(workspaceRoot, moduleName.slice(2));
    return context.resolveRequest(context, target, platform);
  }

  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const target = path.resolve(__dirname, 'node_modules', moduleName);
    return context.resolveRequest(context, target, platform);
  }

  // The shared Instant schema currently imports from `@instantdb/react`.
  // For the mobile bundle, route that import to the React Native SDK so we can
  // reuse the schema without pulling in the web React package/runtime.
  if (moduleName === '@instantdb/react') {
    const target = path.resolve(__dirname, 'node_modules', '@instantdb', 'react-native');
    return context.resolveRequest(context, target, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
