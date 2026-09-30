// Clip -> ability matching by filename (the index has no ability IDs). Pure and unit-tested.
// The automatic pass only suggests: an admin approves every clip before it can be used.

export type SoundRole = "cast" | "impact" | "loop" | "other";
export const SOUND_ROLES: SoundRole[] = ["cast", "impact", "loop", "other"];

export type AbilityRef = { id: number; className: string; name: string; slot: number };

/** Minimum score for a clip to be suggested for an ability. */
export const MATCH_THRESHOLD = 0.5;
/** Clips shorter than this are excluded by default (clicks, ticks). */
export const MIN_CLIP_MS = 250;

const TOKEN_STOP = new Set([
  "ability", "abilities", "citadel", "the", "of", "and", "to", "a", "an", "lo", "ult", "ultimate",
  "hero", "new", "old", "mod", "lyr", "sfx",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => (/^[a-z]+\d+$/.test(t) && !/^a\d$/.test(t) && !/^t\d$/.test(t) ? t.replace(/\d+$/, "") : t))
    .filter((t) => t && !/^\d+$/.test(t));
}

/** Tokens that name an ability: from its class_name (minus prefixes and codenames) and display name. */
export function abilityTokens(a: AbilityRef, codenames: string[]): { cls: string[]; name: string[] } {
  const drop = new Set([...TOKEN_STOP, ...codenames]);
  const clean = (ts: string[]) => [...new Set(ts.filter((t) => t.length >= 3 && !drop.has(t)))];
  return { cls: clean(tokenize(a.className)), name: clean(tokenize(a.name)) };
}

/** A clip path relative to its hero folder, tokenized. Slot prefixes (a1…a4) are pulled out. */
export function clipTokens(path: string, codenames: string[]): { tokens: string[]; squashed: string; slots: number[] } {
  const rel = path.split("/").slice(2).join("/"); // drop "abilities/<folder>"
  const all = tokenize(rel);
  const slots = [...new Set(all.filter((t) => /^a[1-4]$/.test(t)).map((t) => Number(t[1])))];
  const drop = new Set(codenames);
  const tokens = all.filter((t) => !/^a[1-4]$/.test(t) && !drop.has(t));
  return { tokens, squashed: tokens.join(""), slots };
}

function has(clip: { tokens: string[]; squashed: string }, t: string): boolean {
  // Exact token, or a compound spelled without separators ("siphonlife", "clustergrenade").
  return clip.tokens.includes(t) || (t.length >= 4 && clip.squashed.includes(t));
}

/**
 * 0…1.25: the larger share of class-name or display-name tokens found in the clip path, +0.25 when
 * the clip carries this ability's slot prefix (a1…a4), −0.25 when it carries another slot's prefix.
 */
export function scoreClip(path: string, ability: AbilityRef, codenames: string[]): number {
  const clip = clipTokens(path, codenames);
  const { cls, name } = abilityTokens(ability, codenames);
  const frac = (ts: string[]) => (ts.length ? ts.filter((t) => has(clip, t)).length / ts.length : 0);
  let score = Math.max(frac(cls), frac(name));
  if (score === 0) return 0; // a slot prefix alone isn't enough
  if (clip.slots.includes(ability.slot)) score += 0.25;
  else if (clip.slots.length) score -= 0.25;
  return Math.round(score * 1000) / 1000;
}

/** Best ability for a clip, or null when nothing reaches the threshold or the top two tie. */
export function matchClip(path: string, abilities: AbilityRef[], codenames: string[]): { abilityId: number | null; score: number } {
  const scored = abilities
    .map((a) => ({ a, s: scoreClip(path, a, codenames) }))
    .sort((x, y) => y.s - x.s);
  const [best, second] = scored;
  if (!best || best.s < MATCH_THRESHOLD) return { abilityId: null, score: best?.s ?? 0 };
  if (second && second.s === best.s) return { abilityId: null, score: best.s };
  return { abilityId: best.a.id, score: best.s };
}

const ROLE_WORDS: [SoundRole, RegExp][] = [
  ["loop", /^(lp|loop|looping|channel|duration)$/],
  ["impact", /^(impact|impacts|hit|hits|explo|explode|explosion|exp|detonate|land|landing|burst)$/],
  ["cast", /^(cast|throw|fire|shoot|activate|start|use|launch|swing|slash)$/],
];

/** Role from the clip name: whichever role word comes last wins ("cast_lp" is a loop, "cast_impact" an impact). */
export function guessRole(path: string): SoundRole {
  const tokens = tokenize(path.split("/").slice(2).join("/"));
  let role: SoundRole = "other";
  let at = -1;
  tokens.forEach((t, i) => {
    for (const [r, re] of ROLE_WORDS) if (re.test(t) && i >= at) { role = r; at = i; }
  });
  return role;
}

/** Why a clip is excluded by default (before any measurement), or null. */
export function skipReason(path: string): string | null {
  const tokens = tokenize(path.split("/").pop() ?? "");
  if (tokens.some((t) => /^whiz+by$|^whoosh$|^whiz$/.test(t))) return "whiz-by";
  if (tokens[tokens.length - 1] === "end" || tokens[tokens.length - 1] === "expire") return "end stinger";
  return null;
}

const FIRE_WORDS = new Set(["fire", "shoot", "shot", "primaryweapon"]);
const NOT_FIRE = new Set([
  "reload", "whizby", "whiz", "dry", "empty", "clipin", "tail", "tails", "impact", "hit", "end", "packaway", "prepare", "zoom", "alt",
]);

/**
 * The hero's gun in a weapons folder: `*_weapon_fire_*`, `*_wpn_shoot_*`, `fire/01`, `*_weapon_shot_*`,
 * Bebop's `primaryweapon` loop. Never reloads, whiz-bys, impacts or dry fire.
 */
export function isWeaponFire(path: string): boolean {
  const tokens = tokenize(path.split("/").slice(2).join("/"));
  return tokens.some((t) => FIRE_WORDS.has(t)) && !tokens.some((t) => NOT_FIRE.has(t));
}
