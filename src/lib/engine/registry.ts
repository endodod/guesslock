import type { ModeImpl } from "./mode";
import { ascension, belongings, cipher, echo, incantation, reckoning, sigil, testament, visage } from "./modes/hero";
import { appraisal, lineage, measure, relic } from "./modes/item";

export const MODES: Record<string, ModeImpl<any>> = Object.fromEntries( // eslint-disable-line @typescript-eslint/no-explicit-any
  [reckoning, visage, sigil, testament, incantation, belongings, ascension, cipher, echo, relic, appraisal, lineage, measure].map((m) => [m.mode, m]),
);
