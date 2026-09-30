// Leak validation: the answer's name/aliases must never appear in anything shown before the win.
import { findLeaks } from "../text/redact";
import type { BasePayload } from "./mode";
import { MODES } from "./registry";

/** The only audio URL shape a player may receive: opaque, content-addressed mirrors. */
export const MEDIA_URL = /^\/media\/[a-f0-9]{40}$/;

/** Every string the player can see before solving: clue at maximum reveal + all hint labels and values. */
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
  for (const h of Object.values(payload.hints)) {
    if (h.value) out.push(h.value);
    if (h.label) out.push(h.label);
  }
  return out;
}

/**
 * Audio modes (The Resonance): every served string — the serialized clue at each step before the win,
 * plus hints — must not contain a leak term (codenames included), and every audio URL must be opaque.
 */
function audioLeaks(payload: BasePayload, terms: string[]): { term: string; text: string }[] {
  const impl = MODES[payload.mode];
  if (!impl.audio) return [];
  const leaks: { term: string; text: string }[] = [];
  for (const url of impl.audio(payload)) if (!MEDIA_URL.test(url)) leaks.push({ term: "non-opaque audio URL", text: url });
  const served = [0, 1, 2, 3, 4, 5, 6, 99].map((w) => JSON.stringify(impl.clue(payload, w, false))).join(" ") + JSON.stringify(payload.hints);
  // Terms are matched inside URLs and keys too, so the check is a plain case-insensitive substring search.
  const lower = served.replace(/\/media\/[a-f0-9]{40}/g, "/media/#").toLowerCase();
  for (const term of terms) if (lower.includes(term.toLowerCase())) leaks.push({ term, text: "served clue/hints JSON" });
  return leaks;
}

export function checkLeaks(payload: BasePayload): { term: string; text: string }[] {
  const terms = payload.leakTerms.filter((t) => t.trim().length >= 3);
  const leaks: { term: string; text: string }[] = [];
  for (const text of displayedStrings(payload))
    for (const term of findLeaks(text, terms)) leaks.push({ term, text: text.slice(0, 160) });
  leaks.push(...audioLeaks(payload, terms));
  return leaks;
}
