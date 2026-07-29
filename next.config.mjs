/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["markit-ai", "mupdf"],
    instrumentationHook: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Node.js built-ins imported through the instrumentation chain
      // need to be externalized (not bundled by webpack).
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "child_process",
      ];
    }
    return config;
  },
};
export default nextConfig;
