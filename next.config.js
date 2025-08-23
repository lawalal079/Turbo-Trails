/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Ensure bs58 resolves to CommonJS entry for libraries expecting index.js
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      bs58: require.resolve('bs58/index.js'),
    };

    config.module.rules.push({
      test: /\.(glb|gltf|obj|mtl)$/,
      use: {
        loader: 'file-loader',
        options: {
          publicPath: '/_next/static/models/',
          outputPath: 'static/models/',
        },
      },
    });
    return config;
  },
}

module.exports = nextConfig
