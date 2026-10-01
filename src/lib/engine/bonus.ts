// Bonus questions (+25 souls after a win) for the locks that don't have a "name the ability" round of their own.
// The question is frozen into the payload at build time and only sent once the lock is won (see play.ts).
//   hero locks      -> "Which of these is <hero>'s ultimate?"
//   The Ascension   -> "Which slot is <ability>?"
//   item locks      -> "How much does <item> cost?"
// Locks whose answer is a number (The Measure), the Omens and The Séance have none.
import type { GameData } from "./context";
import { makeRng, type Rng } from "../rng";
import type { BasePayload, ModeImpl } from "./mode";

type Bonus = NonNullable<BasePayload["bonus"]>;

const HERO_MODES = new Set(["classic", "splash", "lore", "whose-build", "emoji", "quote", "quote-convo"]);
const ITEM_MODES = new Set(["item-picture", "item-classic", "build-path"]);

export function ultimateBonus(data: GameData, heroId: number, rng: Rng): Bonus | undefined {
  const h = data.hero(heroId);
  const abilities = data.abilitiesOf(heroId);
  const ult = abilities.find((a) => a.slot === 4);
  if (!h || !ult || abilities.length < 3) return undefined;
  return {
    prompt: `Which of these is ${h.name}'s ultimate?`,
    options: rng.shuffle(abilities).map((a) => ({ id: String(a.id), name: a.name })),
    answerId: String(ult.id),
  };
}

const SLOT_NAMES = ["Ability 1", "Ability 2", "Ability 3", "Ultimate"];

export function slotBonus(data: GameData, abilityId: number): Bonus | undefined {
  const a = data.ability(abilityId);
  if (!a || a.slot < 1 || a.slot > 4) return undefined;
  return { prompt: `Which slot is ${a.name}?`, options: SLOT_NAMES.map((name, i) => ({ id: String(i + 1), name })), answerId: String(a.slot) };
}

export function costBonus(data: GameData, itemId: number, rng: Rng): Bonus | undefined {
  const item = data.item(itemId);
  const cost = item?.src.cost;
  if (!item || !cost) return undefined;
  const others = [...new Set(data.items.map((i) => i.src.cost).filter((c): c is number => !!c && c !== cost))];
  if (others.length < 3) return undefined;
  const costs = [cost, ...rng.shuffle(others).slice(0, 3)].sort((a, b) => a - b);
  return {
    prompt: `How much does ${item.name} cost?`,
    options: costs.map((c) => ({ id: String(c), name: `${c.toLocaleString("en-US")} souls` })),
    answerId: String(cost),
  };
}

/** The mode with a bonus question added to every puzzle it builds, unless it already has one. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withBonus(mode: ModeImpl<any>): ModeImpl<any> {
  const kind = HERO_MODES.has(mode.mode) ? "hero" : mode.mode === "upgrades" ? "ability" : ITEM_MODES.has(mode.mode) ? "item" : null;
  if (!kind) return mode;
  return {
    ...mode,
    async build(c, ctx) {
      const p = await mode.build(c, ctx);
      if (p.bonus) return p;
      // Its own stream: adding a bonus never changes what the mode itself picked.
      const rng = makeRng(`bonus|${ctx.date}|${mode.mode}|${p.answer.id}`);
      const id = Number(p.answer.id);
      const bonus = kind === "hero" ? ultimateBonus(ctx.data, id, rng) : kind === "ability" ? slotBonus(ctx.data, id) : costBonus(ctx.data, id, rng);
      return bonus ? { ...p, bonus } : p;
    },
  };
}
