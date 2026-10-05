// Community puzzles: limits and text checks shared by the editor (client) and the server. Pure.
import { z } from "zod";

export const COMMUNITY_KINDS = ["seance", "constellation"] as const;
export type CommunityKind = (typeof COMMUNITY_KINDS)[number];

/** Puzzles a player may publish per day. */
export const DAILY_CREATE_LIMIT = 5;
/** Reports that hide a puzzle until the admin looks at it. */
export const REPORTS_TO_HIDE = 3;

export const TITLE_MAX = 60;
export const LABEL_MAX = 40;
export const EXPLANATION_MAX = 140;

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|gg|io|ru|xyz|ch|de)\b)/i;
// A short list: the obvious slurs and insults. Anything else is for the report button.
const BLOCKED = ["nigg", "fag", "retard", "tranny", "kike", "spic", "chink", "cunt", "whore", "nazi", "hitler", "rape"];

/** Why a player-written text can't be published, or null. */
export function textProblem(text: string, what: string, max: number, required = true): string | null {
  const s = text.trim();
  if (!s) return required ? `${what} is missing.` : null;
  if (s.length > max) return `${what} is too long (at most ${max} characters).`;
  if (LINK.test(s)) return `${what} can't contain links.`;
  const flat = s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
  if (BLOCKED.some((w) => flat.includes(w))) return `${what} contains a word we don't allow.`;
  return null;
}

const text = (max: number) => z.string().trim().max(max * 2);

export const SeanceInput = z.object({
  kind: z.literal("seance"),
  entity: z.enum(["hero", "item", "ability"]),
  title: text(TITLE_MAX),
  /** Easiest first. */
  groups: z.array(z.object({
    label: text(LABEL_MAX),
    explanation: text(EXPLANATION_MAX).optional(),
    members: z.array(z.number().int().positive()).length(4),
  })).length(4),
});

export const ConstellationInput = z.object({
  kind: z.literal("constellation"),
  title: text(TITLE_MAX),
  /** Facet ids (see facetId). */
  rows: z.array(z.string().max(200)).length(3),
  cols: z.array(z.string().max(200)).length(3),
});

export const CommunityInput = z.discriminatedUnion("kind", [SeanceInput, ConstellationInput]);
export type CommunityInputT = z.infer<typeof CommunityInput>;

/** A Constellation category as the editor sees it. */
export type FacetOption = { id: string; dim: string; label: string; info: string; members: number[] };
export const facetId = (f: { dim: string; label: string }) => `${f.dim}|${f.label}`;

/** A puzzle in the list. */
export type CommunitySummary = {
  id: string; kind: CommunityKind; entity: string | null; title: string; author: string;
  plays: number; solves: number; createdAt: string; images: string[];
};
