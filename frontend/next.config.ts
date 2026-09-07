/** @type {import('next').NextConfig} */
const nextConfig = {
  // Rewrites: proxy API calls to FastAPI backend
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000"}/api/:path*`,
      },
    ];
  },
  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000",
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws",
    NEXT_PUBLIC_APP_VERSION: "0.1.0",
  },
};

module.exports = nextConfig;
