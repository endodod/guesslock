"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { countedLocks, LOCKS, OMEN_LOCKS, SEANCE_BOX_LIST, SEANCE_BOXES, seanceLocksOf, SHOP_LOCKS, SPIRIT_LOCKS, STAR_LOCKS, VAULT_UNITS, type LockDef, type SeanceBoxId } from "@/locks.config";
import type { LockMeta } from "@/lib/server/puzzles";
import { dayStreaks, ignoredSlugs, type LockRecord } from "@/lib/client/store";
import { dayTotals, shareDay, type LockResult } from "@/lib/game/scoring";
import { boxSouls } from "@/lib/seance/scoring";
import { WaxSeal, type SealState } from "./seance/WaxSeal";
import { t } from "@/lib/i18n/en";
import { useGame } from "./GameProvider";
import { Countdown, DecoFrame, Icon, Keyhole } from "./ui";
import { answerImageClass } from "@/lib/images";
import { ShareButton } from "./WinPanel";

export type BoxState = "locked" | "progress" | "opened" | "jammed" | "sealed" | "skipped";

/** `skipped`: the player skips this lock (sound locks with "Skip sound locks" on). */
export function boxState(meta: LockMeta | undefined, rec: LockRecord | undefined, skipped = false): BoxState {
  if (skipped) return "skipped";
  if (!meta || meta.state !== "available") return "sealed";
  if (rec?.o !== undefined) return "opened"; // an Omen is opened once locked in
  if (!rec || rec.g.length === 0) return "locked";
  if (rec.s === "won") return "opened";
  if (rec.s === "lost") return "jammed";
  return "progress";
}

/** Engraved sound waves either side of the keyhole: marks the sound lock (The Resonance). */
function SoundWaveGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.8">
        <path d="M12 19q-3 5 0 10M8 15.5q-5 8.5 0 17" />
        <path d="M36 19q3 5 0 10M40 15.5q5 8.5 0 17" />
      </g>
    </svg>
  );
}

/** A mode that is announced but has no daily puzzle, route or answers yet (The Wayfinder). Never counted, never a link. */
function ComingSoonBox({ name, subtitle, state = "Under construction" }: { name: string; subtitle: string; state?: string }) {
  return (
    <div
      aria-label={`${name}: ${subtitle}. ${state}; not playable.`}
      className="relative flex h-[17.7rem] w-full flex-col overflow-hidden rounded-[3px] border border-brass/35 bg-iron shadow-[0_6px_18px_rgba(0,0,0,0.5)]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#30291f,#141210)]" />
      <div className="relative flex h-full flex-col items-center justify-between border border-brass/20 px-3 pt-3 pb-11">
        <div className="flex h-8 min-w-10 items-center justify-center rounded-[2px] border border-brass/50 bg-[linear-gradient(180deg,#5b4b31,#332919)] px-2.5 font-display text-sm tracking-widest text-brass">
          ...
        </div>
        <div className="flex h-20 w-full flex-none items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brass/35 bg-ink/60 text-brass/60">
            <Keyhole className="h-7 w-5" />
          </div>
        </div>
        <div className="mt-2 min-h-[4.25rem] text-center">
          <div className="font-display text-base leading-tight text-paper">{name}</div>
          <div className="mt-0.5 line-clamp-2 min-h-[2.75em] text-[0.8rem] leading-snug text-ash">{subtitle}</div>
        </div>
      </div>
      <div className="absolute inset-x-1.5 bottom-1.5 rounded-[2px] bg-ink/85 px-1.5 py-1 text-center font-mono text-[0.68rem] leading-tight text-brass">
        {state}
      </div>
    </div>
  );
}

/** Shop locks added later get their own row under the original four. */
const SHOP_EXTRA = new Set(["decoy", "cache"]);

export function VaultBox({
  lock, state, rec, href,
}: { lock: LockDef; state: BoxState; rec?: LockRecord; href: string | null }) {
  const open = state === "opened" || state === "jammed";
  const omen = lock.group === "omens";
  const inner = (
    <div className={`group relative flex h-[17.7rem] flex-col overflow-hidden rounded-[3px] border bg-iron shadow-[0_6px_18px_rgba(0,0,0,0.5)] ${omen ? "border-cursed/60" : "border-brass/50"}`}>
      {/* Box interior (visible when the door swings open) */}
      <div className={`absolute inset-0 ${omen ? "bg-[radial-gradient(ellipse_at_center,#3b2a63,#140f22)]" : "bg-[radial-gradient(ellipse_at_center,#5a2429,#2a0f12)]"}`}>
        {open && omen && rec && (
          <div className="flex h-full flex-col items-center justify-center pl-8 text-center">
            <span className="font-mono text-4xl text-paper">{rec.souls}</span>
            <span className="text-xs text-ash">of 100</span>
          </div>
        )}
        {open && rec?.answer?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rec.answer.image} alt={rec.answer.name} loading="lazy" className={`${answerImageClass(lock.guess)} opacity-90 ${state === "jammed" ? "grayscale" : ""}`} />
        )}
        {state === "opened" && <div className="absolute inset-0 shadow-[inset_0_0_40px_rgba(127,227,194,0.45)]" />}
        {state === "jammed" && (
          <svg className="absolute inset-0 h-full w-full text-[#d08a8a]/70" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path d="M42 40 L58 60 M58 38 L44 62 M40 52 L62 48" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        )}
      </div>

      {/* The door hides the numeral once open: repeat it on the box frame */}
      {open && (
        <span className="absolute right-1.5 top-1.5 z-10 rounded-[2px] border border-brass/70 bg-[linear-gradient(180deg,#d9b872,#a8853f)] px-1.5 font-display text-[0.7rem] tracking-widest text-[#2a1f08]">
          {lock.numeral}
        </span>
      )}
      {/* Door */}
      <div className="relative h-full [perspective:1000px]">
        <motion.div
          className={`relative flex h-full flex-col items-center justify-between border px-3 pt-3 pb-11 [transform-origin:left_center] [backface-visibility:hidden] [&>*]:transition-opacity [&>*]:duration-200 ${open ? "[&>*]:opacity-0" : ""} ${omen ? "border-cursed/40 bg-[linear-gradient(160deg,#2c2733,#1a1720_60%,#131018)] shadow-[inset_0_0_28px_rgba(140,107,216,0.28)]" : "border-brass/30 bg-[linear-gradient(160deg,#2c2722,#1a1816_60%,#141210)]"}`}
          initial={false}
          // Open: the door swings almost edge-on (a thin panel at the hinge); its face is hidden.
          animate={open ? { rotateY: -86, opacity: 1 } : { rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* numeral plate */}
          <div className="flex h-8 min-w-10 items-center justify-center rounded-[2px] border border-brass/70 bg-[linear-gradient(180deg,#d9b872,#a8853f)] px-2.5 font-display text-sm tracking-widest text-[#2a1f08] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
            {lock.numeral}
          </div>
          <div className={`mt-2 flex h-20 w-full flex-none items-center justify-center ${state === "skipped" ? "opacity-40" : ""}`}>
            {state === "sealed" ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_35%,#c24a44,#6e1d1a)] text-[#f0c7c3] shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                <Icon name="seal" className="h-7 w-7" />
              </div>
            ) : (
              <div className={`relative flex h-12 w-12 items-center justify-center rounded-full border border-brass/60 bg-ink/60 ${state === "progress" ? "text-ecto/70" : "text-brass/70"} group-hover:text-ecto group-focus-visible:text-ecto`}>
                <Keyhole className={`h-7 w-5 ${state === "progress" ? "keyhole-glow" : "group-hover:keyhole-glow group-focus-visible:keyhole-glow"}`} />
                {lock.needsAudio && <SoundWaveGlyph />}
              </div>
            )}
          </div>
          <div className="mt-2 min-h-[4.25rem] text-center">
            <div className="font-display text-base leading-tight text-paper">{lock.name}</div>
            <div className="mt-0.5 line-clamp-2 min-h-[2.75em] text-[0.8rem] leading-snug text-ash">{lock.subtitle}</div>
          </div>
        </motion.div>
      </div>

      {/* status tag */}
      <div className="absolute inset-x-1.5 bottom-1.5 rounded-[2px] bg-ink/85 px-1.5 py-1 text-center font-mono text-[0.68rem] leading-tight text-paper">
        {open && rec?.answer?.name && <span className="mb-0.5 block truncate font-body text-[0.8rem] text-paper">{rec.answer.name}</span>}
        {state === "locked" && <span className="text-ash">{t.vault.states.locked}</span>}
        {state === "progress" && <span className="text-ecto">{t.vault.states.progress(rec!.g.length)}</span>}
        {state === "opened" && <span className="text-ecto">{omen ? `Opened · ${rec!.souls} souls` : `${rec!.g.length} · ${rec!.souls} souls`}</span>}
        {state === "jammed" && <span className="text-[#d08a8a]">{t.vault.states.jammed}</span>}
        {state === "sealed" && <span className="text-ash">{t.vault.sealed}</span>}
        {state === "skipped" && <span className="text-ash">{t.vault.states.skipped}</span>}
      </div>
    </div>
  );
  const label = `${lock.numeral}. ${lock.name}: ${lock.subtitle}. ${state === "sealed" ? t.vault.sealed : state === "skipped" ? `${t.vault.states.skipped} (${t.settings.skipSound})` : state}`;
  return href ? (
    <Link href={href} aria-label={label} className="block h-full rounded-[3px]">{inner}</Link>
  ) : (
    <div aria-label={label} className="h-full">{inner}</div>
  );
}

/**
 * A sorting box (the Séance, the Bazaar, the Grimoire): one wide box for its four tables, with a wax seal per table on the door.
 * Opened once every table in play is finished; sealed when all four are sealed.
 */
export function SeanceBox({ box: boxId, metaBy, day, q }: { box: SeanceBoxId; metaBy: Map<string, LockMeta>; day: Record<string, LockRecord>; q: string }) {
  const SEANCE_BOX = SEANCE_BOXES[boxId];
  const tables = seanceLocksOf(boxId).map((l) => {
    const rec = day[l.slug];
    const inPlay = metaBy.get(l.slug)?.state === "available";
    const seal: SealState = !inPlay ? "sealed" : rec?.s === "won" ? "won" : rec?.s === "lost" ? "lost" : "intact";
    return { l, rec, inPlay, seal };
  });
  const live = tables.filter((x) => x.inPlay);
  const done = live.filter((x) => x.seal === "won" || x.seal === "lost");
  const state: BoxState = live.length === 0 ? "sealed" : done.length === live.length ? "opened" : tables.some((x) => (x.rec?.g.length ?? 0) > 0) ? "progress" : "locked";
  const souls = boxSouls(done.map((x) => x.rec!.souls), live.length);
  const target = live.find((x) => x.seal === "intact") ?? live[0];
  const href = target ? `/lock/${target.l.slug}${q}` : null;
  const open = state === "opened";
  const label = `${SEANCE_BOX.numeral}. ${SEANCE_BOX.name}: ${SEANCE_BOX.subtitle} ${state === "sealed" ? t.vault.sealed : state}. ${tables.map((x) => `${x.l.table!.label}: ${t.seance.seal[x.seal === "intact" ? "open" : x.seal]}`).join(", ")}`;

  const inner = (
    <div className="group relative flex min-h-40 overflow-hidden rounded-[3px] border border-brass/50 bg-iron shadow-[0_6px_18px_rgba(0,0,0,0.5)]">
      {/* A wide door doesn't swing well: once every table is finished, the séance table shows through instead. */}
      <div className="relative w-full">
        <div className={`relative flex h-full flex-col items-center justify-between gap-3 border px-4 pt-3 pb-11 sm:flex-row sm:pb-10 ${open ? "seance-table border-ecto/40 shadow-[inset_0_0_50px_rgba(127,227,194,0.35)]" : "border-brass/30 bg-[linear-gradient(160deg,#2c2722,#1a1816_60%,#141210)]"}`}>
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <div className="rounded-[2px] border border-brass/70 bg-[linear-gradient(180deg,#d9b872,#a8853f)] px-2.5 py-0.5 font-display text-sm tracking-widest text-[#2a1f08] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
              {SEANCE_BOX.numeral}
            </div>
            <div className="text-center sm:text-left">
              <div className="font-display text-lg leading-tight text-paper">{SEANCE_BOX.name}</div>
              <div className="text-[0.8rem] leading-snug text-ash">{SEANCE_BOX.subtitle}</div>
            </div>
          </div>
          {open && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="text-center">
              <span className="block font-mono text-4xl text-paper">{souls}</span>
              <span className="text-xs text-ash">souls · average of {live.length} {live.length === 1 ? "table" : "tables"}</span>
            </motion.div>
          )}
          {/* one wax seal per table */}
          <ul className="grid grid-cols-4 gap-2 sm:gap-4" aria-hidden>
            {tables.map((x) => (
              <li key={x.l.slug} className="flex flex-col items-center gap-1">
                <WaxSeal state={x.seal} className="h-9 w-9" />
                <span className={`text-[0.7rem] ${x.seal === "won" ? "text-ecto" : x.seal === "lost" ? "text-[#d08a8a]" : "text-ash"}`}>{x.l.table!.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="absolute inset-x-1.5 bottom-1.5 rounded-[2px] bg-ink/85 px-1.5 py-1 text-center font-mono text-[0.68rem] leading-tight text-paper">
        {state === "locked" && <span className="text-ash">{t.vault.states.locked}</span>}
        {state === "progress" && <span className="text-ecto">{done.length} / {live.length} tables</span>}
        {state === "opened" && <span className="text-ecto">Opened · {souls} souls</span>}
        {state === "sealed" && <span className="text-ash">{t.vault.sealed}</span>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} aria-label={label} className="block rounded-[3px]">{inner}</Link>
  ) : (
    <div aria-label={label}>{inner}</div>
  );
}

export function Vault({
  date, number, meta, isArchive, nextReset, site,
}: { date: string; number: number; meta: LockMeta[]; isArchive: boolean; nextReset: number; site: string }) {
  const { store, today, hydrated } = useGame();
  const day = store.progress[date] ?? {};
  const metaBy = new Map(meta.map((m) => [m.slug, m]));
  // "Skip sound locks": those locks drop out of every count, the share and the streak.
  const skipSound = hydrated && store.settings.skipSound;
  const ignored = ignoredSlugs({ skipSound });
  const counted = countedLocks(skipSound);
  const available = counted.filter((l) => metaBy.get(l.slug)?.state === "available");
  const seanceInPlay = Object.fromEntries(
    SEANCE_BOX_LIST.map((b) => [b.id, seanceLocksOf(b.id).filter((l) => metaBy.get(l.slug)?.state === "available").length]),
  ) as Record<SeanceBoxId, number>;
  const finished = available.filter((l) => ["won", "lost"].includes(day[l.slug]?.s ?? ""));
  const complete = hydrated && available.length > 0 && finished.length === available.length;
  const streak = dayStreaks(store.progress, today, ignored).current;
  // Every Vault unit (a lock, or a sorting box of four tables), minus the ones this player skips.
  const displayedUnitCount = VAULT_UNITS.filter((u) => u.kind !== "lock" || !ignored.has(u.lock.slug)).length;
  const q = isArchive ? `?d=${date}` : "";
  const next = available.find((l) => !["won", "lost"].includes(day[l.slug]?.s ?? ""));
  const nothingPlayed = hydrated && Object.keys(day).length === 0;

  const results: Record<string, LockResult> = Object.fromEntries(
    LOCKS.map((l) => {
      const r = day[l.slug];
      return [l.slug, {
        status: r ? (r.s === "won" ? "won" : r.s === "lost" ? "lost" : "playing") : "none",
        guesses: r?.g.length ?? 0, souls: r?.souls ?? 0, mistakes: r?.w,
      }];
    }),
  );
  // The Séance's four tables count as one box (worth their average, opened when all are finished).
  const { souls, opened: openCount } = dayTotals(results, seanceInPlay, ignored);
  const best = counted.filter((l) => !l.box && day[l.slug]?.s === "won").sort((a, b) => (day[b.slug].souls ?? 0) - (day[a.slug].souls ?? 0))[0];

  const box = (l: LockDef) => {
    const m = metaBy.get(l.slug);
    const state = boxState(m, day[l.slug], ignored.has(l.slug));
    return (
      <li key={l.slug} className="h-full">
        <VaultBox lock={l} state={state} rec={day[l.slug]} href={state === "sealed" || state === "skipped" ? null : `/lock/${l.slug}${q}`} />
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
      {isArchive && (
        <div className="mb-6 rounded-sm border border-brass/50 bg-brass/10 px-4 py-2 text-center text-sm text-brass">{t.vault.archiveBanner}</div>
      )}

      {/* Soul Tally + Continue */}
      <div className="mb-8 flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="smallcaps text-sm text-brass">{t.vault.soulTally} · #{number}</p>
          <p className="font-mono text-3xl text-paper" suppressHydrationWarning>{hydrated ? souls : 0} <span className="text-base text-ash">souls</span></p>
          <p className="text-sm text-ash" suppressHydrationWarning>{t.vault.progress(hydrated ? openCount : 0, displayedUnitCount)}</p>
        </div>
        {!isArchive && (
          <p className="max-w-md flex-1 text-center text-sm leading-relaxed text-paper/85">
            Each puzzle is a lock in the Vault. Choose a lock, use the clues to find its answer, and open it for souls.
          </p>
        )}
        {next && (
          <Link
            href={`/lock/${next.slug}${q}`}
            className={`inline-flex min-h-12 items-center gap-2 rounded-[3px] border border-ecto/70 bg-ecto/10 px-6 text-lg text-ecto hover:bg-ecto/20 ${nothingPlayed ? "pulse-once" : ""}`}
          >
            {t.vault.continue} <span className="font-display text-sm text-brass">{next.numeral}</span>
            <Icon name="arrow-right" className="h-5 w-5" />
          </Link>
        )}
      </div>

      {complete && (
        <DecoFrame className="mb-8 p-6 text-center shadow-[0_0_60px_rgba(127,227,194,0.18)]">
          <p className="font-display text-3xl text-ecto">{t.vault.complete}</p>
          <p className="mt-2 text-paper">
            <span className="font-mono text-2xl">{souls}</span> souls
            {best && <> · {t.vault.bestLock}: <span className="text-brass">{best.name}</span></>}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-ash">
            <Icon name="flame" className="h-4 w-4 text-cursed" /> {streak} {streak === 1 ? "day" : "days"}
            {!isArchive && <> · {t.vault.nextIn} <Countdown target={nextReset} /></>}
          </p>
          <div className="mt-4 flex justify-center">
            <ShareButton text={shareDay({ number, results, streak, site, seanceInPlay, skip: ignored })} />
          </div>
        </DecoFrame>
      )}

      {/* The wall */}
      <div className={`grid gap-8 lg:grid-cols-[5fr_2fr] ${complete ? "rounded-md shadow-[0_0_80px_rgba(127,227,194,0.12)]" : ""}`}>
        <section aria-labelledby="spirits-h">
          <h2 id="spirits-h" className="smallcaps mb-3 text-brass">{t.groups.spirits}</h2>
          {/* 15 boxes: 5 × 3 from tablet up; on phones 2 columns with the last one centred */}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5 md:gap-4 [&>li:last-child:nth-child(odd)]:col-span-2 [&>li:last-child:nth-child(odd)]:mx-auto [&>li:last-child:nth-child(odd)]:w-[calc(50%-0.375rem)] sm:[&>li:last-child:nth-child(odd)]:col-span-1 sm:[&>li:last-child:nth-child(odd)]:mx-0 sm:[&>li:last-child:nth-child(odd)]:w-auto">
            {SPIRIT_LOCKS.map((l) => box(l))}
          </ul>
        </section>
        <section aria-labelledby="shop-h">
          <h2 id="shop-h" className="smallcaps mb-3 text-brass">{t.groups.shop}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4 lg:grid-cols-2">
            {SHOP_LOCKS.filter((l) => !SHOP_EXTRA.has(l.slug)).map((l) => box(l))}
          </ul>
          <ul className="mt-4 grid grid-cols-2 gap-3 md:gap-4">
            {SHOP_LOCKS.filter((l) => SHOP_EXTRA.has(l.slug)).map((l) => box(l))}
          </ul>
        </section>
      </div>

      {/* The Omens: predictions from real matches (a different kind of puzzle, hence the cursed glow) */}
      <section aria-labelledby="omens-h" className="mt-8">
        <h2 id="omens-h" className="smallcaps mb-3 text-cursed">{t.groups.omens}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 [&>li:last-child:nth-child(odd)]:col-span-2 [&>li:last-child:nth-child(odd)]:mx-auto [&>li:last-child:nth-child(odd)]:w-[calc(50%-0.375rem)] sm:[&>li:last-child:nth-child(odd)]:col-span-1 sm:[&>li:last-child:nth-child(odd)]:mx-0 sm:[&>li:last-child:nth-child(odd)]:w-auto">
          {OMEN_LOCKS.map((l) => box(l))}
        </ul>
      </section>

      {/* The Séance: four tables behind one wide box */}
      <section aria-labelledby="seance-h" className="mt-8">
        <h2 id="seance-h" className="smallcaps mb-3 text-brass">{t.groups.seance}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SEANCE_BOX_LIST.map((b) => <SeanceBox key={b.id} box={b.id} metaBy={metaBy} day={day} q={q} />)}
        </div>
      </section>

      <section aria-labelledby="more-h" className="mt-8">
        <h2 id="more-h" className="smallcaps mb-3 text-brass">More Modes</h2>
        <ul className="mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
          {STAR_LOCKS.map((l) => box(l))}
          <li><ComingSoonBox name="The Wayfinder" subtitle="Find your place in the world" /></li>
        </ul>
      </section>

      {!isArchive && (
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <p className="text-ash">{t.vault.nextIn} <Countdown target={nextReset} className="text-paper" /></p>
          <Link href="/yesterday" className="text-brass underline-offset-4 hover:underline">{t.vault.yesterday}</Link>
          <Link href="/endless" className="text-cursed underline-offset-4 hover:underline">Can&apos;t wait for tomorrow? Play Endless</Link>
        </div>
      )}
    </div>
  );
}
