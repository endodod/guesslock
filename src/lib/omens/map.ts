// Minimap data for The Omens (server only): mirrored image + objective marker positions.
import { fetchMap } from "../deadlock/api";
import { loadSnapshot } from "../deadlock/snapshots";
import { mediaUrl } from "../media";

export type OmenMapMeta = {
  image: string | null;
  /** Objective key (e.g. "team0_tier1_1") -> [left, top] (0..1). */
  objectives: Record<string, [number, number]>;
};

type RawMap = { images?: { minimap?: string }; objective_positions?: Record<string, { left_relative: number; top_relative: number }> };

export async function getMapMeta(): Promise<OmenMapMeta> {
  const snap = await loadSnapshot("assets-map", Infinity);
  const raw = ((snap?.data as RawMap | undefined) ?? ((await fetchMap("snapshot-any-age").catch(() => null)) as RawMap | null)) ?? {};
  return {
    image: mediaUrl(raw.images?.minimap),
    objectives: Object.fromEntries(Object.entries(raw.objective_positions ?? {}).map(([k, v]) => [k, [v.left_relative, v.top_relative]])),
  };
}
