// Stateless Séance play: (frozen board, submissions[]) -> view. Like the other locks, the client
// keeps only its submissions and the server recomputes everything, so the memberships and labels of
// groups that aren't solved yet never reach the browser.
import type { LockDef } from "@/locks.config";
import type { PuzzleRow } from "../engine/play";
import { SEANCE_HINT_AFTER, SEANCE_MISTAKES, tableSouls } from "./scoring";
import { HINT_ENTRY, type GroupView, type Rank, type SeanceGroup, type SeancePayload, type SeanceView, type SubmissionResult } from "./types";

/** Parses one stored submission ("id,id,id,id"); null when it isn't 4 distinct ids. */
export function parseSubmission(entry: string): number[] | null {
  const ids = String(entry).split(",").map((s) => Number(s.trim()));
  if (ids.length !== 4 || ids.some((n) => !Number.isInteger(n) || n <= 0) || new Set(ids).size !== 4) return null;
  return ids;
}

/** Canonical key of a submission (order doesn't matter for repeats). */
export const submissionKey = (ids: number[]) => [...ids].sort((a, b) => a - b).join(",");

/**
 * Replays a table's entries against its frozen board. Returns the view and the accepted entries
 * (the canonical list the client and the account store: repeats and invalid picks dropped).
 */
export function evaluateSeance(
  lock: LockDef, row: PuzzleRow, number: number, entries: string[],
): { view: SeanceView; accepted: string[] } {
  const table = lock.table!.kind;
  const hintDef = { after: SEANCE_HINT_AFTER, available: false, used: false };
  const base = { slug: lock.slug, date: row.date, number, table, maxMistakes: SEANCE_MISTAKES };
  if (row.sealed) {
    const view: SeanceView = {
      ...base, status: "sealed", sealedReason: row.sealedReason ?? undefined, heroes: [], groups: [], history: [],
      mistakes: 0, hint: hintDef, hintsUsed: 0,
    };
    return { view, accepted: [] };
  }
  const p = row.payload as SeancePayload;
  const onBoard = new Set(p.heroes.map((h) => h.id));
  const heroById = new Map(p.heroes.map((h) => [h.id, h]));
  const rankOf = new Map<number, Rank>();
  for (const g of p.groups) for (const h of g.members) rankOf.set(h, g.rank);

  const solved: SeanceGroup[] = [];
  const solvedHeroes = new Set<number>();
  const seen = new Set<string>();
  const history: SeanceView["history"] = [];
  const accepted: string[] = [];
  let mistakes = 0;
  let hintRank: Rank | null = null;
  const finished = () => solved.length === p.groups.length || mistakes >= SEANCE_MISTAKES;

  for (const raw of entries.slice(0, 40)) {
    if (finished()) break;
    const entry = String(raw).trim();
    if (entry === HINT_ENTRY) {
      // One hint per table: the easiest group that isn't solved yet, once 2 mistakes are made.
      if (hintRank !== null || mistakes < SEANCE_HINT_AFTER) continue;
      hintRank = p.groups.find((g) => !solved.includes(g))!.rank;
      accepted.push(HINT_ENTRY);
      continue;
    }
    const ids = parseSubmission(entry);
    // Invalid picks (not on the board, already solved) are ignored; repeats are rejected without a penalty.
    if (!ids || ids.some((id) => !onBoard.has(id) || solvedHeroes.has(id))) continue;
    const key = submissionKey(ids);
    if (seen.has(key)) continue;
    seen.add(key);
    accepted.push(ids.join(","));

    let best: SeanceGroup | null = null;
    let overlap = 0;
    for (const g of p.groups) {
      if (solved.includes(g)) continue;
      const n = ids.filter((id) => g.members.includes(id)).length;
      if (n > overlap) { overlap = n; best = g; }
    }
    let result: SubmissionResult;
    if (overlap === 4 && best) {
      solved.push(best);
      best.members.forEach((h) => solvedHeroes.add(h));
      result = "correct";
    } else {
      mistakes++;
      result = overlap === 3 ? "one-away" : "wrong";
    }
    history.push({ ids, result });
  }

  const won = solved.length === p.groups.length;
  const lost = !won && mistakes >= SEANCE_MISTAKES;
  const done = won || lost;
  const hintsUsed = hintRank !== null ? 1 : 0;
  const hintGroup = hintRank !== null ? p.groups.find((g) => g.rank === hintRank) : undefined;
  const groupView = (g: SeanceGroup, found: boolean): GroupView => ({
    rank: g.rank, label: g.label, explanation: g.explanation, found,
    members: g.members.map((id) => heroById.get(id) ?? { id, name: `#${id}`, image: null }),
  });

  const groups = solved.map((g) => groupView(g, true));
  if (done) for (const g of p.groups) if (!solved.includes(g)) groups.push(groupView(g, false));

  const view: SeanceView = {
    ...base,
    status: won ? "won" : lost ? "lost" : "playing",
    heroes: p.heroes,
    groups,
    history,
    mistakes,
    hint: {
      after: SEANCE_HINT_AFTER,
      available: !done && hintRank === null && mistakes >= SEANCE_HINT_AFTER,
      used: hintRank !== null,
      ...(hintGroup ? { label: hintGroup.label } : {}),
    },
    hintsUsed,
    ...(done
      ? {
          share: history.map((h) => h.ids.map((id) => rankOf.get(id)!)),
          souls: tableSouls({ won, mistakes, hints: hintsUsed, groupsFound: solved.length }),
        }
      : {}),
  };
  return { view, accepted };
}

/**
 * Leak check: plays a table the way a player would (nothing solved; one group solved plus a wrong
 * and a one-away pick) and reports any label, explanation or membership of an unsolved group
 * that appears in what the server would send.
 */
export function seanceLeaks(lock: LockDef, row: PuzzleRow): string[] {
  const p = row.payload as SeancePayload;
  const out: string[] = [];
  const [first, second, third] = p.groups;
  // A wrong pick (one hero from each of the first three groups + one more) and a one-away pick.
  const wrong = [second.members[0], third.members[0], p.groups[3].members[0], second.members[1]].join(",");
  const oneAway = [...second.members.slice(0, 3), third.members[1]].join(",");
  const scenarios: { name: string; entries: string[]; solved: SeanceGroup[] }[] = [
    { name: "start", entries: [], solved: [] },
    { name: "one solved", entries: [first.members.join(","), wrong, oneAway], solved: [first] },
  ];
  for (const s of scenarios) {
    const { view } = evaluateSeance(lock, row, 0, s.entries);
    const json = JSON.stringify(view);
    for (const g of p.groups) {
      if (s.solved.includes(g)) continue;
      if (json.includes(JSON.stringify(g.label))) out.push(`${s.name}: label "${g.label}" of an unsolved group is sent`);
      if (g.explanation && json.includes(JSON.stringify(g.explanation))) out.push(`${s.name}: explanation of "${g.label}" is sent`);
    }
    const sentGroups = view.groups.map((g) => g.rank);
    const unsolvedSent = sentGroups.filter((r) => !s.solved.some((g) => g.rank === r));
    if (unsolvedSent.length) out.push(`${s.name}: members of unsolved groups (ranks ${unsolvedSent.join(", ")}) are sent`);
    if (view.share) out.push(`${s.name}: share grid (true group colors) sent before the table is finished`);
    if (/"(rank|categoryId|difficulty)"/.test(JSON.stringify({ heroes: view.heroes, history: view.history }))) out.push(`${s.name}: tiles or history carry group data`);
  }
  return out;
}
