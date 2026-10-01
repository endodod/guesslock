// Whether each hero is in each hero mode's answer pool, and why not.
import type { GameData, HeroData } from "@/lib/engine/context";
import { MODES } from "@/lib/engine/registry";
import { activeColumns } from "@/lib/engine/columns";
import { ECHO_MIN_LINES, EMOJI_SET_SIZE } from "@/lib/engine/modes/hero";
import { MODE_OPTIONS } from "../shared";

export const HERO_MODES = MODE_OPTIONS.slice(0, 10);

export type ModeStatus = { on: boolean; inPool: boolean; note: string };

function reason(data: GameData, h: HeroData, mode: string): string {
  const abilities = data.abilitiesOf(h.id).filter((a) => !a.exclude.includes(mode));
  switch (mode) {
    case "classic": {
      const pool = data.heroes.filter((x) => x.eligible && !x.exclude.includes("classic"));
      const missing = activeColumns(data.heroColumns, pool, data).filter((c) => c.get(h, data) === null).map((c) => c.label);
      return missing.length ? `Missing: ${missing.join(", ")}` : "Not eligible";
    }
    case "splash": return "No portrait";
    case "ability-icon": return abilities.length ? "No ability icon" : "All abilities turned off";
    case "lore": return "No lore text";
    case "ability-desc": return abilities.length ? "No ability description" : "All abilities turned off";
    case "upgrades": return abilities.length ? "No ability with all 3 upgrade texts" : "All abilities turned off";
    case "emoji": return `${h.emojis.length}/${EMOJI_SET_SIZE} emojis`;
    case "quote": return h.genericVoice ? "Generic voice" : `${data.voiceLines(h.id).length}/${ECHO_MIN_LINES} voice lines`;
    case "hero-sound": return "Needs 1 cast + 2 approved clips";
    default: return "Not eligible";
  }
}

export function heroStatuses(data: GameData): Map<number, Record<string, ModeStatus>> {
  const pools = Object.fromEntries(
    HERO_MODES.map(([mode]) => {
      const ids = MODES[mode].candidates(data, { dayIndex: 0 }).map((c) => Number(c.answerId));
      // The Ascension's answers are abilities: count them per hero.
      const heroIds = mode === "upgrades" ? ids.map((id) => data.ability(id)?.heroId ?? -1) : ids;
      const count = new Map<number, number>();
      for (const id of heroIds) count.set(id, (count.get(id) ?? 0) + 1);
      return [mode, count];
    }),
  );
  const out = new Map<number, Record<string, ModeStatus>>();
  for (const h of data.heroes) {
    const row: Record<string, ModeStatus> = {};
    for (const [mode] of HERO_MODES) {
      const on = !h.exclude.includes(mode);
      const n = pools[mode].get(h.id) ?? 0;
      row[mode] = {
        on, inPool: n > 0,
        note: !on ? "Turned off" : n === 0 ? reason(data, h, mode)
          : mode === "upgrades" ? `${n} ${n === 1 ? "ability" : "abilities"}`
          : mode === "whose-build" ? "Needs match data at generation" : "In pool",
      };
    }
    out.set(h.id, row);
  }
  return out;
}
