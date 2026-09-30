// Item modes: Relic, Appraisal, Lineage, Measure.
import { ITEM_COLUMNS, formatCell, type CellValue } from "../columns";
import { compareCell } from "../compare";
import type { GameData, ItemData } from "../context";
import { cap, type BasePayload, type Candidate, type ModeImpl } from "../mode";
import type { ColumnMeta, Tile } from "../types";
import type { StatBonus } from "../../deadlock/types";

const itemAnswer = (i: ItemData) => ({ id: String(i.id), name: i.name, image: i.image, sub: `${cap(i.src.slot)} · Tier ${i.src.tier}` });
const itemLeak = (i: ItemData) => [i.name, ...i.aliases];

function itemPool(data: GameData, mode: string, extra: (i: ItemData) => boolean = () => true): Candidate[] {
  return data.items.filter((i) => !i.exclude.includes(mode) && extra(i)).map((i) => ({ answerId: String(i.id), ref: i.id }));
}

// ---------- X. The Relic (item picture) ----------

const BLUR_STEPS = [20, 14, 10, 7, 4.5, 2.5, 1.2, 0];

export const relic: ModeImpl<{ image: string; rotation: number }> = {
  mode: "item-picture",
  candidates: (data) => itemPool(data, "item-picture", (i) => !!i.image),
  build(c, { data, rng }) {
    const i = data.item(c.ref as number)!;
    return {
      v: 1, mode: "item-picture", answer: itemAnswer(i), correctIds: [String(i.id)], leakTerms: itemLeak(i),
      hints: { slot: { value: cap(i.src.slot) }, tier: { value: `Tier ${i.src.tier}` } },
      // Rotation is only applied in hard mode; keep it well away from upright.
      clue: { image: i.image!, rotation: Math.round(40 + rng.next() * 280) },
    };
  },
  clue: (p, wrong, done) => ({
    kind: "relic", image: p.clue.image, rotation: p.clue.rotation,
    blur: done ? 0 : BLUR_STEPS[Math.min(wrong, BLUR_STEPS.length - 1)],
  }),
  displayed: () => [],
};

// ---------- XI. The Appraisal (item classic) ----------

type GridClue = {
  columns: (ColumnMeta & { type: string })[];
  table: Record<string, { v: CellValue; d: string }[]>;
};

export const appraisal: ModeImpl<GridClue> = {
  mode: "item-classic",
  candidates: (data) => itemPool(data, "item-classic"),
  build(c, { data }) {
    const i = data.item(c.ref as number)!;
    const table: GridClue["table"] = {};
    for (const x of data.items)
      table[String(x.id)] = ITEM_COLUMNS.map((col) => {
        const v = col.get(x, data);
        return { v, d: formatCell(col, v) };
      });
    return {
      v: 1, mode: "item-classic", answer: itemAnswer(i), correctIds: [String(i.id)], leakTerms: itemLeak(i),
      hints: { initial: { value: i.name[0].toUpperCase() } },
      clue: {
        columns: ITEM_COLUMNS.map((col) => ({ key: col.key, label: col.label, info: col.info, type: col.type, numeric: col.type === "numeric" })),
        table,
      },
    };
  },
  clue: (p) => ({ kind: "grid", columns: p.clue.columns.map(({ key, label, info, numeric }) => ({ key, label, info, numeric })) }),
  tiles(p, guessId): Tile[] | null {
    const row = p.clue.table[guessId];
    const answer = p.clue.table[p.correctIds[0]];
    if (!answer) return null;
    return p.clue.columns.map((c, idx) => {
      const g = row?.[idx];
      if (!g) return { key: c.key, display: "?", result: "miss" as const };
      const r = compareCell(c.type as never, g.v, answer[idx].v);
      return { key: c.key, display: g.d, result: r.result, arrow: r.arrow };
    });
  },
  displayed: () => [],
};

// ---------- XII. The Lineage (build path) ----------

type ItemCard = { name: string; image: string | null; slot: string; tier: number };
type LineageClue = { direction: "into" | "from"; shown: ItemCard; answerSlot: string };

const card = (i: ItemData): ItemCard => ({ name: i.name, image: i.image, slot: i.src.slot, tier: i.src.tier });

/** Directions alternate daily: even days "what does this build into?", odd days "what's the component?". */
export function lineageDirection(dayIndex: number): "into" | "from" {
  return dayIndex % 2 === 0 ? "into" : "from";
}

function lineageAnswers(data: GameData, shown: ItemData, direction: "into" | "from"): ItemData[] {
  const list =
    direction === "into"
      ? data.buildsInto(shown.src.className).map((n) => data.item(n.id))
      : shown.src.componentClassNames.map((cls) => data.itemByClass(cls));
  return list.filter((x): x is ItemData => !!x && !x.exclude.includes("build-path")).sort((a, b) => a.name.localeCompare(b.name));
}

export const lineage: ModeImpl<LineageClue> = {
  mode: "build-path",
  candidates: (data, { dayIndex }) => {
    const dir = lineageDirection(dayIndex);
    return data.items
      .filter((i) => !i.exclude.includes("build-path") && lineageAnswers(data, i, dir).length > 0)
      .map((i) => ({ answerId: `${dir}:${i.id}`, ref: i.id }));
  },
  build(c, { data, dayIndex }) {
    const dir = lineageDirection(dayIndex);
    const shown = data.item(c.ref as number)!;
    const answers = lineageAnswers(data, shown, dir);
    const [first, ...rest] = answers;
    const tiers = [...new Set(answers.map((a) => a.src.tier))].sort();
    return {
      v: 1, mode: "build-path",
      answer: { ...itemAnswer(first), extra: rest.length ? { alsoValid: rest.map((r) => ({ name: r.name, image: r.image })) } : undefined },
      correctIds: answers.map((a) => String(a.id)),
      leakTerms: answers.flatMap(itemLeak),
      hints: { tier: { value: tiers.map((t) => `Tier ${t}`).join(" or ") } },
      clue: { direction: dir, shown: card(shown), answerSlot: first.src.slot },
    };
  },
  clue: (p) => ({ kind: "lineage", ...p.clue }),
  displayed: (p) => [p.clue.shown.name],
};

// ---------- XIII. The Measure (stat bonus) ----------

type MeasureClue = {
  item: ItemCard;
  stats: { label: string; display: string; postfix: string }[];
  hiddenIndex: number;
  value: number;
};

/** A stat is "clean" if it's unconditional, doesn't scale, and has a simple numeric value. */
export function isCleanStat(s: StatBonus): boolean {
  if (s.conditional || s.scales || !Number.isFinite(s.value) || s.value === 0) return false;
  return Math.abs(s.value * 10 - Math.round(s.value * 10)) < 1e-9; // at most one decimal
}

export const measure: ModeImpl<MeasureClue> = {
  mode: "stat-bonus",
  // At least two stats, so the item card gives context beyond the hidden value.
  candidates: (data) => itemPool(data, "stat-bonus", (i) => i.src.statBonuses.length >= 2 && i.src.statBonuses.some(isCleanStat)),
  build(c, { data, rng }) {
    const i = data.item(c.ref as number)!;
    const clean = i.src.statBonuses.map((s, idx) => ({ s, idx })).filter(({ s }) => isCleanStat(s));
    const hidden = rng.pick(clean);
    return {
      v: 1, mode: "stat-bonus",
      answer: { ...itemAnswer(i), extra: { exactValue: hidden.s.display + " " + hidden.s.label } },
      correctIds: [],
      leakTerms: [],
      hints: {},
      clue: {
        item: card(i),
        stats: i.src.statBonuses.map((s) => ({ label: s.label, display: s.display, postfix: s.postfix })),
        hiddenIndex: hidden.idx,
        value: hidden.s.value,
      },
    };
  },
  clue: (p, _wrong, done) => ({
    kind: "measure",
    item: p.clue.item,
    stats: p.clue.stats.map((s, idx) =>
      idx === p.clue.hiddenIndex ? { label: s.label, display: done ? s.display : null, hidden: true, postfix: s.postfix } : s,
    ),
    hiddenLabel: p.clue.stats[p.clue.hiddenIndex].label,
    postfix: p.clue.stats[p.clue.hiddenIndex].postfix,
  }),
  displayed: () => [],
};

export type { BasePayload };
