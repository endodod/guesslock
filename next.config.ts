import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  output: "standalone",
  poweredByHeader: false,
  // Two root layouts (game, admin): URLs that match no route get app/global-not-found.tsx.
  experimental: { globalNotFound: true },
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
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // No framing, no plugins, no foreign form targets or <base> hijacks. (Scripts aren't restricted here: the
          // framework's inline bootstrap would need nonces.)
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
