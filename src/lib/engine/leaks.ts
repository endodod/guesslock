// Leak validation: the answer's name/aliases must never appear in anything shown before the win.
import { findLeaks } from "../text/redact";
import type { BasePayload } from "./mode";
import { MODES } from "./registry";

/** Every string the player can see before solving: clue at maximum reveal + all hint values. */
export function displayedStrings(payload: BasePayload): string[] {
  const impl = MODES[payload.mode];
  const out: string[] = [...impl.displayed(payload)];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (!v.startsWith("/media/") && !v.startsWith("http")) out.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(impl.clue(payload, 99, false));
  for (const h of Object.values(payload.hints)) if (h.value) out.push(h.value);
  return out;
}

export function checkLeaks(payload: BasePayload): { term: string; text: string }[] {
  const terms = payload.leakTerms.filter((t) => t.trim().length >= 3);
  const leaks: { term: string; text: string }[] = [];
  for (const text of displayedStrings(payload))
    for (const term of findLeaks(text, terms)) leaks.push({ term, text: text.slice(0, 160) });
  return leaks;
}
