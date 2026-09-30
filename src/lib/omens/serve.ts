// Server-side Omen play: the snapshot before lock-in, the reveal (window, answer, score) after.
// The window and answer never leave the server until the player's answers are submitted.
import { z } from "zod";
import { config } from "../config";
import { scoreOmen } from "./scoring";
import type { OmenAnswer, OmenKind, OmenPayload, OmenResult, OmenSnapshot, OmenWindow } from "./types";

const team = z.enum(["amber", "sapphire"]);
const counts = z.object({ amber: z.number().int().min(0).max(12), sapphire: z.number().int().min(0).max(12) });

export const AnswerSchemas: Record<OmenKind, z.ZodType<OmenAnswer>> = {
  clash: z.object({ anyDeath: z.boolean(), deaths: counts, died: z.array(z.number().int().min(0).max(11)).max(12) }),
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

export type OmenView = { snapshot: OmenSnapshot; reveal?: OmenReveal };

/** Parse answers for an Omen; null when they don't fit the schema. */
export function parseAnswer(omen: OmenKind, input: unknown): OmenAnswer | null {
  const r = AnswerSchemas[omen].safeParse(input);
  return r.success ? r.data : null;
}

export function omenView(payload: OmenPayload, guess?: OmenAnswer | null): OmenView {
  if (!guess) return { snapshot: payload.snapshot };
  return {
    snapshot: payload.snapshot,
    reveal: {
      window: payload.window,
      answer: payload.answer,
      result: scoreOmen(payload.omen, guess, payload.answer),
      matchId: payload.matchId,
      matchUrl: config.omenMatchUrl.replace("{id}", String(payload.matchId)),
    },
  };
}
