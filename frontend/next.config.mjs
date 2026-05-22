/** @type {import('next').NextConfig} */
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api").replace(
  /\/$/,
  "",
);

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  async rewrites() {
    return [
      // Rule 1: paths that already carry a trailing slash — preserve it explicitly.
      // ":path*" captures everything before the final "/", so we re-append it.
      {
        source: "/api/:path*/",
        destination: `${apiBaseUrl}/:path*/`,
      },
      // Rule 2: paths without a trailing slash (fallback).
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
