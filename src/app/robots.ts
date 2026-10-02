import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

// The game is public; the admin, the API and the account pages are not for crawlers.
export default function robots(): MetadataRoute.Robots {
  const site = config.siteUrl.startsWith("http") ? config.siteUrl : `https://${config.siteUrl}`;
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/account", "/auth/"] }], host: site };
}
