// The Cache: one team of a real high-rank match (the Omens harvest, src/lib/omens/harvest.ts) and its six final
// inventories. Match each inventory to its hero. A submission assigns all six at once; the matched ones lock in.
// Hard mode leaves some items of every inventory blank and hides the net worth.
import type { GameData } from "../context";
import { SealedError, SkipCandidate, type ModeImpl } from "../mode";
import type { MatchTimeline, Team } from "../../omens/types";
import type { Rng } from "../../rng";

/** Each inventory needs this many known shop items; fewer and it can't be told apart fairly. */
export const CACHE_MIN_ITEMS = 6;
/** Shorter matches are treated as abandoned or a stomp too early to tell. */
export const CACHE_MIN_DURATION = 15 * 60;
/** Hard mode: about this share of every inventory is blank, but at least CACHE_HARD_KEEP items stay. */
const HARD_SHARE = 0.4;
const CACHE_HARD_KEEP = 4;
const CACHE_SOULS = [100, 75, 50, 25];

type Item = { name: string; image: string | null; slot: string };
type Inventory = { heroId: number; items: Item[]; souls: number; /** Indices blank in hard mode. */ hide: number[] };
type CacheClue = {
  matchId: number; team: Team;
  heroes: { id: string; name: string; image: string | null }[];
  /** Shuffled order: the player sees them as Inventory 1-6. */
  inventories: Inventory[];
};

/** A player's shop items at the end of the match (kept, not sold or upgraded away), by slot, in purchase order. */
export function finalInventory(p: MatchTimeline["players"][number], data: Pick<GameData, "item">, end: number): Item[] {
  const slotOrder = { weapon: 0, vitality: 1, spirit: 2 } as Record<string, number>;
  return p.items
    .filter((i) => i.sold === 0 || i.sold > end)
    .map((i) => ({ i, d: data.item(i.id) }))
    .filter((x): x is { i: typeof x.i; d: NonNullable<typeof x.d> } => !!x.d)
    .sort((a, b) => (slotOrder[a.d.src.slot] ?? 3) - (slotOrder[b.d.src.slot] ?? 3) || a.i.t - b.i.t)
    .map(({ d }) => ({ name: d.name, image: d.image, slot: d.src.slot }));
}

/** Why a team can't be a puzzle, or null when it can. */
export function teamProblem(tl: MatchTimeline, team: Team, data: Pick<GameData, "hero" | "item">): string | null {
  if (tl.duration < CACHE_MIN_DURATION) return "match too short";
  const players = tl.players.filter((p) => p.team === team);
  if (players.length !== 6) return "incomplete team";
  if (new Set(players.map((p) => p.heroId)).size !== 6) return "duplicate heroes";
  if (players.some((p) => !data.hero(p.heroId)?.icon)) return "unknown hero";
  const invs = players.map((p) => finalInventory(p, data, tl.duration));
  if (invs.some((i) => i.length < CACHE_MIN_ITEMS)) return "inventory too small";
  // Two inventories with the same items can't be told apart.
  const keys = invs.map((i) => i.map((x) => x.name).sort().join("|"));
  if (new Set(keys).size !== keys.length) return "duplicate inventories";
  return null;
}

function hideFor(n: number, rng: Rng): number[] {
  const hide = Math.min(Math.round(n * HARD_SHARE), n - CACHE_HARD_KEEP);
  return hide > 0 ? rng.shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, hide).sort((a, b) => a - b) : [];
}

/** Ids of the heroes in a submission ("id,id,id,id,id,id", one per inventory in shown order). */
const parse = (guess: string) => guess.split(",").map((s) => s.trim());

export const cache: ModeImpl<CacheClue> = {
  mode: "cache",
  hard: true,
  // The pool is the harvested matches, not game data: one candidate a day, the match is picked in build().
  selfPicked: true,
  candidates: () => [{ answerId: "match", ref: 0 }],
  async build(_c, { data, rng, matches, recent = [] }) {
    const timelines = (await matches?.()) ?? [];
    if (!timelines.length) throw new SealedError("no harvested match yet");
    const used = new Set(recent);
    const options = timelines
      .flatMap((tl) => (["amber", "sapphire"] as Team[]).map((team) => ({ tl, team, key: `${tl.matchId}:${team}` })))
      .filter((o) => !teamProblem(o.tl, o.team, data))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
    const fresh = options.filter((o) => !used.has(o.key));
    if (!options.length) throw new SkipCandidate("no harvested team with complete inventories");
    const { tl, team, key } = rng.pick(fresh.length ? fresh : options);
    const players = rng.shuffle(tl.players.filter((p) => p.team === team));
    const inventories: Inventory[] = players.map((p) => {
      const items = finalInventory(p, data, tl.duration);
      const souls = p.netWorth.at(-1) ?? 0;
      return { heroId: p.heroId, items, souls, hide: hideFor(items.length, rng) };
    });
    const heroes = rng.shuffle(players).map((p) => {
      const h = data.hero(p.heroId)!;
      return { id: String(h.id), name: h.name, image: h.icon };
    });
    const label = `${team === "amber" ? "Amber" : "Sapphire"} team`;
    return {
      v: 1, mode: "cache", key,
      answer: { id: key, name: `${label}, match ${tl.matchId}`, image: null },
      correctIds: [inventories.map((i) => String(i.heroId)).join(",")],
      leakTerms: [],
      hints: {},
      clue: { matchId: tl.matchId, team, heroes, inventories },
    };
  },
  clue: (p, _wrong, done, opts = {}, rows = []) => {
    const last = rows.at(-1);
    const answer = p.clue.inventories.map((i) => String(i.heroId));
    const locked = done ? answer : answer.map((id, i) => (last?.tiles?.[i]?.result === "match" ? id : null));
    return {
      kind: "cache",
      team: p.clue.team === "amber" ? "Amber" : "Sapphire",
      heroes: p.clue.heroes,
      inventories: p.clue.inventories.map((inv) => ({
        items: inv.items.map((it, i) => (opts.hard && !done && inv.hide.includes(i) ? null : it)),
        souls: opts.hard && !done ? null : inv.souls,
      })),
      locked,
    };
  },
  judge(p, guess, rows) {
    const ids = parse(guess);
    const team = new Set(p.clue.heroes.map((h) => h.id));
    if (ids.length !== team.size || new Set(ids).size !== ids.length || ids.some((id) => !team.has(id))) {
      return { rejected: "Give every inventory a different hero." };
    }
    // Inventories already matched stay matched: a submission can't move them.
    const prev = rows.at(-1);
    const answer = p.clue.inventories.map((i) => String(i.heroId));
    if (prev?.tiles?.some((t, i) => t.result === "match" && ids[i] !== answer[i])) return { rejected: "Matched inventories stay as they are." };
    const name = (id: string) => p.clue.heroes.find((h) => h.id === id)!.name;
    const tiles = ids.map((id, i) => ({ key: String(i + 1), display: name(id), result: id === answer[i] ? ("match" as const) : ("miss" as const) }));
    const hits = tiles.filter((t) => t.result === "match").length;
    const correct = hits === answer.length;
    return { row: { id: ids.join(","), name: `${hits} / ${answer.length} matched`, icon: null, correct, tiles }, wrong: !correct };
  },
  solved: (_p, rows) => rows.some((r) => r.correct),
  souls: (_p, r) => (r.won ? CACHE_SOULS[Math.min(r.wrong, CACHE_SOULS.length - 1)] : 0),
  displayed: (p) => p.clue.inventories.flatMap((i) => i.items.map((x) => x.name)),
};
