// Server-side Omen play: the snapshot before lock-in, the reveal (window, answer, score) after.
// The window and answer never leave the server until the player's answers are submitted.
import { z } from "zod";
import { config } from "../config";
import { scoreOmen } from "./scoring";
import { PREVIEW_SECONDS, type OmenAnswer, type OmenKind, type OmenPayload, type OmenResult, type OmenSnapshot, type OmenWindow } from "./types";

const team = z.enum(["amber", "sapphire"]);
const counts = z.object({ amber: z.number().int().min(0).max(12), sapphire: z.number().int().min(0).max(12) });

export const AnswerSchemas: Record<OmenKind, z.ZodType<OmenAnswer>> = {
  clash: z.object({ anyDeath: z.boolean(), deaths: counts, died: z.array(z.number().int().min(0).max(11)).max(12).optional() }),
  beast: z.object({ killed: z.boolean(), killer: team.nullable(), claimer: team.nullable(), rejuvs: counts }),
  rift: z.object({ claimer: z.enum(["amber", "sapphire", "none"]), deaths: counts }),
};

export type OmenReveal = {
  window: OmenWindow;
  answer: OmenAnswer;
  result: OmenResult;
  matchId: number;
  matchUrl: string;
};

export type OmenView = {
  snapshot: OmenSnapshot;
  /** The first PREVIEW_SECONDS of the window, watchable before locking in. */
  preview?: OmenWindow;
  reveal?: OmenReveal;
};

/** First seconds of the window: positions and events that already happened, never the rest. */
export function previewOf(w: OmenWindow, t0: number, seconds = PREVIEW_SECONDS): OmenWindow {
  return {
    tracks: w.tracks.map((tr) => ({ key: tr.key, pos: tr.pos.slice(0, seconds + 1), hp: tr.hp.slice(0, seconds + 1), maxHp: tr.maxHp.slice(0, seconds + 1) })),
    events: w.events.filter((e) => e.t - t0 <= seconds),
    riftPos: null,
  };
}

/** Scenarios stored before the snapshot carried the rift position get it from the window. */
function withRiftPos(payload: OmenPayload): OmenSnapshot {
  const s = payload.snapshot;
  return s.rift && !s.rift.pos && payload.window.riftPos ? { ...s, rift: { ...s.rift, pos: payload.window.riftPos } } : s;
}

/** Parse answers for an Omen; null when they don't fit the schema. */
export function parseAnswer(omen: OmenKind, input: unknown): OmenAnswer | null {
  const r = AnswerSchemas[omen].safeParse(input);
  return r.success ? r.data : null;
}

export function omenView(payload: OmenPayload, guess?: OmenAnswer | null): OmenView {
  const snapshot = withRiftPos(payload);
  if (!guess) return { snapshot, preview: previewOf(payload.window, payload.snapshot.t) };
  return {
    snapshot,
    reveal: {
      window: payload.window,
      answer: payload.answer,
      result: scoreOmen(payload.omen, guess, payload.answer, undefined, payload.snapshot.window),
      matchId: payload.matchId,
      matchUrl: config.omenMatchUrl.replace("{id}", String(payload.matchId)),
    },
  };
}
