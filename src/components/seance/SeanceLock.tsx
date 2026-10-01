"use client";
// The Séance lock screen: four tables as tabs, each a 4×4 board of heroes to sort into 4 hidden groups.
// Like LockGame, the device keeps only its submissions; every view comes from /api/play.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { LOCK_BY_SLUG, LOCKS, SEANCE_BOXES, seanceLocksOf } from "@/locks.config";
import type { LockRecord } from "@/lib/client/store";
import { boxSouls, shareTable } from "@/lib/seance/scoring";
import { type GroupView, type SeanceHero, type SeanceView } from "@/lib/seance/types";
import { t } from "@/lib/i18n/en";
import { useGame } from "../GameProvider";
import { ShareButton } from "../WinPanel";
import { Button, DecoFrame, Icon, KeyholeLoader, LockpickRow } from "../ui";
import { WaxSeal, type SealState } from "./WaxSeal";

type Props = {
  initialSlug: string;
  date: string;
  number: number;
  tables: SeanceView[];
  site: string;
  available: string[];
  rules: string;
};

/** Anonymous responses carry the accepted entries; signed-in ones the account's list. */
type PlayResponse = SeanceView & { entries?: string[]; account?: { guesses: string[]; ranked: boolean } };

async function evaluateRemote(body: { date: string; slug: string; guesses: string[]; noHints: boolean }): Promise<PlayResponse> {
  const res = await fetch("/api/play", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`play ${res.status}`);
  return res.json();
}

const NUMERALS = ["", "I", "II", "III", "IV"];
const sortedKey = (ids: number[]) => [...ids].sort((a, b) => a - b).join(",");
const finished = (s?: string) => s === "won" || s === "lost";

export function sealOf(view: SeanceView | undefined, rec: LockRecord | undefined): SealState {
  if (!view || view.status === "sealed") return "sealed";
  const s = finished(view.status) ? view.status : rec?.s;
  return s === "won" ? "won" : s === "lost" ? "lost" : "intact";
}

export function SeanceLock({ initialSlug, date, number, tables, site, available, rules }: Props) {
  const { store, hydrated, today, setRecord, play, toast, user } = useGame();
  const boxDef = SEANCE_BOXES[LOCK_BY_SLUG[initialSlug].box!];
  const SEANCE_LOCKS = seanceLocksOf(boxDef.id);
  const [views, setViews] = useState<Record<string, SeanceView>>(() => Object.fromEntries(tables.map((v) => [v.slug, v])));
  const [entries, setEntries] = useState<Record<string, string[]>>({});
  const [active, setActive] = useState(initialSlug);
  const [restoreDone, setRestoreDone] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [ranked, setRanked] = useState<boolean | null>(null);
  const restored = useRef(false);
  const day = useMemo(() => store.progress[date] ?? {}, [store.progress, date]);
  const isArchive = date < today;
  const noHints = store.settings.noHints;
  const inPlay = tables.filter((v) => v.status !== "sealed").length;
  const q = isArchive ? `?d=${date}` : "";

  const persist = useCallback((slug: string, v: PlayResponse, sent: string[]) => {
    const list = v.account?.guesses ?? v.entries ?? sent;
    setEntries((e) => ({ ...e, [slug]: list }));
    if (v.account) setRanked(v.account.ranked);
    if (list.length === 0) return;
    const prev = store.progress[date]?.[slug];
    const done = finished(v.status);
    setRecord(date, slug, {
      g: list,
      s: v.status === "won" ? "won" : v.status === "lost" ? "lost" : "playing",
      w: v.mistakes,
      h: noHints ? 0 : v.hintsUsed,
      souls: done ? v.souls ?? 0 : 0,
      archive: prev?.archive ?? isArchive,
      ranked: v.account?.ranked,
      at: done ? (prev?.at ?? Date.now()) : undefined,
      tables: inPlay,
    });
  }, [store.progress, date, noHints, isArchive, inPlay, setRecord]);

  // Restore saved submissions (local or account) for every table once hydrated.
  useEffect(() => {
    if (!hydrated || restored.current) return;
    restored.current = true;
    const todo = tables.filter((v) => v.status !== "sealed" && (user || (day[v.slug]?.g.length ?? 0) > 0));
    Promise.all(todo.map(async (v) => {
      const sent = day[v.slug]?.g ?? [];
      const r = await evaluateRemote({ date, slug: v.slug, guesses: sent, noHints });
      setViews((all) => ({ ...all, [v.slug]: r }));
      persist(v.slug, r, sent);
    }))
      .catch(() => toast(t.lock.error))
      .finally(() => setRestoreDone(true));
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectTab = (slug: string) => {
    setActive(slug);
    try { window.history.replaceState(null, "", `/lock/${slug}${q}`); } catch { /* ignore */ }
  };

  const submit = async (slug: string, entry: string): Promise<PlayResponse | null> => {
    const sent = [...(entries[slug] ?? day[slug]?.g ?? []), entry];
    try {
      const v = await evaluateRemote({ date, slug, guesses: sent, noHints });
      setViews((all) => ({ ...all, [slug]: v }));
      persist(slug, v, sent);
      return v;
    } catch {
      toast(t.lock.error);
      return null;
    }
  };

  // Next: the next unfinished table in this box, then the next unfinished lock after the Séance.
  const nextHref = useMemo(() => {
    const SEANCE_LOCKS = seanceLocksOf(boxDef.id);
    const idx = SEANCE_LOCKS.findIndex((l) => l.slug === active);
    const order = [...SEANCE_LOCKS.slice(idx + 1), ...SEANCE_LOCKS.slice(0, idx)];
    const table = order.find((l) => views[l.slug]?.status === "playing" && !finished(day[l.slug]?.s));
    if (table) return { table: table.slug, href: null };
    const next = LOCKS.find((l) => !l.box && available.includes(l.slug) && !finished(day[l.slug]?.s));
    return { table: null, href: next ? `/lock/${next.slug}${q}` : isArchive ? `/archive/${date}` : "/" };
  }, [active, views, day, available, q, isArchive, date, boxDef.id]);

  if (!hydrated) return <KeyholeLoader />;
  const view = views[active];
  const lock = LOCK_BY_SLUG[active];
  const allDone = inPlay > 0 && tables.every((v) => v.status === "sealed" || finished(views[v.slug]?.status) || finished(day[v.slug]?.s));
  const box = boxSouls(tables.filter((v) => v.status !== "sealed").map((v) => (finished(day[v.slug]?.s) ? day[v.slug]!.souls : 0)), inPlay);

  return (
    <div className="space-y-5 pb-32 md:pb-10">
      {/* Tabs: Mechanics · Visuals · Lore · Mixed, each with its seal */}
      <div role="tablist" aria-label={t.seance.tables} className="grid grid-cols-4 gap-1.5">
        {SEANCE_LOCKS.map((l) => {
          const seal = sealOf(views[l.slug], day[l.slug]);
          const selected = l.slug === active;
          return (
            <button
              key={l.slug}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls="seance-board"
              onClick={() => selectTab(l.slug)}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[3px] border px-1 py-1.5 text-sm sm:flex-row sm:gap-2 ${selected ? "border-brass bg-brass/15 text-paper" : "border-brass/25 text-ash hover:border-brass/60 hover:text-paper"}`}
            >
              <WaxSeal state={seal} className="h-5 w-5 shrink-0" />
              <span className="truncate">{l.table!.label}</span>
              <span className="sr-only">({t.seance.seal[seal === "intact" ? "open" : seal]})</span>
            </button>
          );
        })}
      </div>

      {isArchive && <div className="rounded-sm border border-brass/50 bg-brass/10 px-4 py-2 text-center text-sm text-brass">{t.vault.archiveBanner}</div>}
      {user && !isArchive && ranked === false && (
        <p className="text-center text-xs text-ash">
          Unranked: this table was started before you signed in, so it counts for your stats but not the <Link href="/hall" className="text-brass underline-offset-4 hover:underline">leaderboards</Link>.
        </p>
      )}

      <div id="seance-board" role="tabpanel" aria-label={`${lock.name} · ${lock.table!.label}`}>
        {view.status === "sealed" ? (
          <DecoFrame className="p-8 text-center">
            <WaxSeal state="sealed" className="mx-auto mb-3 h-12 w-12" />
            <p className="font-display text-xl text-paper">{t.vault.sealed}</p>
            <p className="mt-2 text-ash">{t.seance.sealedTable}</p>
          </DecoFrame>
        ) : (
          <SeanceTable
            key={active}
            view={view}
            restoring={!restoreDone && (!!user || (day[active]?.g.length ?? 0) > 0)}
            rules={rules}
            showRules={showRules}
            setShowRules={setShowRules}
            noHints={noHints}
            noun={boxDef.noun}
            contain={boxDef.entity !== "hero"}
            onSubmit={(entry) => submit(active, entry)}
            onSound={play}
            footer={(v) => (
              <>
                {v.share && (
                  <ShareButton text={shareTable({ number, box: boxDef.name, table: lock.table!.label, rows: v.share, won: v.status === "won", mistakes: v.mistakes, souls: v.souls ?? 0, site })} />
                )}
                {nextHref.table ? (
                  <button type="button" onClick={() => selectTab(nextHref.table!)} className="inline-flex min-h-11 items-center gap-2 rounded-[3px] border border-ecto/60 bg-ecto/10 px-4 py-2 text-ecto hover:bg-ecto/20">
                    {t.seance.nextTable}: {LOCK_BY_SLUG[nextHref.table].table!.label} <Icon name="arrow-right" className="h-4 w-4" />
                  </button>
                ) : (
                  <Link href={nextHref.href!} className="inline-flex min-h-11 items-center gap-2 rounded-[3px] border border-ecto/60 bg-ecto/10 px-4 py-2 text-ecto hover:bg-ecto/20">
                    {t.lock.nextLock} <Icon name="arrow-right" className="h-4 w-4" />
                  </Link>
                )}
              </>
            )}
          />
        )}
      </div>

      {allDone && (
        <DecoFrame className="p-4 text-center shadow-[0_0_40px_rgba(127,227,194,0.15)]" corners={false}>
          <p className="smallcaps text-sm text-brass">{boxDef.name}</p>
          <p className="font-mono text-3xl text-paper">{box} <span className="text-base text-ash">souls</span></p>
          <p className="text-xs text-ash">Average of {inPlay} {inPlay === 1 ? "table" : "tables"}</p>
        </DecoFrame>
      )}

      {isArchive && (
        <p className="text-center text-sm">
          <Link className="text-brass underline-offset-4 hover:underline" href={`/archive/${date}`}>Back to this day&apos;s vault</Link>
        </p>
      )}
    </div>
  );
}

// ───────────── one table ─────────────

function SeanceTable({
  view, restoring, rules, showRules, setShowRules, noun, contain, onSubmit, onSound, footer,
}: {
  noun: string;
  /** Items and abilities are icons: show them whole instead of cropping like a portrait. */
  contain: boolean;
  view: SeanceView;
  restoring: boolean;
  rules: string;
  showRules: boolean;
  setShowRules: (fn: (s: boolean) => boolean) => void;
  noHints: boolean;
  onSubmit: (entry: string) => Promise<PlayResponse | null>;
  onSound: (s: "click" | "tick" | "creak") => void;
  footer: (v: SeanceView) => React.ReactNode;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>(() => view.heroes.map((h) => h.id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  // Loss reveal: the remaining groups appear one by one (only right after the losing pick).
  const [revealed, setRevealed] = useState<number | null>(null);
  const done = view.status === "won" || view.status === "lost";

  const byId = useMemo(() => new Map(view.heroes.map((h) => [h.id, h])), [view.heroes]);
  const found = view.groups.filter((g) => g.found);
  const missed = view.groups.filter((g) => !g.found);
  const bands: GroupView[] = [...found, ...missed.slice(0, revealed ?? missed.length)];
  const inBands = new Set(bands.flatMap((g) => g.members.map((m) => m.id)));
  const remaining = order.filter((id) => !inBands.has(id));
  const tried = useMemo(() => new Set(view.history.map((h) => sortedKey(h.ids))), [view.history]);
  const ns = view.slug;

  const toggle = (id: number) => {
    if (busy || done) return;
    setMessage(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
  };

  const submit = async () => {
    if (busy || done || selected.length !== 4) return;
    if (tried.has(sortedKey(selected))) {
      setMessage(t.seance.repeat);
      return;
    }
    setBusy(true);
    const v = await onSubmit(selected.join(","));
    setBusy(false);
    if (!v) return;
    const last = v.history.at(-1);
    if (last?.result === "correct") {
      onSound("click");
      setSelected([]);
      setMessage(null);
    } else {
      onSound("tick");
      setShake((n) => n + 1);
      setMessage(last?.result === "one-away" ? t.seance.oneAway : t.seance.wrong);
    }
    if (v.status === "lost") {
      setSelected([]);
      const n = v.groups.filter((g) => !g.found).length;
      setRevealed(0);
      for (let i = 1; i <= n; i++) setTimeout(() => setRevealed(i), 700 * i);
    }
    if (v.status === "won") setTimeout(() => onSound("creak"), 400);
  };

  const shuffle = () => {
    const pos = order.map((id, i) => ({ id, i })).filter((x) => !inBands.has(x.id));
    const ids = pos.map((x) => x.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const next = [...order];
    pos.forEach((x, k) => { next[x.i] = ids[k]; });
    setOrder(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <LockpickRow total={view.maxMistakes} broken={view.mistakes} glowing={view.status === "won"} />
        <button type="button" onClick={() => setShowRules((s) => !s)} aria-expanded={showRules} className="flex h-11 w-11 items-center justify-center text-brass" aria-label={t.lock.rules}>
          <Icon name="question" className="h-6 w-6" />
        </button>
      </div>
      {showRules && (
        <DecoFrame className="p-4 text-sm leading-relaxed text-paper/90" corners={false}>
          <p>{rules}</p>
        </DecoFrame>
      )}

      {restoring && <KeyholeLoader />}

      <DecoFrame className="seance-table p-2 sm:p-3">
        <div className="mx-auto max-w-[520px] space-y-2">
          <AnimatePresence initial={false}>
            {bands.map((g) => <Band key={g.rank} ns={ns} group={g} done={done} contain={contain} />)}
          </AnimatePresence>
          {remaining.length > 0 && (
            <ul className="grid grid-cols-4 gap-1.5 sm:gap-2" aria-label={`${noun} on the table`}>
              {remaining.map((id) => {
                const h = byId.get(id)!;
                const isSel = selected.includes(id);
                return (
                  <li key={id}>
                    <Tile ns={ns} hero={h} contain={contain} selected={isSel} disabled={done || busy || restoring} shake={isSel ? shake : 0} onClick={() => toggle(id)} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DecoFrame>

      <p aria-live="polite" className="min-h-6 text-center text-sm text-brass">{message}</p>

      {done ? (
        <DecoFrame className="space-y-3 p-5 text-center" corners={false}>
          <p className={`font-display text-2xl ${view.status === "won" ? "text-ecto" : "text-[#d08a8a]"}`}>{view.status === "won" ? t.seance.won : t.seance.lost}</p>
          <p className="text-paper">
            {t.seance.mistakes(view.mistakes)}{view.hintsUsed ? " · 1 hint" : ""} · <span className="font-mono text-xl">{view.souls ?? 0}</span> souls
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">{footer(view)}</div>
        </DecoFrame>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brass/30 bg-ink/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <div className="mx-auto flex max-w-[820px] flex-wrap items-center justify-center gap-2">
            <Button variant="ghost" onClick={shuffle} disabled={busy || restoring}>{t.seance.shuffle}</Button>
            <Button variant="ghost" onClick={() => { setSelected([]); setMessage(null); }} disabled={busy || selected.length === 0}>{t.seance.deselect}</Button>
            <Button onClick={submit} disabled={busy || restoring || selected.length !== 4} aria-describedby="seance-count" className="min-w-28">
              {t.seance.submit}
            </Button>
            <span id="seance-count" className="sr-only">{t.seance.pickFour(selected.length)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ ns, hero, contain, selected, disabled, shake, onClick }: { ns: string; hero: SeanceHero; contain: boolean; selected: boolean; disabled: boolean; shake: number; onClick: () => void }) {
  const controls = useAnimationControls();
  // A gentle shake on a mistake (skipped with reduced motion: MotionConfig drops transform animations).
  useEffect(() => {
    if (shake) void controls.start({ x: [0, -5, 5, -3, 3, 0], transition: { duration: 0.4 } });
  }, [shake, controls]);
  return (
    <motion.button
      type="button"
      layoutId={`${ns}-hero-${hero.id}`}
      transition={{ layout: { duration: 0.35, ease: "easeInOut" } }}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      animate={controls}
      className={`flex min-h-11 w-full flex-col items-center gap-1 rounded-[3px] border p-1 text-center transition-[translate,border-color,background-color] disabled:cursor-default ${selected ? "-translate-y-1 border-ecto bg-iron-2 shadow-[0_0_0_1px_var(--ecto),0_6px_14px_rgba(0,0,0,0.5)]" : "border-brass/30 bg-iron/90 hover:border-brass/70"}`}
    >
      <span className="block aspect-square w-full overflow-hidden rounded-[2px] bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {hero.image && <img src={hero.image} alt="" loading="lazy" className={`h-full w-full ${contain ? "object-contain p-1" : "object-cover object-top"}`} draggable={false} />}
      </span>
      <span className={`line-clamp-2 flex min-h-[2lh] w-full items-center justify-center break-words text-[12px] leading-tight sm:min-h-0 sm:text-[13px] ${selected ? "text-ecto" : "text-paper"}`}>{hero.name}</span>
    </motion.button>
  );
}

function Band({ ns, group, done, contain }: { ns: string; group: GroupView; done: boolean; contain: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`seance-band-${group.rank} rounded-[3px] px-2 py-2 sm:px-3`}
    >
      <div className="flex items-baseline justify-center gap-2 text-center">
        <span className="font-display text-xs opacity-80" aria-label={`Group ${group.rank} of 4 (difficulty)`}>{NUMERALS[group.rank]}</span>
        <span className="smallcaps font-semibold">{group.label}</span>
        {!group.found && <span className="text-xs opacity-75">(missed)</span>}
      </div>
      {done && group.explanation && <p className="mt-0.5 text-center text-xs opacity-85">{group.explanation}</p>}
      <ul className="mt-1.5 grid grid-cols-4 gap-1.5">
        {group.members.map((m) => (
          <li key={m.id} className="flex flex-col items-center">
            <motion.span layoutId={`${ns}-hero-${m.id}`} transition={{ layout: { duration: 0.35, ease: "easeInOut" } }} className="block h-9 w-9 overflow-hidden rounded-full border border-black/30 bg-ink sm:h-11 sm:w-11">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.image && <img src={m.image} alt="" className={`h-full w-full ${contain ? "object-contain p-0.5" : "object-cover object-top"}`} draggable={false} />}
            </motion.span>
            <span className="mt-0.5 line-clamp-1 text-[11px] leading-tight sm:text-xs">{m.name}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
