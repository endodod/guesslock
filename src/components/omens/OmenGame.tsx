"use client";
// The Omen screen: map + team panels + predictions; after lock-in, the window replays on the map
// (2x by default) and the results panel scores each question.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { OmenAnswer, OmenKind, OmenSnapshot, Team, WindowEvent } from "@/lib/omens/types";
import type { OmenReveal, OmenView } from "@/lib/omens/serve";
import type { OmenMapMeta } from "@/lib/omens/map";
import { useGame } from "../GameProvider";
import { Modal } from "../Chrome";
import { Button, DecoFrame, Icon } from "../ui";
import { OmenMap, type MapHero, type MapMarker } from "./OmenMap";
import { TeamPanel, TEAM_LABEL, type OmenCatalog } from "./OmenPanels";
import { OmenQuestions, draftAnswer, emptyDraft, type Draft } from "./OmenQuestions";

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Props = {
  omen: OmenKind;
  initial: OmenView;
  cat: OmenCatalog;
  map: OmenMapMeta;
  /** Answers already locked in (restores the reveal without replaying it). */
  saved?: OmenAnswer;
  submit: (answers: OmenAnswer) => Promise<OmenView>;
  onLocked?: (view: OmenView, answers: OmenAnswer) => void;
  /** Share/next links etc. under the results. */
  footer?: (reveal: OmenReveal) => React.ReactNode;
  /** A hero to highlight (e.g. the player's own, for a future endless mode). */
  myKey?: number | null;
};

/** Densest group of living heroes, for "focus on action". */
function actionFocus(s: OmenSnapshot): [number, number] {
  if (s.omen === "beast") return [0.5, 0.5];
  const alive = s.heroes.filter((h) => h.alive);
  let best = alive.slice(0, 1);
  for (const h of alive) {
    const g = alive.filter((o) => Math.hypot(o.pos[0] - h.pos[0], o.pos[1] - h.pos[1]) < 0.15);
    if (g.length > best.length) best = g;
  }
  if (!best.length) return [0.5, 0.5];
  return [best.reduce((a, h) => a + h.pos[0], 0) / best.length, best.reduce((a, h) => a + h.pos[1], 0) / best.length];
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** "team0_tier2_3" -> "a Walker". */
function objectiveName(key: string): string {
  const k = key.replace(/^team\d_/, "");
  if (k.startsWith("tier1")) return "a Guardian";
  if (k.startsWith("tier2")) return "a Walker";
  if (k === "titan") return "the Patron";
  return "the base";
}

export function OmenGame({ omen, initial, cat, map, saved, submit, onLocked, footer, myKey = null }: Props) {
  const { reducedMotion, toast, play } = useGame();
  const [view, setView] = useState<OmenView>(initial);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initial.snapshot));
  const [hovered, setHovered] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const restored = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const s = view.snapshot;
  const reveal = view.reveal;
  const W = s.window;

  // Restore a locked-in Omen: fetch the reveal and show the final state.
  useEffect(() => {
    if (!saved || restored.current || reveal) return;
    restored.current = true;
    submit(saved).then((v) => { setView(v); setTime(W); }).catch(() => toast("The omen won't show. Try again."));
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playback loop.
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      // rAF timestamps can precede the performance.now() we started from: never step backwards.
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      setTime((t) => {
        const n = Math.min(W, t + dt * speed);
        if (n >= W) setPlaying(false);
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, W]);

  const heroName = (key: number) => {
    const h = s.heroes[key];
    return `${cat.heroes[h.heroId]?.name ?? "Hero"} (${TEAM_LABEL[h.team]})`;
  };

  // ───────── current frame ─────────
  const frame = useMemo(() => {
    const events = reveal ? reveal.window.events.map((e) => ({ ...e, rel: e.t - s.t })) : [];
    const past = events.filter((e) => e.rel <= time);
    const heroes: MapHero[] = s.heroes.map((h) => {
      const base = { key: h.key, team: h.team, icon: cat.heroes[h.heroId]?.icon ?? null, label: reveal ? heroName(h.key) : `${TEAM_LABEL[h.team]} hero, level ${h.level}` };
      const tr = reveal?.window.tracks[h.key];
      if (!tr || (!reveal && time === 0)) return { ...base, pos: h.pos, trail: h.trail, hp: h.hp, maxHp: h.maxHp, alive: h.alive, respawnIn: h.respawnIn };
      const i = Math.max(0, Math.min(Math.floor(time), tr.pos.length - 1)), j = Math.min(i + 1, tr.pos.length - 1), f = Math.max(0, Math.min(1, time - i));
      const hp = tr.hp[i] <= 0 || tr.hp[j] <= 0 ? tr.hp[i] : lerp(tr.hp[i], tr.hp[j], f);
      const trail = Array.from({ length: 5 }, (_, k) => i - 5 + k).map((x) => (x >= 0 ? tr.pos[x] : h.trail[h.trail.length + x] ?? h.pos));
      const alive = hp > 0;
      return {
        ...base, alive, hp: Math.round(hp), maxHp: tr.maxHp[i],
        pos: [lerp(tr.pos[i][0], tr.pos[j][0], f), lerp(tr.pos[i][1], tr.pos[j][1], f)] as [number, number],
        trail, respawnIn: alive ? 0 : h.alive ? 0 : Math.max(0, Math.ceil(h.respawnIn - time)),
      };
    });
    const markers: MapMarker[] = [];
    for (const [n, e] of past.entries()) {
      const age = time - e.rel;
      if (e.type === "death") markers.push({ id: `d${n}`, kind: "death", pos: e.pos, age });
      if (e.type === "midboss" && age < 3) markers.push({ id: `m${n}`, kind: "flash", pos: [0.5, 0.5], team: e.claimedBy, age, label: e.killedBy === e.claimedBy ? `${TEAM_LABEL[e.killedBy]} kill` : `Stolen by ${TEAM_LABEL[e.claimedBy]}` });
      if (e.type === "rift-claim" && age < 3 && reveal?.window.riftPos) markers.push({ id: `r${n}`, kind: "flash", pos: reveal.window.riftPos, team: e.team, age, label: `${TEAM_LABEL[e.team]} claim` });
    }
    const destroyed = new Set(past.filter((e) => e.type === "objective").map((e) => (e as { key: string }).key));
    const midbossDead = past.some((e) => e.type === "midboss");
    const riftOpen = past.some((e) => e.type === "rift-open");
    return {
      heroes, markers,
      objectives: s.objectives.map((o) => ({ ...o, alive: o.alive && !destroyed.has(o.key) })),
      midboss: {
        alive: s.midboss.alive && !midbossDead,
        label: !s.midboss.alive && s.midboss.killedAt !== null ? `down since ${clock(s.midboss.killedAt)}` : s.midboss.spawnsIn !== null ? `spawns in ${s.midboss.spawnsIn}s` : undefined,
      },
      riftPos: riftOpen ? reveal?.window.riftPos ?? null : null,
    };
  }, [s, reveal, time, cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => new Set(reveal ? [] : draft.died), [draft.died, reveal]);
  const selectable = omen === "clash" && !reveal && draft.any !== false;
  const toggle = (key: number) => {
    if (!selectable) return;
    setDraft((d) => ({ ...d, any: d.any ?? true, died: d.died.includes(key) ? d.died.filter((k) => k !== key) : [...d.died, key] }));
  };

  const lockIn = async () => {
    const answers = draftAnswer(omen, draft, s);
    if (!answers) return;
    setConfirm(false);
    setBusy(true);
    try {
      const v = await submit(answers);
      setView(v);
      onLocked?.(v, answers);
      play("click");
      if (reducedMotion) setTime(W);
      else {
        setTime(0);
        setPlaying(true);
        // Watch it happen: bring the map into view; the results follow when the replay ends.
        requestAnimationFrame(() => stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch {
      toast("The omen won't show. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const eventText = (e: WindowEvent) => {
    switch (e.type) {
      case "death": return `${heroName(e.key)} died${e.killer !== null ? ` to ${heroName(e.killer)}` : ""}`;
      case "midboss": return e.killedBy === e.claimedBy ? `${TEAM_LABEL[e.killedBy]} killed the midboss and took the rejuv` : `${TEAM_LABEL[e.killedBy]} killed the midboss, ${TEAM_LABEL[e.claimedBy]} stole the rejuv`;
      case "objective": return `${TEAM_LABEL[e.team]} lost ${objectiveName(e.key)}`;
      case "rift-open": return "The rift opened";
      case "rift-claim": return `${TEAM_LABEL[e.team]} claimed the rift`;
      case "rift-expire": return "The rift expired unclaimed";
    }
  };

  const panelsProps = { snapshot: s, cat, showNames: !!reveal, hovered, onHover: setHovered, selected, onToggle: toggle, selectable };
  const [tab, setTab] = useState<Team>("amber");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="smallcaps text-xs text-ash">Game time</p>
          <p className="font-mono text-4xl leading-none text-paper md:text-5xl">{clock(s.t + (reveal ? time : 0))}</p>
        </div>
        {s.rift && !reveal && <p className="rounded-sm border border-ecto/40 bg-ecto/10 px-3 py-1.5 text-sm text-ecto">The Unstable Rift opens in {s.rift.opensIn}s</p>}
        {myKey !== null && <p className="rounded-sm border border-brass/40 px-3 py-1.5 text-sm text-brass">You: {TEAM_LABEL[s.heroes[myKey].team]}, level {s.heroes[myKey].level}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)]">
        <div className="hidden lg:block"><TeamPanel team="amber" {...panelsProps} /></div>
        <div ref={stageRef} className="scroll-mt-20">
        <DecoFrame className="clue-layer p-2 md:p-3">
          <OmenMap
            image={map.image}
            objectivePositions={map.objectives}
            objectives={frame.objectives}
            heroes={frame.heroes}
            midboss={frame.midboss}
            markers={frame.markers}
            riftPos={frame.riftPos}
            focus={actionFocus(s)}
            selected={selected}
            hovered={hovered ?? (myKey ?? null)}
            onHover={setHovered}
            onToggle={toggle}
            selectable={selectable}
          />
        </DecoFrame>
        </div>
        <div className="hidden lg:block"><TeamPanel team="sapphire" {...panelsProps} /></div>
        <div className="lg:hidden">
          <div role="tablist" className="mb-2 grid grid-cols-2 gap-1">
            {(["amber", "sapphire"] as Team[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={`min-h-11 rounded-[3px] border px-3 ${tab === t ? "border-brass bg-brass/15 text-paper" : "border-brass/25 text-ash"}`}>
                {TEAM_LABEL[t]}
              </button>
            ))}
          </div>
          <TeamPanel team={tab} {...panelsProps} />
        </div>
      </div>

      {reveal ? (
        <>
          <Playback
            W={W} time={time} setTime={(t) => { setPlaying(false); setTime(t); }} playing={playing}
            toggle={() => { if (time >= W) setTime(0); setPlaying((p) => !p); }}
            speed={speed} setSpeed={setSpeed} events={reveal.window.events} t0={s.t}
          />
          <ol className="space-y-1 text-sm" aria-label="What happened">
            {reveal.window.events.length === 0 && <li className="text-ash">Nothing happened in these {W} seconds.</li>}
            {reveal.window.events.map((e, i) => (
              <li key={i} className={`flex gap-3 ${e.t - s.t <= time ? "text-paper" : "text-ash/60"}`}>
                <span className="w-12 shrink-0 font-mono text-ash">{clock(e.t)}</span>{eventText(e)}
              </li>
            ))}
          </ol>
          {time >= W - 0.05 ? (
            <Results reveal={reveal} footer={footer} names={(text) => text.replace(/#(\d+)/g, (_, n) => heroName(Number(n) - 1))} />
          ) : (
            <button type="button" onClick={() => { setPlaying(false); setTime(W); }} className="min-h-11 text-sm text-ash underline-offset-4 hover:text-paper hover:underline">
              Skip to results
            </button>
          )}
        </>
      ) : (
        <DecoFrame className="p-4 md:p-6" corners={false}>
          <h2 className="smallcaps mb-4 text-sm text-brass">Your prediction</h2>
          <OmenQuestions
            omen={omen} snapshot={s} draft={draft} setDraft={setDraft}
            pickedNames={draft.died.map((k) => `${cat.heroes[s.heroes[k].heroId]?.name ?? "Hero"} (${TEAM_LABEL[s.heroes[k].team]})`)}
            onLockIn={() => setConfirm(true)} busy={busy}
          />
          <p className="mt-4 text-xs text-ash">Exact values from the match replay. Ultimates are shown; other ability cooldowns are not.</p>
        </DecoFrame>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Lock in?">
        <p className="text-paper/90">Your answers can&apos;t be changed after this.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>Keep thinking</Button>
          <Button onClick={lockIn} disabled={busy}>Lock in</Button>
        </div>
      </Modal>
    </div>
  );
}

function Playback({
  W, time, setTime, playing, toggle, speed, setSpeed, events, t0,
}: {
  W: number; time: number; setTime: (t: number) => void; playing: boolean; toggle: () => void;
  speed: number; setSpeed: (n: number) => void; events: WindowEvent[]; t0: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex h-11 w-11 items-center justify-center rounded-[3px] border border-brass/60 text-brass">
        {playing ? <span className="font-mono text-lg">❚❚</span> : <Icon name="arrow-right" />}
      </button>
      <div className="relative min-w-40 flex-1">
        <input type="range" min={0} max={W} step={0.1} value={time} onChange={(e) => setTime(Number(e.target.value))} aria-label="Timeline" className="w-full accent-[var(--brass)]" />
        {events.map((e, i) => (
          <span
            key={i}
            aria-hidden
            className={`pointer-events-none absolute -top-1 h-2 w-2 -translate-x-1/2 rounded-full ${e.type === "death" ? "bg-[#c0474f]" : "bg-cursed"}`}
            style={{ left: `${((e.t - t0) / W) * 100}%` }}
          />
        ))}
      </div>
      <div role="radiogroup" aria-label="Speed" className="flex overflow-hidden rounded-sm border border-brass/40 text-sm">
        {[1, 2, 4].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={speed === n} onClick={() => setSpeed(n)} className={`min-h-9 px-2.5 font-mono ${speed === n ? "bg-brass/25 text-paper" : "text-ash"}`}>{n}×</button>
        ))}
      </div>
    </div>
  );
}

function Results({ reveal, footer, names }: { reveal: OmenReveal; footer?: (r: OmenReveal) => React.ReactNode; names: (text: string) => string }) {
  const r = reveal.result;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <DecoFrame as="section" className="p-5 md:p-6" aria-live="polite">
        <p className="font-display text-2xl text-ecto">The omen is read.</p>
        <p className="mt-1 text-paper"><span className="font-mono text-3xl text-brass">{r.total}</span> souls</p>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ash"><th className="py-1 font-normal">Question</th><th className="font-normal">You</th><th className="font-normal">Actual</th><th className="text-right font-normal">Souls</th></tr>
          </thead>
          <tbody>
            {r.questions.map((q) => (
              <tr key={q.id} className="border-t border-brass/10 align-top">
                <td className="py-1.5 pr-2 text-paper/90">{q.label}</td>
                <td className="pr-2">{names(q.guess)}</td>
                <td className="pr-2">{names(q.actual)}</td>
                <td className={`text-right font-mono ${q.points === q.max ? "text-ecto" : q.points > 0 ? "text-brass" : "text-[#d08a8a]"}`}>{q.points}/{q.max}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {footer?.(reveal)}
          <a href={reveal.matchUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-3 text-brass underline-offset-4 hover:underline">
            View full match #{reveal.matchId}
          </a>
        </div>
      </DecoFrame>
    </motion.div>
  );
}
