import type { ModeImpl } from "./mode";
import { withBonus } from "./bonus";
import { ascension, belongings, cipher, colloquy, echo, incantation, reckoning, resonance, sigil, testament, utterance, visage } from "./modes/hero";
import { appraisal, lineage, measure, relic } from "./modes/item";
import { arsenal, shadow } from "./modes/sight";
import { calculus } from "./modes/calculus";
import { decoy } from "./modes/decoy";
import { cache } from "./modes/cache";
import { constellation } from "./modes/constellation";
import { wayfinder } from "./modes/wayfinder";

export const MODES: Record<string, ModeImpl<any>> = Object.fromEntries( // eslint-disable-line @typescript-eslint/no-explicit-any
  [
    reckoning, visage, sigil, testament, incantation, belongings, ascension, cipher, echo, utterance, colloquy, resonance,
    shadow, arsenal, calculus, relic, appraisal, lineage, measure, decoy, cache, constellation, wayfinder,
  ].map((m) => [m.mode, withBonus(m)]),
);
