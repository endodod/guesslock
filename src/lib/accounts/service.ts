// Server-side account data: profiles, recorded plays, stats, local-history import, export.
import { db } from "../db";
import { getLock, LOCKS } from "@/locks.config";
import { evaluate, type PuzzleRow } from "../engine/play";
import type { PlayView } from "../engine/types";
import { soulsFor } from "../game/scoring";
import { todayDate, numberFor, isDay } from "../day";
import { getCatalog, lookupFor } from "../engine/catalog";
import type { SessionUser } from "../auth/server";
import { mergeGuesses, nameKey, nextSource, streakFromDays, validateDisplayName } from "./rules";

// ───────────── profiles ─────────────

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
 * finished plays are frozen, and the "no hints" choice is fixed at the first guess.
 */
export async function playAsUser(
  user: SessionUser,
  row: PuzzleRow & { date: string },
  slug: string,
  incoming: string[],
  bonusIn: string | undefined,
  noHintsIn: boolean,
): Promise<RecordedPlay> {
  const lock = getLock(slug)!;
  await ensureProfile(user);
  const catalog = await getCatalog();
  const lookup = lookupFor(catalog, lock.guess);
  const number = numberFor(row.date);
  const existing = await db.play.findUnique({ where: { userId_date_lock: { userId: user.id, date: row.date, lock: slug } } });
  const finished = existing && existing.status !== "playing";

  const merged = finished ? { guesses: existing.guesses, added: 0, conflict: false } : mergeGuesses(existing?.guesses ?? [], incoming);
  const noHints = existing ? existing.noHints : noHintsIn;
  const bonus = existing?.bonus ?? bonusIn;
  const view = evaluate(lock, row, number, merged.guesses, bonus, lookup, { noHints });
  if (row.sealed) return { view, guesses: [], ranked: false, conflict: false };
  const archive = existing ? existing.archive : row.date < todayDate();

  const clean = view.rows.map((r) => r.id);
  const bonusPicked = view.bonus?.picked;
  const done = view.status === "won" || view.status === "lost";
  const source = nextSource(existing?.source as "live" | "import" | undefined, merged.added);
  const nothingNew = existing && merged.added === 0 && (existing.bonus ?? undefined) === bonusPicked;

  if (!nothingNew && (clean.length > 0 || bonusPicked)) {
    const data = {
      guesses: clean,
      bonus: bonusPicked ?? null,
      status: view.status === "won" ? "won" : view.status === "lost" ? "lost" : "playing",
      hintsUsed: view.hintsUsed,
      noHints,
      souls: done ? soulsFor({ won: view.status === "won", guesses: view.rows.length, hintsUsed: view.hintsUsed, bonusCorrect: !!view.bonus?.correct }) : 0,
      bonusCorrect: !!view.bonus?.correct,
      source,
      finishedAt: done ? (existing?.finishedAt ?? new Date()) : null,
    };
    await db.play.upsert({
      where: { userId_date_lock: { userId: user.id, date: row.date, lock: slug } },
      create: { userId: user.id, date: row.date, lock: slug, archive, ...data },
      update: data,
    });
    if (done) await recomputeStats(user.id);
  }
  return { view, guesses: clean, bonus: bonusPicked, ranked: source === "live" && !archive, conflict: merged.conflict };
}

// ───────────── stats ─────────────

const RANKED = { source: "live", archive: false } as const;

export async function recomputeStats(userId: string) {
  const plays = await db.play.findMany({ where: { userId, ...RANKED, status: { not: "playing" } }, select: { date: true, status: true, souls: true } });
  const winDays = plays.filter((p) => p.status === "won").map((p) => p.date);
  const s = streakFromDays(winDays, todayDate());
  const data = {
    totalSouls: plays.reduce((a, p) => a + p.souls, 0),
    daysUnlocked: s.count,
    currentStreak: s.current,
    bestStreak: s.best,
    lastDay: winDays.sort().at(-1) ?? null,
  };
  await db.userStats.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

// ───────────── sync with a device's local history ─────────────

type LocalRecord = { g: string[]; b?: string; archive?: boolean };

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
      if (!lock || have.has(`${date}|${slug}`) || !Array.isArray(rec?.g) || rec.g.length === 0) continue;
      const row = await db.dailyPuzzle.findUnique({ where: { date_mode: { date, mode: slug } } });
      if (!row || row.sealed) continue;
      const guesses = rec.g.map(String).slice(0, 200);
      const view = evaluate(lock, row, numberFor(date), guesses, rec.b, lookupFor(catalog, lock.guess));
      const done = view.status === "won" || view.status === "lost";
      await db.play.create({
        data: {
          userId: user.id, date, lock: slug, guesses: view.rows.map((r) => r.id), bonus: view.bonus?.picked ?? null,
          status: view.status === "won" ? "won" : view.status === "lost" ? "lost" : "playing",
          hintsUsed: view.hintsUsed,
          souls: done ? soulsFor({ won: view.status === "won", guesses: view.rows.length, hintsUsed: view.hintsUsed, bonusCorrect: !!view.bonus?.correct }) : 0,
          bonusCorrect: !!view.bonus?.correct, archive: !!rec.archive, source: "import",
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
    where: { OR: plays.filter((p) => p.status !== "playing").map((p) => ({ date: p.date, mode: p.lock })) },
    select: { date: true, mode: true, payload: true },
  });
  const answers = new Map(puzzles.map((p) => [`${p.date}|${p.mode}`, (p.payload as { answer?: { name: string; image: string | null } }).answer]));
  const out: Record<string, Record<string, {
    g: string[]; b?: string; s: string; w: number; h: number; souls: number; bonusCorrect: boolean; archive: boolean;
    ranked: boolean; answer?: { name: string; image: string | null }; at?: number;
  }>> = {};
  for (const p of plays) {
    const lock = LOCKS.find((l) => l.slug === p.lock);
    if (!lock) continue;
    const a = answers.get(`${p.date}|${p.lock}`);
    (out[p.date] ??= {})[p.lock] = {
      g: p.guesses, b: p.bonus ?? undefined, s: p.status,
      w: p.status === "won" ? Math.max(0, p.guesses.length - 1) : p.guesses.length,
      h: p.hintsUsed, souls: p.souls, bonusCorrect: p.bonusCorrect, archive: p.archive,
      ranked: p.source === "live" && !p.archive,
      answer: a ? { name: a.name, image: a.image } : undefined,
      at: p.finishedAt?.getTime(),
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
  await db.$transaction([
    db.profile.deleteMany({ where: { userId } }),
    db.$executeRaw`DELETE FROM neon_auth."user" WHERE id::text = ${userId}`,
  ]);
}
