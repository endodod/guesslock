// Server-only client for api.deadlock-api.com. The browser never calls the API directly.
import { z } from "zod";
import { config } from "../config";
import { HeroStatsRowSchema, ItemStatsRowSchema, SteamInfoSchema } from "./schemas";
import { loadSnapshot, saveSnapshot } from "./snapshots";

/** Request headers for deadlock-api (the API key, when configured, raises rate limits). */
export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { accept: "application/json", "user-agent": "guesslock/1.0 (+https://guesslock.paulkuehn.ch)", ...(config.apiKey ? { "x-api-key": config.apiKey } : {}), ...extra };
}

/** How a call behaves when the API is down: "none" rethrows, "snapshot" returns the stored copy. */
export type BackupMode = "none" | "snapshot" | "snapshot-any-age";

/**
 * GET JSON from the API. Successful responses are stored under `key` (outage backup); with
 * `backup` set, a failed call returns the last stored copy instead of throwing.
 */
async function getJson(
  path: string,
  { key, backup = "none", timeoutMs = 45000, retries = 2 }: { key: string; backup?: BackupMode; timeoutMs?: number; retries?: number },
): Promise<unknown> {
  try {
    const data = await fetchJson(path, { timeoutMs, retries });
    await saveSnapshot(key, path, data);
    return data;
  } catch (e) {
    if (backup === "none") throw e;
    const snap = await loadSnapshot(key, backup === "snapshot-any-age" ? Infinity : undefined);
    if (!snap) throw e;
    console.warn(`[api] ${key} unavailable (${(e as Error).message}); using ${snap.source} backup from ${snap.fetchedAt.toISOString()}`);
    return snap.data;
  }
}

/** Raw GET without the snapshot layer (per-match data is cached by its own tables). */
export async function fetchJson(path: string, { timeoutMs = 45000, retries = 2 }: { timeoutMs?: number; retries?: number } = {}): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${config.apiBase}${path}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: apiHeaders(),
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

export async function fetchHeroes(backup: BackupMode = "none"): Promise<unknown[]> {
  const data = await getJson("/v1/assets/heroes?only_active=true&language=english", { key: "assets-heroes", backup });
  if (!Array.isArray(data)) throw new Error("heroes: expected an array");
  return data;
}

export async function fetchItems(backup: BackupMode = "none"): Promise<unknown[]> {
  const data = await getJson("/v1/assets/items?language=english", { key: "assets-items", backup });
  if (!Array.isArray(data)) throw new Error("items: expected an array");
  return data;
}

export async function fetchClientVersion(backup: BackupMode = "none"): Promise<number | null> {
  try {
    return SteamInfoSchema.parse(await getJson("/v1/assets/steam-info", { key: "assets-steam-info", backup })).client_version;
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

/**
 * Per-hero item purchase counts over a recent window and a mid-to-high rank filter.
 * Falls back to the last stored snapshot when the API is down, so The Belongings keeps generating.
 */
export async function fetchHeroItemStats(now = new Date()): Promise<HeroItemStats> {
  const min = Math.floor(now.getTime() / 1000) - config.analyticsDays * 86400;
  const q = `min_unix_timestamp=${min}&min_average_badge=${config.analyticsMinBadge}&game_mode=normal`;
  const [itemRows, heroRows] = await Promise.all([
    getJson(`/v1/analytics/item-stats?bucket=hero&${q}`, { key: "analytics-item-stats", backup: "snapshot", timeoutMs: 90000 }),
    getJson(`/v1/analytics/hero-stats?${q}`, { key: "analytics-hero-stats", backup: "snapshot", timeoutMs: 90000 }),
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
