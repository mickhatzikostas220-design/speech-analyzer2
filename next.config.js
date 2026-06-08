/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow large request bodies for any route that still buffers uploads server-side
    serverBodySizeLimit: '500mb',
  },
};

module.exports = nextConfig;
