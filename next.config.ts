import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  output: "standalone",
  poweredByHeader: false,
  // Bundled API backup (data/api-backup, see `npm run backup`) read at runtime by sync/generation.
  outputFileTracingIncludes: {
    "/api/cron/*": ["./data/api-backup/**", "./data/omens-seed.json.gz"],
    "/admin/*": ["./data/api-backup/**", "./data/omens-seed.json.gz"],
    "/admin/**": ["./data/api-backup/**", "./data/omens-seed.json.gz"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
