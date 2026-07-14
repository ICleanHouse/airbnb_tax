import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api").replace(
  /\/$/,
  "",
);

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  devIndicators: false,

  allowedDevOrigins: ["127.0.0.1"],
  
  async rewrites() {
    return [
      // Rule 1: paths that already carry a trailing slash — preserve it explicitly.
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

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
