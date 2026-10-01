"use client";
// Clue stage renderers for the 14 guessing locks (The Omens have their own stage in omens/). Clue images get neutral alt text so answers don't leak.
import { Fragment, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { CatalogEntry, Clue, GuessRow } from "@/lib/engine/types";
import { CENSOR } from "@/lib/text/redact";
import { DecoFrame, Icon, SlotDot } from "./ui";
import { useGame } from "./GameProvider";
import { t } from "@/lib/i18n/en";
import { SoundStage } from "./SoundPlayer";
import { CacheStage, ConstellationStage, DecoyStage, StatsStage } from "./BoardStages";

const CLUE_ALT = "Today's clue image";

// ───────────── shared ─────────────

export function Redacted({ text }: { text: string }) {
  const parts = text.split(CENSOR);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="censor" aria-label="redacted" role="img">{" ".repeat(6)}</span>}
        </span>
      ))}
    </>
  );
}

function Peephole({ children, size = "lg", bg = "bg-ink" }: { children: React.ReactNode; size?: "lg" | "md"; bg?: string }) {
  const dim = size === "lg" ? "h-64 w-64 md:h-80 md:w-80" : "h-52 w-52 md:h-60 md:w-60";
  return (
    <div className="flex justify-center py-2">
      <div className={`clue-layer relative ${dim} overflow-hidden rounded-full border-4 border-brass/70 ${bg} shadow-[inset_0_0_30px_rgba(0,0,0,0.9),0_0_0_6px_rgba(26,24,22,1),0_0_0_7px_rgba(201,164,92,0.4)]`}>
        {children}
        <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_40px_rgba(0,0,0,0.85)]" />
      </div>
    </div>
  );
}

export function twemojiUrl(emoji: string): string {
  const cps = Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16));
  const hasZwj = cps.includes("200d");
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${cps.filter((c) => hasZwj || c !== "fe0f").join("-")}.svg`;
}

// ───────────── stages ─────────────

function SplashStage({ clue }: { clue: Extract<Clue, { kind: "splash" }> }) {
  return (
    <>
      <Peephole bg={clue.silhouette ? "bg-[radial-gradient(circle,#efe4cc,#c9b994)]" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={clue.image}
          alt={CLUE_ALT}
          draggable={false}
          className={`h-full w-full select-none transition-transform duration-700 ease-out ${clue.silhouette ? "object-contain" : "object-cover"} ${clue.dark ? "[filter:invert(1)_hue-rotate(180deg)_brightness(0.8)]" : ""}`}
          style={{
            transform: `scale(${clue.zoom})`,
            transformOrigin: `${clue.originX}% ${clue.originY}%`,
          }}
        />
      </Peephole>
      {clue.steps && clue.step !== undefined && (
        <div className="mx-auto mt-2 flex max-w-48 gap-1" aria-label={`Reveal ${clue.step} of ${clue.steps}`}>
          {Array.from({ length: clue.steps }, (_, i) => <span key={i} className={`h-1 flex-1 rounded ${i < clue.step! ? "bg-brass" : "bg-brass/25"}`} />)}
        </div>
      )}
    </>
  );
}

function SigilStage({ clue }: { clue: Extract<Clue, { kind: "sigil" }> }) {
  const n = clue.grid;
  const covered = new Set(clue.covered);
  return (
    <div className="flex justify-center py-2">
      <div className="clue-layer relative h-56 w-56 overflow-hidden rounded-sm border border-brass/50 bg-[radial-gradient(circle,#2a2520,#0e0d0b)] md:h-64 md:w-64">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={clue.image} alt={CLUE_ALT} draggable={false} className="absolute inset-0 h-full w-full select-none object-contain p-6 transition-transform duration-500" style={clue.rotate ? { transform: `rotate(${clue.rotate}deg)` } : undefined} />
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {Array.from({ length: n * n }, (_, i) => (
            <div key={i} className="relative">
              <AnimatePresence>
                {covered.has(i) && (
                  <motion.div
                    className="absolute -inset-px bg-[#2a241e]"
                    initial={false}
                    exit={{ y: 40, opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeIn" }}
                  >
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TextStage({ clue, done }: { clue: Extract<Clue, { kind: "text" }>; done: boolean }) {
  return (
    <div className="paper clue-layer space-y-4 rounded-sm p-5 text-[1.05rem] leading-relaxed shadow-inner md:p-7">
      <AnimatePresence initial={false}>
        {clue.sections.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            {s.label && <div className="smallcaps mb-1 text-sm font-semibold text-[#7a5a1c]">{s.label}</div>}
            <p className="whitespace-pre-line"><Redacted text={s.text} /></p>
          </motion.div>
        ))}
      </AnimatePresence>
      {clue.total > clue.sections.length && (
        <div className="flex gap-1.5 pt-1" aria-label={`${clue.sections.length} of ${clue.total} shown`}>
          {Array.from({ length: clue.total }, (_, i) => (
            <span key={i} className={`h-1 flex-1 rounded ${i < clue.sections.length ? "bg-[#7a5a1c]" : "bg-[#7a5a1c]/25"}`} />
          ))}
        </div>
      )}
      {clue.image && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={clue.image} alt={CLUE_ALT} className={`h-20 w-20 rounded bg-[#1a1816] object-contain p-2 transition-[filter] duration-700 ${done ? "" : "blur-[5px]"}`} />
        </motion.div>
      )}
    </div>
  );
}

const PATH_LABELS = ["1", "2", "3", "Ult"];

/** Order the hero's ability points are spent: one row per ability slot, one column per point. */
function AbilityPath({ path }: { path: number[] }) {
  return (
    <div className="mt-4 border-t border-brass/20 pt-3" role="img" aria-label={`Ability point order: ${path.map((s) => PATH_LABELS[s - 1]).join(", ")}`}>
      <p className="smallcaps mb-2 text-xs text-brass">Ability level path</p>
      <div className="grid items-center gap-x-1 gap-y-1 font-mono text-[0.65rem]" style={{ gridTemplateColumns: `2rem repeat(${path.length}, minmax(0, 1fr))` }}>
        <span />
        {path.map((_, i) => <span key={i} className="text-center text-ash/70">{i + 1}</span>)}
        {PATH_LABELS.map((label, row) => (
          <Fragment key={label}>
            <span className="text-ash">{label}</span>
            {path.map((s, i) => (
              <span key={i} className={`h-4 rounded-[2px] ${s === row + 1 ? "bg-brass" : "bg-ink/60"}`} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function BuildStage({ clue }: { clue: Extract<Clue, { kind: "build" }> }) {
  return (
    <div className="clue-layer rounded-sm border border-brass/40 bg-[radial-gradient(ellipse_at_top,#5a2429,#2a0f12)] p-4 shadow-[inset_0_0_30px_rgba(0,0,0,0.7)]">
      <p className="smallcaps mb-3 text-xs text-brass">The core items that define this hero&apos;s build</p>
      <ul className="grid grid-cols-4 gap-3">
        {Array.from({ length: clue.total }, (_, i) => {
          const it = clue.items[i];
          return (
            <li key={i} className="aspect-square">
              {it ? (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className={`group relative flex h-full w-full items-center justify-center rounded-sm bg-ink/70 p-1.5 slot-edge-${it.slot}`}
                  tabIndex={0}
                  title={it.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.image ?? ""} alt={it.name} className="h-full w-full object-contain" />
                  <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-xs text-paper shadow group-hover:block group-focus:block">
                    {it.name}
                  </span>
                </motion.div>
              ) : (
                <div className="h-full w-full rounded-sm border border-dashed border-brass/20" />
              )}
            </li>
          );
        })}
      </ul>
      {clue.path && <AbilityPath path={clue.path} />}
    </div>
  );
}

function EmojiStage({ clue }: { clue: Extract<Clue, { kind: "emoji" }> }) {
  const { store } = useGame();
  const color = store.settings.colorEmoji;
  return (
    <DecoFrame className="clue-layer p-4 md:p-6">
      <ol className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${clue.slots.length}, minmax(0, 1fr))` }}>
        {clue.slots.map((e, i) => (
          <li key={i} className="aspect-square [perspective:600px]">
            <motion.div
              className="relative h-full w-full [transform-style:preserve-3d]"
              initial={false}
              animate={{ rotateX: e ? 0 : 180 }}
              transition={{ duration: 0.45 }}
            >
              <div className="absolute inset-0 flex items-center justify-center rounded-sm border border-brass/50 bg-[radial-gradient(circle,#2a2520,#141210)] shadow-[inset_0_0_12px_rgba(201,164,92,0.25)] [backface-visibility:hidden]">
                {e &&
                  (color ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={twemojiUrl(e)} alt={`Clue ${i + 1}`} className="h-3/5 w-3/5" />
                  ) : (
                    <span className="cipher-glyph text-4xl md:text-5xl" role="img" aria-label={`Clue ${i + 1}`}>{e}</span>
                  ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center rounded-sm border border-brass/60 bg-[linear-gradient(145deg,#3a3129,#1d1a16)] [backface-visibility:hidden] [transform:rotateX(180deg)]">
                <span className="font-display text-3xl text-brass">?</span>
              </div>
            </motion.div>
          </li>
        ))}
      </ol>
    </DecoFrame>
  );
}

function Typewriter({ text, animate }: { text: string; animate: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 1)), 20);
    return () => clearInterval(id);
  }, [text, animate]);
  const shown = animate ? text.slice(0, n) : text;
  return (
    <>
      <span className="sr-only">{text.replaceAll(CENSOR, "redacted")}</span>
      <span aria-hidden><Redacted text={shown} /></span>
    </>
  );
}

export function EchoStage({ clue, showAudio = false, typewriter = true }: { clue: Extract<Clue, { kind: "echo" }>; showAudio?: boolean; typewriter?: boolean }) {
  const { reducedMotion } = useGame();
  const [seen] = useState(() => clue.lines.length);
  return (
    <ol className="clue-layer space-y-3">
      {clue.note && <li className="smallcaps text-center text-sm text-brass">{clue.note}</li>}
      <AnimatePresence initial={false}>
        {[...clue.lines].reverse().map((l, ri) => {
          const i = clue.lines.length - 1 - ri;
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}
              className="paper relative flex items-start gap-3 rounded-sm py-3 pl-8 pr-4 font-mono text-[0.95rem] shadow"
            >
              <span className="absolute left-2.5 top-3.5 h-3 w-3 rounded-full bg-[radial-gradient(circle_at_35%_35%,#f1d69a,#8f743f)] shadow" aria-hidden />
              <span className="flex-1">“<Typewriter text={l.text} animate={typewriter && !reducedMotion && i >= seen} />”</span>
              {showAudio && l.audio && <AudioButton src={l.audio} small />}
            </motion.li>
          );
        })}
      </AnimatePresence>
      {clue.total > clue.lines.length && (
        <li className="text-center font-mono text-xs text-ash">{clue.lines.length} / {clue.total}</li>
      )}
    </ol>
  );
}

/** The Colloquy: both sides of a conversation, the answer's lines marked "?" and the other hero named. */
function ConvoStage({ clue }: { clue: Extract<Clue, { kind: "convo" }> }) {
  const { reducedMotion } = useGame();
  const [seen] = useState(() => clue.lines.length);
  return (
    <div className="clue-layer space-y-3">
      <div className="flex items-center justify-center gap-3 text-sm">
        <span className="rounded-sm border border-brass/40 bg-ink/60 px-3 py-1 font-display text-brass">?</span>
        <span className="text-ash">talking to</span>
        <span className="flex items-center gap-2 rounded-sm border border-brass/40 bg-ink/60 px-3 py-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {clue.other?.image && <img src={clue.other.image} alt="" className="h-7 w-7 rounded-sm object-contain" />}
          <span className={clue.other ? "text-paper" : "font-display text-brass"}>{clue.other?.name ?? "?"}</span>
        </span>
      </div>
      <ol className="space-y-3">
        <AnimatePresence initial={false}>
          {clue.lines.map((l, i) => {
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                className={`paper relative rounded-sm py-3 pr-4 font-mono text-[0.95rem] shadow ${l.mine ? "ml-6 pl-5" : "mr-6 pl-5"}`}
              >
                <span className="mb-0.5 block text-xs text-[#7a5a1c]">{l.mine ? "?" : clue.other?.name ?? "Someone else"}</span>
                “<Typewriter text={l.text} animate={!reducedMotion && i >= seen} />”
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {clue.total > clue.shown && <p className="text-center font-mono text-xs text-ash">{clue.shown} / {clue.total}</p>}
    </div>
  );
}

/** Brass speaker grille; thin ecto progress ring while playing. Never autoplays. */
export function AudioButton({ src, small = false, label = "Play voice clip" }: { src: string; small?: boolean; label?: string }) {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => audio?.pause(), [audio]);
  const toggle = () => {
    let a = audio;
    if (!a) {
      a = new Audio(src);
      a.ontimeupdate = () => setProgress(a!.duration ? a!.currentTime / a!.duration : 0);
      a.onended = () => { setPlaying(false); setProgress(0); };
      setAudio(a);
    }
    if (playing) { a.pause(); setPlaying(false); } else { void a.play(); setPlaying(true); }
  };
  const size = small ? 36 : 48;
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <button type="button" onClick={toggle} aria-label={label} aria-pressed={playing} className="relative inline-flex shrink-0 items-center justify-center rounded-full border border-brass/60 bg-[repeating-radial-gradient(circle,#3a3129_0_2px,#1d1a16_2px_4px)] text-brass" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 -rotate-90" width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ecto)" strokeWidth="2" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} opacity={playing ? 1 : 0} />
      </svg>
      <Icon name="speaker" className={small ? "h-4 w-4" : "h-5 w-5"} />
    </button>
  );
}

function RelicStage({ clue }: { clue: Extract<Clue, { kind: "relic" }> }) {
  return (
    <Peephole size="md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={clue.image}
        alt={CLUE_ALT}
        draggable={false}
        className="h-full w-full select-none object-contain p-8 transition-[filter,transform] duration-700"
        style={{
          filter: `${clue.blur ? `blur(${clue.blur}px)` : ""}${clue.dark ? " invert(1) hue-rotate(180deg) brightness(0.8)" : ""}` || undefined,
          transform: clue.rotate ? `rotate(${clue.rotate}deg)` : undefined,
        }}
      />
    </Peephole>
  );
}

function ItemSlot({ item, unknownSlot }: { item?: { name: string; image: string | null; slot: string }; unknownSlot?: string }) {
  if (!item) {
    return (
      <div className={`flex h-36 w-32 flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed bg-ink/50 ${unknownSlot === "weapon" ? "border-slot-weapon/70" : unknownSlot === "vitality" ? "border-slot-vitality/70" : "border-slot-spirit/70"}`}>
        <span className="font-display text-5xl text-brass">?</span>
        {unknownSlot && <span className="flex items-center gap-1.5 text-xs capitalize text-ash"><SlotDot slot={unknownSlot} />{unknownSlot}</span>}
      </div>
    );
  }
  return (
    <div className={`flex h-36 w-32 flex-col items-center justify-center gap-2 rounded-sm bg-ink/70 p-2 slot-edge-${item.slot}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.image ?? ""} alt="" className="h-16 w-16 object-contain" />
      <span className="text-center text-sm leading-tight">{item.name}</span>
    </div>
  );
}

function LineageStage({ clue }: { clue: Extract<Clue, { kind: "lineage" }> }) {
  const into = clue.direction === "into";
  return (
    <DecoFrame className="clue-layer flex flex-col items-center gap-3 p-5">
      <p className="smallcaps text-sm text-brass">{into ? "builds into →" : "← built from"}</p>
      <div className="flex items-center gap-3 md:gap-6">
        {into ? <ItemSlot item={clue.shown} /> : <ItemSlot unknownSlot={clue.answerSlot} />}
        <Icon name="arrow-right" className="h-8 w-8 shrink-0 text-brass" />
        {into ? <ItemSlot unknownSlot={clue.answerSlot} /> : <ItemSlot item={clue.shown} />}
      </div>
      <p className="text-center text-sm text-ash">
        {into ? "What does this item build into?" : "Which component builds into this item?"}
      </p>
    </DecoFrame>
  );
}

/** Measure: item card + vertical brass dial that narrows the range with each guess. */
function MeasureStage({ clue, rows }: { clue: Extract<Clue, { kind: "measure" }>; rows: GuessRow[] }) {
  let low: number | null = null, high: number | null = null;
  for (const r of rows) {
    const v = Number(r.id);
    if (r.arrow === "up") low = low === null ? v : Math.max(low, v);
    if (r.arrow === "down") high = high === null ? v : Math.min(high, v);
  }
  const vals = rows.map((r) => Number(r.id));
  const min = Math.min(0, ...vals), max = Math.max(10, ...vals.map((v) => v * 1.2));
  const pct = (v: number) => 100 - ((v - min) / (max - min || 1)) * 100;
  return (
    <DecoFrame className="clue-layer flex gap-4 p-4 md:p-6">
      <div className="flex-1">
        <div className={`mb-3 flex items-center gap-3 rounded-sm bg-ink/60 p-2 slot-edge-${clue.item.slot}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={clue.item.image ?? ""} alt="" className="h-16 w-16 object-contain" />
          <div>
            <div className="text-lg">{clue.item.name}</div>
            <div className="flex items-center gap-1.5 font-mono text-xs capitalize text-ash"><SlotDot slot={clue.item.slot} />{clue.item.slot}</div>
          </div>
        </div>
        <ul className="space-y-1.5 font-mono">
          {clue.stats.map((s, i) => (
            <li key={i} className={`flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 ${s.hidden ? "bg-ecto/10 shadow-[0_0_12px_rgba(127,227,194,0.25)] ring-1 ring-ecto/50" : ""}`}>
              <span className="font-body text-paper/90">{s.label}</span>
              <span className={s.hidden && !s.display ? "text-ecto" : "text-brass"}>{s.display ?? `+??${s.postfix}`}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex w-20 shrink-0 flex-col" role="img" aria-label="Guess gauge">
        <span className="smallcaps mb-1 text-center text-[0.6rem] text-ash">High</span>
        <div className="relative flex-1 min-h-48 rounded-full border border-brass/50 bg-[linear-gradient(180deg,#2a241e,#12100e)] shadow-[inset_0_0_14px_rgba(0,0,0,0.85)]">
          {/* tick marks */}
          {[0, 25, 50, 75, 100].map((p) => (
            <span key={p} className="absolute left-1/2 h-px w-3 -translate-x-1/2 bg-brass/30" style={{ top: `${p}%` }} />
          ))}
          {/* the range the answer can still be in */}
          <div
            className="absolute inset-x-1 rounded-full bg-ecto/20 shadow-[0_0_14px_rgba(127,227,194,0.3)] ring-1 ring-ecto/50 transition-all duration-500"
            style={{ top: `${high === null ? 0 : pct(high)}%`, bottom: `${low === null ? 0 : 100 - pct(low)}%` }}
          />
          {rows.map((r, i) => (
            <div key={i} className="absolute inset-x-0 flex -translate-y-1/2 items-center justify-center" style={{ top: `${pct(Number(r.id))}%` }}>
              <span className={`rounded-full border px-1.5 py-px font-mono text-[0.65rem] shadow ${r.correct ? "border-ecto bg-ecto/20 text-ecto" : "border-brass/60 bg-ink text-paper"}`}>
                {r.arrow === "up" ? "▲ " : r.arrow === "down" ? "▼ " : ""}{r.id}
              </span>
            </div>
          ))}
        </div>
        <span className="smallcaps mt-1 text-center text-[0.6rem] text-ash">Low</span>
      </div>
    </DecoFrame>
  );
}

function GridLegend({ subject }: { subject: "hero" | "item" }) {
  const item = (cls: string, icon: "check" | "approx" | "cross" | "up" | "down", label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={`flex h-6 w-6 items-center justify-center rounded-sm ${cls}`}><Icon name={icon} className="h-4 w-4" /></span>
      {label}
    </span>
  );
  return (
    <DecoFrame className="clue-layer p-4" corners={false}>
      <p className="mb-2 text-sm text-ash">{subject === "hero" ? t.lock.legendHero : t.lock.legendItem}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {item("tile-match", "check", "Match")}
        {item("tile-partial", "approx", "Partial")}
        {item("tile-miss", "cross", "No match")}
        {item("tile-miss", "up", "Higher")}
        {item("tile-miss", "down", "Lower")}
      </div>
    </DecoFrame>
  );
}

export function ClueStage({ clue, rows, done = false, subject = "hero", onGuess, entries, busy, disabled }: {
  clue: Clue; rows: GuessRow[]; done?: boolean; subject?: "hero" | "item";
  /** Board locks (The Decoy, The Cache, The Constellation) take their guesses in the stage itself. */
  onGuess?: (id: string) => Promise<boolean>; busy?: boolean; disabled?: boolean;
  /** Search suggestions for the board locks that take a typed name (The Constellation). */
  entries?: CatalogEntry[];
}) {
  const play = { onGuess, busy, disabled, done };
  switch (clue.kind) {
    case "stats": return <StatsStage clue={clue} />;
    case "decoy": return <DecoyStage clue={clue} picked={new Map(rows.map((r) => [r.id, r.correct]))} {...play} />;
    case "cache": return <CacheStage clue={clue} {...play} />;
    case "constellation": return <ConstellationStage clue={clue} entries={entries ?? []} {...play} />;
    case "grid": return <GridLegend subject={subject} />;
    case "splash": return <SplashStage clue={clue} />;
    case "sigil": return <SigilStage clue={clue} />;
    case "text": return <TextStage clue={clue} done={done} />;
    case "build": return <BuildStage clue={clue} />;
    case "emoji": return <EmojiStage clue={clue} />;
    case "echo": return <EchoStage clue={clue} typewriter={!done} showAudio={done} />;
    case "convo": return <ConvoStage clue={clue} />;
    case "sound": return <SoundStage clue={clue} done={done} />;
    case "relic": return <RelicStage clue={clue} />;
    case "lineage": return <LineageStage clue={clue} />;
    case "measure": return <MeasureStage clue={clue} rows={rows} />;
  }
}
