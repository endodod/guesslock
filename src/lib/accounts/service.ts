// Server-side account data: profiles, recorded plays, stats, local-history import, export.
import { db } from "../db";
import { getLock, LOCKS } from "@/locks.config";
import { evaluate, type PuzzleRow } from "../engine/play";
import type { PlayView } from "../engine/types";
import { todayDate, numberFor, isDay } from "../day";
import { getCatalog, lookupFor } from "../engine/catalog";
import type { SessionUser } from "../auth/server";
import { mergeGuesses, nameKey, nextSource, streakFromDays, validateDisplayName } from "./rules";
import { omenOf } from "@/locks.config";
import { parseAnswer } from "../omens/serve";
import { scoreOmen } from "../omens/scoring";
import type { OmenAnswer, OmenPayload } from "../omens/types";
import type { Prisma } from "@/generated/prisma/client";
import { boxOf, isSeance } from "@/locks.config";
import { evaluateSeance } from "../seance/play";
import type { SeanceView } from "../seance/types";
import { foldPlays } from "../seance/scoring";
import { tablesInPlay } from "../seance/library";

// ───────────── profiles ─────────────

/** Users whose profile this server instance has already confirmed: the hot paths (every guess) skip the lookup. */
const confirmedProfiles = new Set<string>();

/** Like ensureProfile, without the database round trip once this instance has seen the profile. */
async function ensureProfileOnce(user: SessionUser): Promise<void> {
  if (confirmedProfiles.has(user.id)) return;
  await ensureProfile(user);
  if (confirmedProfiles.size > 5000) confirmedProfiles.clear();
  confirmedProfiles.add(user.id);
}

/**
 * Where a play's database write runs. Given `defer` (a route handler's `after`), the response goes out first and the
 * write follows; failures are logged. Without it the caller waits for the write.
 */
export type Defer = (task: () => Promise<void>) => void;
function writeLater(defer: Defer | undefined, task: () => Promise<void>): Promise<void> | void {
  if (!defer) return task();
  defer(() => task().catch((e) => console.error("[play] deferred write failed", e)));
}

/** Profile for a signed-in user, created on first use from the sign-up name. */
export async function ensureProfile(user: SessionUser) {
  const existing = await db.profile.findUnique({ where: { userId: user.id } });
  if (existing) return existing;
  let base = user.name?.trim() && !validateDisplayName(user.name) ? user.name.trim() : `Keeper ${user.id.slice(0, 5)}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 16)} ${Math.floor(Math.random() * 900 + 100)}`;
    try {
      return await db.profile.create({ data: { userId: user.id, displayName: candidate, nameKey: nameKey(candidate) } });
    } catch (e) {
      if (!String(e).includes("Unique constraint")) throw e;
      base = candidate;
    }
  }
  throw new Error("Could not create a profile name");
}

export async function setDisplayName(userId: string, raw: string): Promise<string | null> {
  const err = validateDisplayName(raw);
  if (err) return err;
  const name = raw.trim();
  const taken = await db.profile.findUnique({ where: { nameKey: nameKey(name) } });
  if (taken && taken.userId !== userId) return "That name is taken.";
  await db.profile.update({ where: { userId }, data: { displayName: name, nameKey: nameKey(name) } });
  return null;
}

// ───────────── recording plays ─────────────

export type RecordedPlay = {
  view: PlayView;
  guesses: string[];
  bonus?: string;
  /** Counts for leaderboards: played live, guess by guess, on the puzzle's own day. */
  ranked: boolean;
  conflict: boolean;
};

/**
 * Evaluates a guess request for a signed-in player and records it. Guesses are append-only,
 * finished plays are frozen.
 */
export async function playAsUser(
  user: SessionUser,
  row: PuzzleRow & { date: string },
  slug: string,
  incoming: string[],
  bonusIn: string | undefined,
  giveUpIn = false,
  defer?: Defer,
): Promise<RecordedPlay> {
  const lock = getLock(slug)!;
  // Independent lookups run together (each is a network round trip).
  const [, catalog, existing] = await Promise.all([
    ensureProfileOnce(user),
    getCatalog(),
    db.play.findUnique({ where: { userId_date_lock: { userId: user.id, date: row.date, lock: slug } } }),
  ]);
  const lookup = lookupFor(catalog, lock.guess);
  const number = numberFor(row.date);
  const finished = existing && existing.status !== "playing";

  const merged = finished ? { guesses: existing.guesses, added: 0, conflict: false } : mergeGuesses(existing?.guesses ?? [], incoming);
  const bonus = existing?.bonus ?? bonusIn;
  // Hard puzzles are their own locks (see HARD_LOCKS), always played hard: nothing to pick, nothing to peek at.
  const hard = !!lock.hardPlay;
  let view = evaluate(lock, row, number, merged.guesses, bonus, lookup, { giveUp: giveUpIn, hard });
  // A finished "lost" play the guesses alone don't explain (tries left, or no try limit) can only be a give-up: keep it given up.
  if (!giveUpIn && finished && existing.status === "lost" && view.status === "playing") view = evaluate(lock, row, number, merged.guesses, bonus, lookup, { giveUp: true, hard });
  if (row.sealed) return { view, guesses: [], ranked: false, conflict: false };
  const archive = existing ? existing.archive : row.date < todayDate();

  const clean = view.rows.map((r) => r.id);
  const bonusPicked = view.bonus?.picked;
  const done = view.status === "won" || view.status === "lost";
  const source = nextSource(existing?.source as "live" | "import" | undefined, merged.added);
  const nothingNew = existing && merged.added === 0 && (existing.bonus ?? undefined) === bonusPicked && (existing.status !== "playing" || !done);

  if (!nothingNew && (clean.length > 0 || bonusPicked)) {
    const data = {
      guesses: clean,
      bonus: bonusPicked ?? null,
      status: view.status === "won" ? "won" : view.status === "lost" ? "lost" : "playing",
      hintsUsed: view.hintsUsed,
      noHints: false,
      souls: done ? view.souls : 0,
      bonusCorrect: !!view.bonus?.correct,
      hard: !!view.hard,
      source,
      finishedAt: done ? (existing?.finishedAt ?? new Date()) : null,
    };
    await writeLater(defer, async () => {
      await db.play.upsert({
        where: { userId_date_lock: { userId: user.id, date: row.date, lock: slug } },
        create: { userId: user.id, date: row.date, lock: slug, archive, ...data },
        update: data,
      });
      if (done) await recomputeStats(user.id);
    });
  }
  return { view, guesses: clean, bonus: bonusPicked, ranked: source === "live" && !archive, conflict: merged.conflict };
}

// ───────────── The Séance ─────────────

/**
 * Records a signed-in Séance table, like playAsUser: submissions are append-only (a hint request is
 * an entry too), finished tables are frozen.
 */
export async function playSeanceAsUser(
  user: SessionUser, row: PuzzleRow & { date: string }, slug: string, incoming: string[], defer?: Defer,
): Promise<{ view: SeanceView; guesses: string[]; ranked: boolean; conflict: boolean }> {
  const lock = getLock(slug)!;
  const [, existing] = await Promise.all([
    ensureProfileOnce(user),
    db.play.findUnique({ where: { userId_date_lock: { userId: user.id, date: row.date, lock: slug } } }),
  ]);
  const finished = existing && existing.status !== "playing";
  const merged = finished ? { guesses: existing.guesses, added: 0, conflict: false } : mergeGuesses(existing?.guesses ?? [], incoming);
  const { view, accepted } = evaluateSeance(lock, row, numberFor(row.date), merged.guesses);
  if (row.sealed) return { view, guesses: [], ranked: false, conflict: false };
  const archive = existing ? existing.archive : row.date < todayDate();
  const done = view.status === "won" || view.status === "lost";
  const source = nextSource(existing?.source as "live" | "import" | undefined, merged.added);
  const nothingNew = existing && merged.added === 0 && (existing.status !== "playing" || !done);
  if (!nothingNew && accepted.length > 0) {
    const data = {
      guesses: accepted,
      status: view.status === "won" ? "won" : view.status === "lost" ? "lost" : "playing",
      hintsUsed: view.hintsUsed, noHints: false, souls: done ? view.souls ?? 0 : 0, source,
      finishedAt: done ? (existing?.finishedAt ?? new Date()) : null,
    };
    await writeLater(defer, async () => {
      await db.play.upsert({
        where: { userId_date_lock: { userId: user.id, date: row.date, lock: slug } },
        create: { userId: user.id, date: row.date, lock: slug, archive, ...data },
        update: data,
      });
      if (done) await recomputeStats(user.id);
    });
  }
  return { view, guesses: accepted, ranked: source === "live" && !archive, conflict: merged.conflict };
}

// ───────────── The Omens ─────────────

/**
 * Records a signed-in Omen lock-in. The first lock-in is final: later submissions (another device)
 * get the recorded answers back. Souls = the Omen score; ranked when played live on its own day.
 */
export async function recordOmen(
  user: SessionUser, row: { date: string; payload: unknown }, slug: string, incoming: OmenAnswer,
): Promise<{ answers: OmenAnswer; ranked: boolean }> {
  await ensureProfile(user);
  const existing = await db.play.findUnique({ where: { userId_date_lock: { userId: user.id, date: row.date, lock: slug } } });
  if (existing?.omen) return { answers: existing.omen as unknown as OmenAnswer, ranked: existing.source === "live" && !existing.archive };
  const payload = row.payload as OmenPayload;
  const souls = scoreOmen(payload.omen, incoming, payload.answer, undefined, payload.snapshot.window).total;
  const archive = row.date < todayDate();
  await db.play.upsert({
    where: { userId_date_lock: { userId: user.id, date: row.date, lock: slug } },
    create: {
      userId: user.id, date: row.date, lock: slug, guesses: [], status: "won", souls, archive, source: "live",
      omen: incoming as unknown as Prisma.InputJsonValue, finishedAt: new Date(),
    },
    update: { omen: incoming as unknown as Prisma.InputJsonValue, status: "won", souls, finishedAt: new Date() },
  });
  await recomputeStats(user.id);
  return { answers: incoming, ranked: !archive };
}

/** The recorded Omen answers of a signed-in player for a day, if any. */
export async function recordedOmen(userId: string, date: string, slug: string): Promise<OmenAnswer | null> {
  const p = await db.play.findUnique({ where: { userId_date_lock: { userId, date, lock: slug } }, select: { omen: true } });
  return (p?.omen as unknown as OmenAnswer | null) ?? null;
}

// ───────────── stats ─────────────

const RANKED = { source: "live", archive: false } as const;

export async function recomputeStats(userId: string) {
  const plays = await db.play.findMany({ where: { userId, ...RANKED, status: { not: "playing" } }, select: { date: true, lock: true, status: true, souls: true } });
  const winDays = plays.filter((p) => p.status === "won").map((p) => p.date);
  const s = streakFromDays(winDays, todayDate());
  // The Séance's four tables count as one box worth their average.
  const inPlay = await tablesInPlay();
  const data = {
    totalSouls: foldPlays(plays, boxOf, inPlay).souls,
    daysUnlocked: s.count,
    currentStreak: s.current,
    bestStreak: s.best,
    lastDay: winDays.sort().at(-1) ?? null,
  };
  await db.userStats.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

// ───────────── sync with a device's local history ─────────────

type LocalRecord = { g: string[]; b?: string; archive?: boolean; o?: unknown; hard?: boolean };

/**
 * Imports a device's local progress into the account (records the server doesn't have yet),
 * re-evaluated against the frozen puzzles; imported plays are unranked. Returns every play
 * of the account so the device can adopt the server state.
 */
export async function syncProgress(user: SessionUser, local: Record<string, Record<string, LocalRecord>>) {
  await ensureProfile(user);
  const today = todayDate();
  const have = new Set(
    (await db.play.findMany({ where: { userId: user.id }, select: { date: true, lock: true } })).map((p) => `${p.date}|${p.lock}`),
  );
  const catalog = await getCatalog();
  let imported = 0;
  for (const [date, locks] of Object.entries(local ?? {}).slice(-400)) {
    if (!isDay(date) || date > today) continue;
    for (const [slug, rec] of Object.entries(locks ?? {})) {
      const lock = getLock(slug);
      if (!lock || have.has(`${date}|${slug}`) || !Array.isArray(rec?.g)) continue;
      const omen = omenOf(lock);
      if (omen ? rec.o === undefined : rec.g.length === 0) continue;
      const row = await db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: slug } } });
      if (!row || row.sealed) continue;
      if (!!lock.box) {
        // A Séance table from this device: re-evaluated against the frozen board, unranked.
        const { view: v, accepted } = evaluateSeance(lock, row, numberFor(date), rec.g.map(String).slice(0, 40));
        if (!accepted.length) continue;
        const done = v.status === "won" || v.status === "lost";
        await db.play.create({
          data: {
            userId: user.id, date, lock: slug, guesses: accepted, status: done ? v.status : "playing", hintsUsed: v.hintsUsed,
            souls: done ? v.souls ?? 0 : 0, archive: !!rec.archive, source: "import", finishedAt: done ? new Date() : null,
          },
        }).catch(() => undefined);
        imported++;
        continue;
      }
      if (omen) {
        // A locked-in Omen from this device: re-scored against the frozen scenario, unranked.
        const answers = parseAnswer(omen, rec.o);
        if (!answers) continue;
        const payload = row.payload as unknown as OmenPayload;
        await db.play.create({
          data: {
            userId: user.id, date, lock: slug, guesses: [], status: "won", souls: scoreOmen(omen, answers, payload.answer, undefined, payload.snapshot.window).total,
            omen: answers as unknown as Prisma.InputJsonValue, archive: !!rec.archive, source: "import", finishedAt: new Date(),
          },
        }).catch(() => undefined);
        imported++;
        continue;
      }
      const guesses = rec.g.map(String).slice(0, 200);
      const view = evaluate(lock, row, numberFor(date), guesses, rec.b, lookupFor(catalog, lock.guess), { hard: !!lock.hardPlay });
      const done = view.status === "won" || view.status === "lost";
      await db.play.create({
        data: {
          userId: user.id, date, lock: slug, guesses: view.rows.map((r) => r.id), bonus: view.bonus?.picked ?? null,
          status: view.status === "won" ? "won" : view.status === "lost" ? "lost" : "playing",
          hintsUsed: view.hintsUsed,
          souls: done ? view.souls : 0,
          bonusCorrect: !!view.bonus?.correct, hard: !!view.hard, archive: !!rec.archive, source: "import",
          finishedAt: done ? new Date() : null,
        },
      }).catch(() => undefined); // raced with a live play: the live one wins
      imported++;
    }
  }
  if (imported) await recomputeStats(user.id);
  return { imported, plays: await accountProgress(user.id) };
}

/** All plays of an account in the local-store shape (date -> slug -> record). */
export async function accountProgress(userId: string) {
  const plays = await db.play.findMany({ where: { userId }, orderBy: { date: "asc" } });
  const puzzles = await db.dailyPuzzle.findMany({
    where: { OR: plays.filter((p) => p.status !== "playing" || isSeance(p.lock)).map((p) => ({ date: p.date, mode: p.lock })) },
    select: { date: true, mode: true, payload: true, sealed: true, sealedReason: true },
  });
  // Séance tables: mistakes aren't a column, so they're recomputed from the frozen board.
  const inPlay = await tablesInPlay();
  const seanceMistakes = new Map<string, number>();
  for (const p of plays) {
    const lock = getLock(p.lock);
    const row = lock?.box ? puzzles.find((x) => x.date === p.date && x.mode === p.lock) : undefined;
    if (lock && row) seanceMistakes.set(`${p.date}|${p.lock}`, evaluateSeance(lock, row, 0, p.guesses).view.mistakes);
  }
  // Omen payloads have no named answer (their `answer` is the prediction key).
  const answers = new Map(puzzles.map((p) => {
    const a = (p.payload as { mode?: string; answer?: { name: string; image: string | null } });
    return [`${p.date}|${p.mode}`, a.mode === "omen" ? undefined : a.answer];
  }));
  const out: Record<string, Record<string, {
    g: string[]; b?: string; o?: unknown; s: string; w: number; h: number; souls: number; bonusCorrect: boolean; archive: boolean;
    ranked: boolean; answer?: { name: string; image: string | null }; at?: number; tables?: number; hard?: boolean;
  }>> = {};
  for (const p of plays) {
    const lock = LOCKS.find((l) => l.slug === p.lock);
    if (!lock) continue;
    const a = answers.get(`${p.date}|${p.lock}`);
    (out[p.date] ??= {})[p.lock] = {
      g: p.guesses, b: p.bonus ?? undefined, o: p.omen ?? undefined, s: p.status,
      w: seanceMistakes.get(`${p.date}|${p.lock}`) ?? (p.status === "won" ? Math.max(0, p.guesses.length - 1) : p.guesses.length),
      h: p.hintsUsed, souls: p.souls, bonusCorrect: p.bonusCorrect, archive: p.archive,
      ranked: p.source === "live" && !p.archive,
      answer: a ? { name: a.name, image: a.image } : undefined,
      at: p.finishedAt?.getTime(),
      ...(p.hard ? { hard: true } : {}),
      ...(lock.box ? { tables: inPlay(p.date, lock.box) } : {}),
    };
  }
  return out;
}

// ───────────── export & deletion ─────────────

export async function exportAccount(user: SessionUser) {
  const [profile, stats, plays] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id } }),
    db.userStats.findUnique({ where: { userId: user.id } }),
    db.play.findMany({ where: { userId: user.id }, orderBy: [{ date: "asc" }, { lock: "asc" }] }),
  ]);
  return { exportedAt: new Date().toISOString(), account: { id: user.id, email: user.email, name: user.name }, profile, stats, plays };
}

/**
 * Deletes a player completely, in one transaction: game data (profile cascades to plays and stats)
 * and the Neon Auth identity (neon_auth.user cascades to its sessions and linked accounts).
 * Managed Auth doesn't expose self-service deleteUser, so the identity row is removed directly.
 */
export async function deleteAccountCompletely(userId: string) {
  confirmedProfiles.delete(userId);
  await db.$transaction([
    db.profile.deleteMany({ where: { userId } }),
    // Their community puzzles go too, with every play and report row keyed by their id.
    db.$executeRaw`DELETE FROM "CommunityPlay" WHERE "puzzleId" IN (SELECT id FROM "CommunityPuzzle" WHERE "authorId" = ${userId}) OR "player" = ${userId}`,
    db.$executeRaw`DELETE FROM "CommunityReport" WHERE "puzzleId" IN (SELECT id FROM "CommunityPuzzle" WHERE "authorId" = ${userId}) OR "userId" = ${userId}`,
    db.communityPuzzle.deleteMany({ where: { authorId: userId } }),
    db.$executeRaw`DELETE FROM neon_auth."user" WHERE id::text = ${userId}`,
  ]);
}
