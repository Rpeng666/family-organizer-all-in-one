// next.config.js
module.exports = {
  // This line enables the standalone build to decrease to docker container size
  output: 'standalone',

  // Add this block to ignore type errors during build
  typescript: {
    ignoreBuildErrors: true,
  },

};
