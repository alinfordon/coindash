/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ["mongoose", "node-binance-api", "node-cron"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
