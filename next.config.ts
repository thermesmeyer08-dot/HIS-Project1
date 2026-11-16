import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Private, per-user CRM: every page is dynamic, so we use the classic
  // request-time rendering model rather than Cache Components.
  cacheComponents: false,
  experimental: {
    serverActions: { bodySizeLimit: "5mb" }, // CSV imports
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
