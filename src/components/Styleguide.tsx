"use client";
// /styleguide: all components in all states, with sample data (no DB).
import { LOCK_BY_SLUG, LOCKS } from "@/locks.config";
import type { Clue, GuessRow, HintView, PlayView } from "@/lib/engine/types";
import type { LockRecord } from "@/lib/client/store";
import { CENSOR } from "@/lib/text/redact";
import { ClueStage } from "./ClueStage";
import { AttributeGrid, GuessList, HintShelf } from "./History";
import { GuessInput } from "./GuessInput";
import { VaultBox } from "./Vault";
import { Distribution, ShareButton, WinPanel } from "./WinPanel";
import { Button, Countdown, DecoFrame, Icon, KeyholeLoader, LockpickRow, Logo } from "./ui";
import { useGame } from "./GameProvider";
import { useState } from "react";

const IMG = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 380'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#7a4b2a'/><stop offset='1' stop-color='#1d2a38'/></linearGradient></defs><rect width='280' height='380' fill='url(#g)'/><circle cx='140' cy='130' r='60' fill='#e2c49a'/><rect x='70' y='200' width='140' height='180' rx='40' fill='#3e1a1d'/></svg>`,
);
const ICON = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M50 8 L62 40 L95 40 L68 60 L78 92 L50 72 L22 92 L32 60 L5 40 L38 40Z' fill='white'/></svg>`,
);

const rows: GuessRow[] = [
  { id: "1", name: "Infernus", icon: IMG, correct: false, tiles: [
    { key: "gender", display: "Male", result: "match" }, { key: "species", display: "Demon", result: "partial" },
    { key: "complexity", display: "★", result: "miss" }, { key: "weapon", display: "Rapid Fire", result: "miss" },
    { key: "health", display: "830", result: "miss", arrow: "down" }, { key: "dps", display: "52.4", result: "miss", arrow: "up" },
    { key: "release", display: "Aug 2024", result: "match" },
  ] },
  { id: "2", name: "Haze", icon: IMG, correct: true, tiles: [
    { key: "gender", display: "Female", result: "match" }, { key: "species", display: "Human", result: "match" },
    { key: "complexity", display: "★", result: "match" }, { key: "weapon", display: "Rapid Fire", result: "match" },
    { key: "health", display: "730", result: "match" }, { key: "dps", display: "50.1", result: "match" },
    { key: "release", display: "Aug 2024", result: "match" },
  ] },
];
const columns = [
  { key: "gender", label: "Gender", info: "The hero's gender." }, { key: "species", label: "Species", info: "What the hero is." },
  { key: "complexity", label: "Complexity", info: "1-4 stars." }, { key: "weapon", label: "Weapon", info: "Weapon type." },
  { key: "health", label: "Health", info: "Base health.", numeric: true }, { key: "dps", label: "Gun DPS", info: "Base DPS.", numeric: true },
  { key: "release", label: "Released", info: "Release date.", numeric: true },
];
const hints: HintView[] = [
  { id: "gender", label: "Gender", after: 4, unlocked: true, value: "Female" },
  { id: "archetype", label: "Archetype", after: 6, unlocked: false },
];

const clues: [string, Clue, GuessRow[]?][] = [
  ["The Visage (zoomed)", { kind: "splash", image: IMG, zoom: 3.4, originX: 50, originY: 35 }],
  ["The Sigil", { kind: "sigil", image: ICON, grid: 4, covered: [0, 1, 2, 5, 6, 9, 11, 12, 14, 15] }],
  ["The Testament", { kind: "text", sections: [{ text: `Before ${CENSOR} joined the OSIC, she was a nurse.` }, { text: "Then the dreams started." }], total: 5 }],
  ["The Ascension", { kind: "text", sections: [{ label: "Tier III", text: "-17s Cooldown\n-40% Move Speed" }, { label: "Tier II", text: "+1s Sleep Duration" }], total: 3, image: ICON }],
  ["The Belongings", { kind: "build", items: [{ name: "Headhunter", image: ICON, slot: "weapon" }, { name: "Extra Stamina", image: ICON, slot: "vitality" }, { name: "Rapid Recharge", image: ICON, slot: "spirit" }], total: 8 }],
  ["The Cipher", { kind: "emoji", slots: ["🎩", "🐦", null, null, null, null] }],
  ["The Echo", { kind: "echo", lines: [{ text: "You know it's bad when they send a Sandman." }, { text: `Sleep well, ${CENSOR}.` }], total: 5 }],
  // Placeholder id: the players render, playback fails gracefully (toast).
  ["The Resonance (1 of 2)", { kind: "sound", clips: [{ url: `/media/${"0".repeat(40)}`, gainDb: 0, label: "Sound 1", muffled: false }], total: 2, slot: 2 }],
  ["The Relic", { kind: "relic", image: ICON, blur: 7, rotation: 120 }],
  ["The Lineage", { kind: "lineage", direction: "into", shown: { name: "Extra Stamina", image: ICON, slot: "vitality", tier: 1 }, answerSlot: "vitality" }],
  ["The Measure", { kind: "measure", item: { name: "Kinetic Dash", image: ICON, slot: "weapon", tier: 2 }, stats: [{ label: "Stamina", display: "+1", postfix: "" }, { label: "Fire Rate", display: null, hidden: true, postfix: "%" }], hiddenLabel: "Fire Rate", postfix: "%" },
    [{ id: "10", name: "10", icon: null, correct: false, arrow: "up" }, { id: "40", name: "40", icon: null, correct: false, arrow: "down" }]],
];

const rec = (s: LockRecord["s"], n: number): LockRecord => ({ g: Array(n).fill("x"), s, w: n - 1, h: 0, souls: s === "won" ? 100 - 10 * (n - 1) : 0, answer: { name: "Haze", image: IMG } });

export function Styleguide() {
  const { toast } = useGame();
  const [demoTarget] = useState(() => Date.now() + 3723000);
  const winView: PlayView = {
    slug: "sigil", date: "2026-10-01", number: 1, status: "won", rows: rows.slice(0, 2), wrong: 1, hints, hintsUsed: 1,
    clue: null, answer: { id: "13", name: "Haze", image: IMG },
    bonus: { prompt: "Name the ability", options: [{ id: "a", name: "Sleep Dagger" }, { id: "b", name: "Smoke Bomb" }, { id: "c", name: "Fixation" }, { id: "d", name: "Bullet Dance" }] },
  };
  const lostView: PlayView = { ...winView, slug: "measure", status: "lost", bonus: undefined, answer: { id: "1", name: "Kinetic Dash", image: ICON, extra: { exactValue: "+20% Fire Rate" } } };

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-8">
      <h1 className="font-display text-3xl text-brass">Styleguide</h1>

      <Section title="Brand & tokens">
        <div className="flex flex-wrap items-center gap-6"><Logo size="lg" /><Logo /><Logo size="sm" /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["ink", "iron", "velvet", "brass", "paper", "ash", "ecto", "cursed"].map((c) => (
            <div key={c} className="w-20 text-center text-xs"><div className="h-12 rounded border border-brass/30" style={{ background: `var(--${c})` }} />{c}</div>
          ))}
        </div>
        <p className="mt-4 font-display text-2xl">Limelight display</p>
        <p>Spectral body text, 17px on mobile.</p>
        <p className="font-mono">IBM Plex Mono 0123456789</p>
      </Section>

      <Section title="Buttons, icons, loader, countdown, toast">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Brass</Button><Button variant="ghost">Ghost</Button><Button variant="cursed">Cursed</Button>
          <Button onClick={() => toast("New locks are in the vault.")}>Show toast</Button>
          <ShareButton text="GUESSLOCK #1 — The Visage\n🔓 4 picks · 70 souls" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-brass">
          {(["ledger", "archive", "settings", "back", "info", "question", "flame", "speaker", "lock", "unlock", "check", "approx", "cross", "up", "down", "share", "seal"] as const).map((n) => <Icon key={n} name={n} />)}
        </div>
        <div className="mt-4 flex items-center gap-8"><KeyholeLoader /><Countdown target={demoTarget} className="text-2xl" /></div>
      </Section>

      <Section title="DecoFrame">
        <DecoFrame className="p-6">Brass double rule with stepped corners.</DecoFrame>
      </Section>

      <Section title="VaultBox — all states">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <li><VaultBox lock={LOCKS[0]} state="locked" href="#" /></li>
          <li><VaultBox lock={LOCKS[1]} state="progress" rec={rec("playing", 3)} href="#" /></li>
          <li><VaultBox lock={LOCKS[2]} state="opened" rec={rec("won", 2)} href="#" /></li>
          <li><VaultBox lock={LOCK_BY_SLUG.measure} state="jammed" rec={rec("lost", 5)} href="#" /></li>
          <li><VaultBox lock={LOCK_BY_SLUG.belongings} state="sealed" href={null} /></li>
        </ul>
      </Section>

      <Section title="LockpickRow">
        <div className="space-y-3">
          <LockpickRow total={6} broken={0} hintAt={[4, 6]} />
          <LockpickRow total={6} broken={4} hintAt={[4, 6]} />
          <LockpickRow total={5} broken={2} triesLeft={3} />
          <LockpickRow total={6} broken={2} glowing />
        </div>
      </Section>

      <Section title="GuessInput">
        <GuessInput
          entries={[{ id: "1", name: "Infernus", icon: IMG }, { id: "2", name: "Haze", icon: IMG }, { id: "3", name: "Mo & Krill", icon: IMG }, { id: "4", name: "Lady Geist", icon: IMG }]}
          guessed={new Set(["1"])}
          placeholder="Name the hero…"
          onGuess={(id) => toast(`Guessed ${id}`)}
        />
      </Section>

      <Section title="Attribute grid + legend">
        <ClueStage clue={{ kind: "grid", columns }} rows={rows} />
        <div className="mt-4"><AttributeGrid columns={columns} rows={rows} /></div>
      </Section>

      {clues.map(([title, clue, r]) => (
        <Section key={title} title={`Clue stage — ${title}`}>
          <ClueStage clue={clue} rows={r ?? []} />
        </Section>
      ))}

      <Section title="Guess list + hint shelf">
        <GuessList rows={[{ id: "1", name: "Infernus", icon: IMG, correct: false }, { id: "2", name: "Haze", icon: IMG, correct: true }]} />
        <div className="mt-4"><HintShelf hints={hints} /></div>
      </Section>

      <Section title="Win panel (with bonus round)">
        <WinPanel lock={LOCK_BY_SLUG.sigil} view={winView} souls={75} shareText="…" dist={{ "1": 2, "2": 5, "3": 1 }} nextHref="#" onBonus={() => {}} />
      </Section>

      <Section title="Jammed (The Measure lost)">
        <WinPanel lock={LOCK_BY_SLUG.measure} view={lostView} souls={0} shareText="…" dist={{ "2": 1, X: 1 }} nextHref="#" onBonus={() => {}} />
      </Section>

      <Section title="Distribution">
        <Distribution dist={{ "1": 1, "2": 4, "3": 7, "4": 2, X: 1 }} highlight="3" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="smallcaps mb-3 border-b border-brass/20 pb-1 text-brass">{title}</h2>
      {children}
    </section>
  );
}
