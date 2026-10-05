"use client";
import { useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { countedLocks, HARD_LOCKS, LOCKS, OMEN_LOCKS, SEANCE_BOX_LIST, SEANCE_BOXES, seanceLocksOf, SHOP_LOCKS, SPIRIT_LOCKS, STAR_LOCKS, VAULT_UNITS, WORD_LOCKS, type LockDef, type SeanceBoxId } from "@/locks.config";
import type { LockMeta } from "@/lib/server/puzzles";
import { dayStreaks, ignoredSlugs, type LockRecord } from "@/lib/client/store";
import { dayTotals, shareDay, type LockResult } from "@/lib/game/scoring";
import { boxSouls } from "@/lib/seance/scoring";
import { WaxSeal, type SealState } from "./seance/WaxSeal";
import { t } from "@/lib/i18n/en";
import { useGame } from "./GameProvider";
import { Countdown, DecoFrame, Icon, Keyhole } from "./ui";
import { answerImageClass } from "@/lib/images";
import { AnswerMosaic } from "./AnswerMosaic";
import { DailyReward } from "./DailyReward";
import { ShareButton } from "./WinPanel";

/** `gated`: a hard puzzle whose normal lock is not finished yet; `nohard`: a lock without a hard puzzle, shown greyed out in the hard view. */
export type BoxState = "locked" | "progress" | "opened" | "jammed" | "sealed" | "skipped" | "gated" | "nohard";

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

/** The compact card of the Omens and the extra modes: a row (numeral, name, status) instead of a tall door. */
const stripBase = "relative flex min-h-[5.75rem] items-center gap-3 overflow-hidden rounded-[3px] border px-3 py-3 shadow-[0_6px_18px_rgba(0,0,0,0.5)]";
const plate = "flex h-9 min-w-11 shrink-0 items-center justify-center rounded-[2px] border border-brass/70 bg-[linear-gradient(180deg,#d9b872,#a8853f)] px-2 font-display text-sm tracking-widest text-[#2a1f08] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]";

export function VaultStrip({ lock, state, rec, href }: { lock: LockDef; state: BoxState; rec?: LockRecord; href: string | null }) {
  const omen = lock.group === "omens";
  const open = state === "opened" || state === "jammed";
  const status =
    state === "locked" ? null
    : state === "progress" ? <span className="text-ecto">{t.vault.states.progress(rec!.g.length)}</span>
    : state === "opened" ? <span className="text-ecto">{omen ? `${rec!.souls} / 100` : `${rec!.g.length} · ${rec!.souls} souls`}</span>
    : state === "jammed" ? <span className="text-[#d08a8a]">{t.vault.states.jammed}</span>
    : state === "sealed" ? <span className="text-ash">{t.vault.sealed}</span>
    : state === "nohard" ? <span className="text-ash">No hard mode</span>
    : state === "gated" ? <span className="text-ash">Finish the normal lock first</span>
    : <span className="text-ash">{t.vault.states.skipped}</span>;
  const inner = (
    <div className={`group ${stripBase} ${omen ? "border-cursed/60 bg-[linear-gradient(160deg,#2c2733,#1a1720_60%,#131018)]" : "border-brass/50 bg-[linear-gradient(160deg,#2c2722,#1a1816_60%,#141210)]"} ${state === "opened" ? "shadow-[inset_0_0_30px_rgba(127,227,194,0.25)]" : ""} ${state === "nohard" ? "opacity-35 grayscale" : href ? "hover:border-ecto/70" : "opacity-75"}`}>
      <div className={plate}>{lock.numeral}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-base leading-tight text-paper">{lock.name}</div>
        <div className="line-clamp-2 text-[0.8rem] leading-snug text-ash">{lock.subtitle}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right font-mono text-[0.72rem] leading-tight">
        {open && rec?.answer?.images?.length ? (
          <div className={`h-14 w-14 overflow-hidden rounded-sm border border-brass/30 ${state === "jammed" ? "grayscale" : ""}`}><AnswerMosaic images={rec.answer.images} /></div>
        ) : open && rec?.answer?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rec.answer.image} alt="" loading="lazy" className={`h-10 w-10 rounded-sm object-cover object-top ${state === "jammed" ? "grayscale" : ""}`} />
        ) : null}
        {status}
      </div>
    </div>
  );
  const label = `${lock.numeral}. ${lock.name}: ${lock.subtitle}. ${state === "sealed" ? t.vault.sealed : state}`;
  return href ? <Link href={href} aria-label={label} className="block rounded-[3px]">{inner}</Link> : <div aria-label={label}>{inner}</div>;
}

/** A mode that is announced but has no daily puzzle, route or answers yet (The Wayfinder). Never counted, never a link. */
function ComingSoonStrip({ name, subtitle, state = "Under construction" }: { name: string; subtitle: string; state?: string }) {
  return (
    <div aria-label={`${name}: ${subtitle}. ${state}; not playable.`} className={`${stripBase} border-brass/35 bg-[radial-gradient(ellipse_at_center,#30291f,#141210)]`}>
      <div className="flex h-9 min-w-11 shrink-0 items-center justify-center rounded-[2px] border border-brass/50 bg-[linear-gradient(180deg,#5b4b31,#332919)] px-2 font-display text-sm tracking-widest text-brass">...</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-base leading-tight text-paper">{name}</div>
        <div className="line-clamp-2 text-[0.8rem] leading-snug text-ash">{subtitle}</div>
      </div>
      <span className="shrink-0 text-right font-mono text-[0.72rem] text-ash">{state}</span>
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
  const hardBox = !!lock.hardPlay;
  const inner = (
    <div className={`group relative flex h-[17.7rem] flex-col overflow-hidden rounded-[3px] border bg-iron shadow-[0_6px_18px_rgba(0,0,0,0.5)] ${omen ? "border-cursed/60" : hardBox ? "border-[#b0433f]/70" : "border-brass/50"} ${state === "gated" ? "opacity-60" : state === "nohard" ? "opacity-35 grayscale" : ""}`}>
      {/* Box interior (visible when the door swings open) */}
      <div className={`absolute inset-0 ${omen ? "bg-[radial-gradient(ellipse_at_center,#3b2a63,#140f22)]" : hardBox ? "bg-[radial-gradient(ellipse_at_center,#7a1f1b,#1f0706)]" : "bg-[radial-gradient(ellipse_at_center,#5a2429,#2a0f12)]"}`}>
        {open && omen && rec && (
          <div className="flex h-full flex-col items-center justify-center pl-8 text-center">
            <span className="font-mono text-4xl text-paper">{rec.souls}</span>
            <span className="text-xs text-ash">of 100</span>
          </div>
        )}
        {open && rec?.answer?.images?.length ? (
          <AnswerMosaic portrait images={rec.answer.images} label={rec.answer.name} className={`opacity-90 ${state === "jammed" ? "grayscale" : ""}`} />
        ) : open && rec?.answer?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rec.answer.image} alt={rec.answer.name} loading="lazy" className={`${answerImageClass(lock.guess)} opacity-90 ${state === "jammed" ? "grayscale" : ""}`} />
        ) : null}
        {state === "opened" && <div className={`absolute inset-0 ${hardBox ? "shadow-[inset_0_0_46px_rgba(224,100,92,0.65)]" : "shadow-[inset_0_0_40px_rgba(127,227,194,0.45)]"}`} />}
        {open && hardBox && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_115%,rgba(224,100,92,0.45),transparent_62%)]" />}
        {state === "jammed" && (
          <svg className="absolute inset-0 h-full w-full text-[#d08a8a]/70" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path d="M42 40 L58 60 M58 38 L44 62 M40 52 L62 48" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        )}
      </div>

      {hardBox && (
        <span className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-[2px] border border-[#b0433f]/70 bg-[#2a0f0e]/85 px-1.5 font-mono text-[0.62rem] tracking-widest text-[#f0b3b0]">
          <Icon name="flame" className="h-3 w-3" /> HARD
        </span>
      )}
      {/* The door hides the numeral once open: repeat it on the box frame */}
      {open && (
        <span className="absolute right-1.5 top-1.5 z-10 rounded-[2px] border border-brass/70 bg-[linear-gradient(180deg,#d9b872,#a8853f)] px-1.5 font-display text-[0.7rem] tracking-widest text-[#2a1f08]">
          {lock.numeral}
        </span>
      )}
      {/* Door */}
      <div className="relative h-full [perspective:1000px]">
        <motion.div
          className={`relative flex h-full flex-col items-center justify-between border px-3 pt-3 pb-11 [transform-origin:left_center] [backface-visibility:hidden] [&>*]:transition-opacity [&>*]:duration-200 ${open ? "[&>*]:opacity-0" : ""} ${omen ? "border-cursed/40 bg-[linear-gradient(160deg,#2c2733,#1a1720_60%,#131018)] shadow-[inset_0_0_28px_rgba(140,107,216,0.28)]" : hardBox ? "border-[#b0433f]/40 bg-[linear-gradient(160deg,#321d1b,#1c1211_60%,#150d0c)] shadow-[inset_0_0_28px_rgba(176,67,63,0.25)]" : "border-brass/30 bg-[linear-gradient(160deg,#2c2722,#1a1816_60%,#141210)]"}`}
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
      <div hidden={state === "locked"} className="absolute inset-x-1.5 bottom-1.5 rounded-[2px] bg-ink/85 px-1.5 py-1 text-center font-mono text-[0.68rem] leading-tight text-paper">
        {open && rec?.answer?.name && <span className="mb-0.5 block truncate font-body text-[0.8rem] text-paper">{rec.answer.name}</span>}
        {state === "progress" && <span className="text-ecto">{t.vault.states.progress(rec!.g.length)}</span>}
        {state === "opened" && <span className="text-ecto">{omen ? `Opened · ${rec!.souls} souls` : `${rec!.g.length} · ${rec!.souls} souls`}</span>}
        {state === "jammed" && <span className="text-[#d08a8a]">{t.vault.states.jammed}</span>}
        {state === "sealed" && <span className="text-ash">{t.vault.sealed}</span>}
        {state === "skipped" && <span className="text-ash">{t.vault.states.skipped}</span>}
        {state === "gated" && <span className="text-ash">Finish the normal lock first</span>}
        {state === "nohard" && <span className="text-ash">No hard mode</span>}
      </div>
      {/* the hard view: a red wash over the whole card */}
      {hardBox && <div className="pointer-events-none absolute inset-0 z-20 bg-[#b0433f]/15" />}
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
  const cover = done.map((x) => x.rec?.answer?.images).find((i) => i?.length);
  const label = `${SEANCE_BOX.numeral}. ${SEANCE_BOX.name}: ${SEANCE_BOX.subtitle} ${state === "sealed" ? t.vault.sealed : state}. ${tables.map((x) => `${x.l.table!.label}: ${t.seance.seal[x.seal === "intact" ? "open" : x.seal]}`).join(", ")}`;

  const inner = (
    <div className="group relative flex min-h-40 overflow-hidden rounded-[3px] border border-brass/50 bg-iron shadow-[0_6px_18px_rgba(0,0,0,0.5)]">
      {/* A wide door doesn't swing well: once every table is finished, the séance table shows through instead. */}
      <div className="relative w-full">
        {cover && (
          <div className="pointer-events-none absolute inset-0 opacity-25"><AnswerMosaic images={cover} /></div>
        )}
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
      <div hidden={state === "locked"} className="absolute inset-x-1.5 bottom-1.5 rounded-[2px] bg-ink/85 px-1.5 py-1 text-center font-mono text-[0.68rem] leading-tight text-paper">
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
  date, number, meta, hardMeta, isArchive, nextReset, site,
}: { date: string; number: number; meta: LockMeta[]; hardMeta: LockMeta[]; isArchive: boolean; nextReset: number; site: string }) {
  const { store, today, hydrated, setRecord, setSettings } = useGame();
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
  const hardOn = hydrated && store.settings.hardMode;
  const hardBy = new Map(hardMeta.map((m) => [m.slug, m]));
  // The hard view: every lock with a hard puzzle shows that puzzle (red), the rest are greyed out.
  const hardOf = new Map(HARD_LOCKS.map((h) => [h.hardOf!, h]));
  const hardView = hardOn;
  const hardState = (h: LockDef): BoxState => {
    const normalDone = ["won", "lost"].includes(day[h.hardOf!]?.s ?? "");
    const base = boxState(hardBy.get(h.slug), day[h.slug], false);
    return !normalDone && base !== "sealed" ? "gated" : base;
  };

  // Finished locks saved before they carried their answer pictures (The Cache's team mosaic): fetch it once and keep it.
  useEffect(() => {
    if (!hydrated) return;
    for (const l of LOCKS.filter((x) => x.guess === "match" || x.guess === "grid")) {
      const rec = store.progress[date]?.[l.slug];
      if (!rec || (rec.s !== "won" && rec.s !== "lost") || rec.answer?.images?.length) continue;
      fetch("/api/play", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date, slug: l.slug, guesses: rec.g, giveUp: rec.gu }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: { answer?: { name: string; image: string | null; images?: string[] } } | null) => {
          if (v?.answer?.images?.length) setRecord(date, l.slug, { ...rec, answer: { name: v.answer.name, image: v.answer.image, images: v.answer.images } });
        })
        .catch(() => undefined);
    }
  }, [hydrated, date]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const strip = (l: LockDef) => {
    if (hardView) return <li key={l.slug}><VaultStrip lock={l} state="nohard" href={null} /></li>;
    const m = metaBy.get(l.slug);
    const state = boxState(m, day[l.slug], ignored.has(l.slug));
    return (
      <li key={l.slug}>
        <VaultStrip lock={l} state={state} rec={day[l.slug]} href={state === "sealed" || state === "skipped" ? null : `/lock/${l.slug}${q}`} />
      </li>
    );
  };

  const box = (l: LockDef) => {
    if (hardView) {
      const h = hardOf.get(l.slug);
      if (!h) return <li key={l.slug} className="h-full"><VaultBox lock={l} state="nohard" href={null} /></li>;
      const st = hardState(h);
      return (
        <li key={h.slug} className="h-full">
          <VaultBox lock={h} state={st} rec={day[h.slug]} href={st === "sealed" || st === "gated" ? null : `/lock/${h.slug}${q}`} />
        </li>
      );
    }
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
      {!isArchive && <DailyReward />}
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
        {/* Replays have the switch too: a past day's hard puzzles open like today's. */}
        <div className="flex max-w-md flex-1 flex-col items-center gap-3">
          {/* Both texts sit in the same grid cell: the taller one sets the height, so switching changes no layout. */}
          <div className="grid text-center text-sm leading-relaxed">
            <p className={`col-start-1 row-start-1 text-paper/85 ${hardOn ? "invisible" : ""}`} aria-hidden={hardOn || undefined}>
              Each puzzle is a lock in the Vault. Choose a lock, use the clues to find its answer, and open it for souls.
            </p>
            <p className={`col-start-1 row-start-1 text-[#f0b3b0] ${hardOn ? "" : "invisible"}`} aria-hidden={!hardOn || undefined}>
              Hard mode: each lock shows its second, tougher puzzle (1.5× souls), open once the normal lock is finished. Locks greyed out have no hard mode.
            </p>
          </div>
          <button
            type="button" role="switch" aria-checked={hardOn}
            // No `disabled` here: it differs between the server and the first client render. Before hydration a click does nothing.
            onClick={() => { if (hydrated) setSettings({ hardMode: !hardOn }); }}
            // `relative top-3` nudges the switch down visually without changing the layout, so nothing else moves.
            className={`relative top-3 flex min-h-11 items-center gap-3 rounded-[3px] border px-3 text-sm ${hardOn ? "border-[#b0433f]/70 bg-[#b0433f]/10 text-[#f0b3b0]" : "border-brass/30 text-ash hover:text-paper"}`}
          >
            <span aria-hidden className={`relative h-5 w-9 rounded-full ${hardOn ? "bg-[#b0433f]" : "bg-ash/30"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all ${hardOn ? "left-[1.1rem]" : "left-0.5"}`} />
            </span>
            <span className="text-left leading-tight">Hard mode<span className="block text-xs text-ash">A second, tougher puzzle for each finished lock · 1.5× souls</span></span>
          </button>
        </div>
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
        <h2 id="omens-h" className="smallcaps mb-3 flex flex-wrap items-center gap-2 text-cursed">
          {t.groups.omens}
          <span className="rounded-[2px] border border-cursed/60 px-1.5 py-0.5 font-mono text-[0.62rem] normal-case tracking-widest text-[#c7b2ff]">{t.earlyAccess.toUpperCase()}</span>
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
          {OMEN_LOCKS.map((l) => strip(l))}
        </ul>
      </section>

      {/* The Séance: four tables behind one wide box */}
      <section aria-labelledby="seance-h" className="mt-8">
        <h2 id="seance-h" className="smallcaps mb-3 text-brass">{t.groups.seance}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SEANCE_BOX_LIST.map((b) => (
            <div key={b.id} className={hardView ? "pointer-events-none opacity-35 grayscale" : undefined} aria-disabled={hardView || undefined}>
              <SeanceBox box={b.id} metaBy={metaBy} day={day} q={q} />
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="words-h" className="mt-8">
        <h2 id="words-h" className="smallcaps mb-3 text-brass">{t.groups.words}</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
          {WORD_LOCKS.map((l) => strip(l))}
        </ul>
      </section>

      <section aria-labelledby="more-h" className="mt-8">
        <h2 id="more-h" className="smallcaps mb-3 text-brass">More Modes</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4">
          {STAR_LOCKS.map((l) => strip(l))}
          <li className={hardView ? "opacity-35 grayscale" : undefined}><ComingSoonStrip name="The Wayfinder" subtitle="Find your place in the world" /></li>
        </ul>
      </section>

      {!isArchive && (
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <p className="text-ash">{t.vault.nextIn} <Countdown target={nextReset} className="text-paper" /></p>
          <Link href="/yesterday" className="text-brass underline-offset-4 hover:underline">{t.vault.yesterday}</Link>
          <Link href="/endless" className="text-cursed underline-offset-4 hover:underline">Can&apos;t wait for tomorrow? Play Endless</Link>
          <Link href="/community" className="text-brass underline-offset-4 hover:underline">Community puzzles: sorting tables and grids made by players</Link>
        </div>
      )}
    </div>
  );
}
