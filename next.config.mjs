/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["markit-ai", "mupdf"],
  },
};
export default nextConfig;
