// Heroes whose API entry lacks a field (Rem has no archetype or weapon type yet). Applied before deriving.
export const HERO_FALLBACK: Record<string, { hero_type?: string; gun_tag?: string }> = { Rem: { hero_type: "mystic", gun_tag: "Rapid Fire" } };
