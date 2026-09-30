// Server-only client for api.deadlock-api.com. The browser never calls the API directly.
import { z } from "zod";
import { config } from "../config";
import { HeroStatsRowSchema, ItemStatsRowSchema, SteamInfoSchema } from "./schemas";

async function getJson(path: string, { timeoutMs = 45000, retries = 2 } = {}): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${config.apiBase}${path}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json", "user-agent": "guesslock/1.0" },
        cache: "no-store",
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} for ${url}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { fatal: true });
      return await res.json();
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function fetchHeroes(): Promise<unknown[]> {
  const data = await getJson("/v1/assets/heroes?only_active=true&language=english");
  if (!Array.isArray(data)) throw new Error("heroes: expected an array");
  return data;
}

export async function fetchItems(): Promise<unknown[]> {
  const data = await getJson("/v1/assets/items?language=english");
  if (!Array.isArray(data)) throw new Error("items: expected an array");
  return data;
}

export async function fetchClientVersion(): Promise<number | null> {
  try {
    return SteamInfoSchema.parse(await getJson("/v1/assets/steam-info")).client_version;
  } catch {
    return null;
  }
}

export type HeroItemStats = {
  /** heroId -> total matches in the window */
  heroMatches: Map<number, number>;
  /** heroId -> itemId -> matches where the item was bought */
  itemMatches: Map<number, Map<number, number>>;
};

/** Per-hero item purchase counts over a recent window and a mid-to-high rank filter. */
export async function fetchHeroItemStats(now = new Date()): Promise<HeroItemStats> {
  const min = Math.floor(now.getTime() / 1000) - config.analyticsDays * 86400;
  const q = `min_unix_timestamp=${min}&min_average_badge=${config.analyticsMinBadge}&game_mode=normal`;
  const [itemRows, heroRows] = await Promise.all([
    getJson(`/v1/analytics/item-stats?bucket=hero&${q}`, { timeoutMs: 90000 }),
    getJson(`/v1/analytics/hero-stats?${q}`, { timeoutMs: 90000 }),
  ]);
  const items = z.array(ItemStatsRowSchema).parse(itemRows);
  const heroes = z.array(HeroStatsRowSchema).parse(heroRows);
  const heroMatches = new Map(heroes.map((h) => [h.hero_id, h.matches]));
  const itemMatches = new Map<number, Map<number, number>>();
  for (const r of items) {
    if (!itemMatches.has(r.bucket)) itemMatches.set(r.bucket, new Map());
    itemMatches.get(r.bucket)!.set(r.item_id, r.matches);
  }
  if (heroMatches.size === 0 || itemMatches.size === 0) throw new Error("analytics: empty response");
  return { heroMatches, itemMatches };
}
