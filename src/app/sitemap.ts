import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

// The public pages worth indexing; lock pages change every day and are reached from the home page.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = config.siteUrl.startsWith("http") ? config.siteUrl : `https://${config.siteUrl}`;
  return [
    { path: "", priority: 1, changeFrequency: "daily" as const },
    { path: "/how-to-play", priority: 0.6, changeFrequency: "monthly" as const },
    { path: "/hall", priority: 0.5, changeFrequency: "hourly" as const },
    { path: "/archive", priority: 0.5, changeFrequency: "daily" as const },
    { path: "/endless", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/about", priority: 0.3, changeFrequency: "monthly" as const },
  ].map(({ path, ...rest }) => ({ url: `${site}${path}`, ...rest }));
}
