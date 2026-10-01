// Omen scoring (pure; unit-tested). Every Omen is worth at most 100 souls.
import type { BeastAnswer, ClashAnswer, OmenAnswer, OmenKind, OmenResult, QuestionResult, RiftAnswer, Team } from "./types";

const teamName = (t: Team | null | "none") => (t === "amber" ? "Amber" : t === "sapphire" ? "Sapphire" : "Nobody");
const yesNo = (b: boolean) => (b ? "Yes" : "No");

/** Stepper points: exact = max, off by one = about half, else 0. */
export function stepperPoints(guess: number, actual: number, max: number): number {
  const d = Math.abs(guess - actual);
  return d === 0 ? max : d === 1 ? Math.floor(max / 2) : 0;
}

/** Who dies: +50/n per correct pick, -50/n per wrong pick (n = actual deaths, min 1), floor 0. */
export function pickPoints(picked: number[], actual: number[], max = 50): number {
  const n = Math.max(1, actual.length);
  const set = new Set(actual);
  const unique = [...new Set(picked)];
  const right = unique.filter((k) => set.has(k)).length;
  const wrong = unique.length - right;
  if (actual.length === 0 && unique.length === 0) return max;
  return Math.max(0, Math.min(max, Math.round((max / n) * right - (max / n) * wrong)));
}

const q = (id: string, label: string, guess: string, actual: string, points: number, max: number): QuestionResult => ({ id, label, guess, actual, points, max });

export function scoreClash(g: ClashAnswer, a: ClashAnswer, names: (key: number) => string = (k) => `#${k + 1}`, window = 20): OmenResult {
  const list = (ks: number[]) => (ks.length ? ks.map(names).join(", ") : "Nobody");
  const questions = [
    q("any", `Does anyone die in the next ${window} s?`, yesNo(g.anyDeath), yesNo(a.anyDeath), g.anyDeath === a.anyDeath ? 20 : 0, 20),
    q("amber", "Amber deaths", String(g.deaths.amber), String(a.deaths.amber), stepperPoints(g.deaths.amber, a.deaths.amber, 15), 15),
    q("sapphire", "Sapphire deaths", String(g.deaths.sapphire), String(a.deaths.sapphire), stepperPoints(g.deaths.sapphire, a.deaths.sapphire, 15), 15),
    q("who", "Who dies?", list(g.anyDeath ? g.died : []), list(a.died), pickPoints(g.anyDeath ? g.died : [], a.died), 50),
  ];
  return { total: questions.reduce((s, x) => s + x.points, 0), questions };
}

/** The midboss always falls in the window: who kills it, and how many rejuvs each team has afterwards. */
export function scoreBeast(g: BeastAnswer, a: BeastAnswer): OmenResult {
  const questions = [
    q("killer", "Which team kills the midboss?", teamName(g.killer), teamName(a.killer), g.killer === a.killer ? 40 : 0, 40),
    q("amber", "Amber rejuvs afterwards", String(g.rejuvs.amber), String(a.rejuvs.amber), stepperPoints(g.rejuvs.amber, a.rejuvs.amber, 30), 30),
    q("sapphire", "Sapphire rejuvs afterwards", String(g.rejuvs.sapphire), String(a.rejuvs.sapphire), stepperPoints(g.rejuvs.sapphire, a.rejuvs.sapphire, 30), 30),
  ];
  return { total: questions.reduce((s, x) => s + x.points, 0), questions };
}

export function scoreRift(g: RiftAnswer, a: RiftAnswer): OmenResult {
  const questions = [
    q("claimer", "Which team claims the rift?", teamName(g.claimer), teamName(a.claimer), g.claimer === a.claimer ? 50 : 0, 50),
    q("amber", "Amber deaths at the rift", String(g.deaths.amber), String(a.deaths.amber), stepperPoints(g.deaths.amber, a.deaths.amber, 25), 25),
    q("sapphire", "Sapphire deaths at the rift", String(g.deaths.sapphire), String(a.deaths.sapphire), stepperPoints(g.deaths.sapphire, a.deaths.sapphire, 25), 25),
  ];
  return { total: questions.reduce((s, x) => s + x.points, 0), questions };
}

export function scoreOmen(omen: OmenKind, guess: OmenAnswer, actual: OmenAnswer, names?: (key: number) => string, window?: number): OmenResult {
  if (omen === "clash") return scoreClash(guess as ClashAnswer, actual as ClashAnswer, names, window);
  if (omen === "beast") return scoreBeast(guess as BeastAnswer, actual as BeastAnswer);
  return scoreRift(guess as RiftAnswer, actual as RiftAnswer);
}

/** Share symbol per the prompt: ✨ ≥ 80 · 🔓 ≥ 40 · 🔒 < 40. */
export function omenSymbol(souls: number): string {
  return souls >= 80 ? "✨" : souls >= 40 ? "🔓" : "🔒";
}

/** One ✓/✗ per question (✓ = full points). */
export function omenTicks(r: OmenResult): string {
  return r.questions.map((x) => (x.points === x.max ? "✓" : "✗")).join("");
}
