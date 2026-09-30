"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { LOCKS, SHOP_LOCKS, SPIRIT_LOCKS, type LockDef } from "@/locks.config";
import type { LockMeta } from "@/lib/server/puzzles";
import { daySouls, streaks, type LockRecord } from "@/lib/client/store";
import { shareDay, type LockResult } from "@/lib/game/scoring";
import { t } from "@/lib/i18n/en";
import { useGame } from "./GameProvider";
import { Countdown, DecoFrame, Icon, Keyhole } from "./ui";
import { answerImageClass } from "@/lib/images";
import { ShareButton } from "./WinPanel";

export type BoxState = "locked" | "progress" | "opened" | "jammed" | "sealed";

export function boxState(meta: LockMeta | undefined, rec: LockRecord | undefined): BoxState {
  if (!meta || meta.state !== "available") return "sealed";
  if (!rec || rec.g.length === 0) return "locked";
  if (rec.s === "won") return "opened";
  if (rec.s === "lost") return "jammed";
  return "progress";
}

export function VaultBox({
  lock, state, rec, href, large = false,
}: { lock: LockDef; state: BoxState; rec?: LockRecord; href: string | null; large?: boolean }) {
  const open = state === "opened" || state === "jammed";
  const inner = (
    <div className={`group relative flex h-full flex-col overflow-hidden rounded-[3px] border border-brass/50 bg-iron shadow-[0_6px_18px_rgba(0,0,0,0.5)] ${large ? "min-h-52" : "min-h-44"}`}>
      {/* Box interior (visible when the door swings open) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#5a2429,#2a0f12)]">
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

      {/* Door */}
      <div className="relative h-full [perspective:1000px]">
        <motion.div
          className="relative flex h-full flex-col items-center justify-between border border-brass/30 bg-[linear-gradient(160deg,#2c2722,#1a1816_60%,#141210)] px-3 pt-3 pb-11 [transform-origin:left_center] [backface-visibility:hidden]"
          initial={false}
          animate={open ? { rotateY: -78, opacity: 0.94 } : { rotateY: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* numeral plate */}
          <div className="rounded-[2px] border border-brass/70 bg-[linear-gradient(180deg,#d9b872,#a8853f)] px-2.5 py-0.5 font-display text-sm tracking-widest text-[#2a1f08] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
            {lock.numeral}
          </div>
          <div className="flex flex-1 items-center justify-center py-2">
            {state === "sealed" ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_35%,#c24a44,#6e1d1a)] text-[#f0c7c3] shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
                <Icon name="seal" className="h-7 w-7" />
              </div>
            ) : (
              <div className={`flex h-12 w-12 items-center justify-center rounded-full border border-brass/60 bg-ink/60 ${state === "progress" ? "text-ecto/70" : "text-brass/70"} group-hover:text-ecto group-focus-visible:text-ecto`}>
                <Keyhole className={`h-7 w-5 ${state === "progress" ? "keyhole-glow" : "group-hover:keyhole-glow group-focus-visible:keyhole-glow"}`} />
              </div>
            )}
          </div>
          <div className="text-center">
            <div className={`font-display leading-tight text-paper ${large ? "text-lg" : "text-base"}`}>{lock.name}</div>
            <div className="mt-0.5 line-clamp-2 min-h-[2.75em] text-[0.8rem] leading-snug text-ash">{lock.subtitle}</div>
          </div>
        </motion.div>
      </div>

      {/* status tag */}
      <div className="absolute inset-x-1.5 bottom-1.5 rounded-[2px] bg-ink/85 px-1.5 py-1 text-center font-mono text-[0.68rem] leading-tight text-paper">
        {state === "locked" && <span className="text-ash">{t.vault.states.locked}</span>}
        {state === "progress" && <span className="text-ecto">{t.vault.states.progress(rec!.g.length)}</span>}
        {state === "opened" && <span className="text-ecto">{rec!.g.length} · {rec!.souls} souls</span>}
        {state === "jammed" && <span className="text-[#d08a8a]">{t.vault.states.jammed}</span>}
        {state === "sealed" && <span className="text-ash">{t.vault.sealed}</span>}
      </div>
    </div>
  );
  const label = `${lock.numeral}. ${lock.name}: ${lock.subtitle}. ${state === "sealed" ? t.vault.sealed : state}`;
  return href ? (
    <Link href={href} aria-label={label} className="block h-full rounded-[3px]">{inner}</Link>
  ) : (
    <div aria-label={label} className="h-full">{inner}</div>
  );
}

export function Vault({
  date, number, meta, isArchive, nextReset, site,
}: { date: string; number: number; meta: LockMeta[]; isArchive: boolean; nextReset: number; site: string }) {
  const { store, today, hydrated } = useGame();
  const day = store.progress[date] ?? {};
  const metaBy = new Map(meta.map((m) => [m.slug, m]));
  const available = LOCKS.filter((l) => metaBy.get(l.slug)?.state === "available");
  const openCount = LOCKS.filter((l) => day[l.slug]?.s === "won").length;
  const finished = available.filter((l) => ["won", "lost"].includes(day[l.slug]?.s ?? ""));
  const complete = hydrated && available.length > 0 && finished.length === available.length;
  const souls = daySouls(day) + (isArchive ? Object.values(day).filter((r) => r.archive).reduce((a, r) => a + r.souls, 0) : 0);
  const streak = streaks(store.progress, today).current;
  const q = isArchive ? `?d=${date}` : "";
  const next = available.find((l) => !["won", "lost"].includes(day[l.slug]?.s ?? ""));
  const nothingPlayed = hydrated && Object.keys(day).length === 0;

  const results: Record<string, LockResult> = Object.fromEntries(
    LOCKS.map((l) => {
      const r = day[l.slug];
      return [l.slug, { status: r ? (r.s === "won" ? "won" : r.s === "lost" ? "lost" : "playing") : "none", guesses: r?.g.length ?? 0, souls: r?.souls ?? 0 }];
    }),
  );
  const best = LOCKS.filter((l) => day[l.slug]?.s === "won").sort((a, b) => (day[b.slug].souls ?? 0) - (day[a.slug].souls ?? 0))[0];

  const box = (l: LockDef, large = false) => {
    const m = metaBy.get(l.slug);
    const state = boxState(m, day[l.slug]);
    return (
      <li key={l.slug} className="h-full">
        <VaultBox lock={l} state={state} rec={day[l.slug]} href={state === "sealed" ? null : `/lock/${l.slug}${q}`} large={large} />
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
          <p className="text-sm text-ash" suppressHydrationWarning>{t.vault.progress(hydrated ? openCount : 0, LOCKS.length)}</p>
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
            <ShareButton text={shareDay({ number, results, streak, site })} />
          </div>
        </DecoFrame>
      )}

      {/* The wall */}
      <div className={`grid gap-8 lg:grid-cols-[3fr_2fr] ${complete ? "rounded-md shadow-[0_0_80px_rgba(127,227,194,0.12)]" : ""}`}>
        <section aria-labelledby="spirits-h">
          <h2 id="spirits-h" className="smallcaps mb-3 text-brass">{t.groups.spirits}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 [&>li:last-child:nth-child(odd)]:col-span-2 [&>li:last-child:nth-child(odd)]:mx-auto [&>li:last-child:nth-child(odd)]:w-[calc(50%-0.375rem)] sm:[&>li:last-child:nth-child(odd)]:col-span-1 sm:[&>li:last-child:nth-child(odd)]:mx-0 sm:[&>li:last-child:nth-child(odd)]:w-auto">
            {SPIRIT_LOCKS.map((l) => box(l))}
          </ul>
        </section>
        <section aria-labelledby="shop-h">
          <h2 id="shop-h" className="smallcaps mb-3 text-brass">{t.groups.shop}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4 lg:grid-cols-2">
            {SHOP_LOCKS.map((l) => box(l, true))}
          </ul>
        </section>
      </div>

      {!isArchive && (
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <p className="text-ash">{t.vault.nextIn} <Countdown target={nextReset} className="text-paper" /></p>
          <Link href="/yesterday" className="text-brass underline-offset-4 hover:underline">{t.vault.yesterday}</Link>
        </div>
      )}
    </div>
  );
}
