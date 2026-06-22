/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The Composio SDK is server-only (used in API routes); don't bundle it.
    serverComponentsExternalPackages: ['@composio/core'],
  },
};

module.exports = nextConfig;
