// Request schemas for the agent API. All strict: unknown fields are rejected, every string is length-capped.
import { z } from "zod";

const alias = z.string().trim().min(1).max(40).regex(/^[^\u0000-\u001f<>]+$/, "no control characters or angle brackets");
const mode = z.string().trim().min(1).max(40);
const id = z.number().int().positive();

/** Replace the whole list, or change it incrementally. */
const listEdit = <T extends z.ZodType>(item: T) =>
  z.union([z.array(item).max(30), z.strictObject({ add: z.array(item).max(30).optional(), remove: z.array(item).max(30).optional() })]);

export const EntityPatch = z.strictObject({
  aliases: listEdit(alias).optional(),
  /** Modes (lock `mode` ids, see GET /state) this entity must never be an answer in. */
  excludeFromModes: listEdit(mode).optional(),
  /** Category values by category key (heroes and items). `null` or "" clears the value. */
  values: z.record(z.string().max(60), z.union([z.string().max(200), z.number().finite(), z.null()])).optional(),
  /** Heroes only: The Belongings item class names to always show / never show. */
  setup: z.strictObject({ buildPin: z.array(z.string().max(80)).max(20).optional(), buildBan: z.array(z.string().max(80)).max(40).optional() }).optional(),
});
export type EntityPatch = z.infer<typeof EntityPatch>;

export const COMPARE = ["exact", "multi", "numeric", "date"] as const;

export const CategoryCreate = z.strictObject({
  entity: z.enum(["hero", "item"]),
  label: z.string().trim().min(1).max(40),
  type: z.enum(COMPARE).default("exact"),
  unit: z.string().trim().max(12).optional(),
  info: z.string().trim().max(200).optional(),
});
export type CategoryCreate = z.infer<typeof CategoryCreate>;

export const CategoryPatch = z.strictObject({
  label: z.string().trim().min(1).max(40).optional(),
  info: z.string().trim().max(200).optional(),
  enabled: z.boolean().optional(),
  order: z.number().int().min(0).max(10000).optional(),
});
export type CategoryPatch = z.infer<typeof CategoryPatch>;

export const MemberEdit = z.strictObject({
  /** Entities (heroes, items or abilities, by the category's entity) that belong to the group. */
  add: z.array(id).max(60).optional(),
  /** Heroes that explicitly do NOT belong (a "no" answer). */
  notMembers: z.array(id).max(60).optional(),
  /** Back to "unknown" (removes the answer). */
  remove: z.array(id).max(60).optional(),
  /** Every entity still unknown becomes "does not belong". Only do this when the member list is complete. */
  completeRest: z.boolean().optional(),
});
export type MemberEdit = z.infer<typeof MemberEdit>;

export const SeanceCreate = z.strictObject({
  /** What the group is about: heroes (The Séance), items (The Bazaar) or abilities (The Grimoire). */
  entity: z.enum(["hero", "item", "ability"]).default("hero"),
  /** Heroes: mechanics, visuals, lore. Items: stats, effects, visuals. Abilities: mechanics, effects, visuals. */
  type: z.enum(["mechanics", "visuals", "lore", "stats", "effects"]),
  label: z.string().trim().min(2).max(60),
  explanation: z.string().trim().max(200).optional(),
  difficulty: z.number().int().min(1).max(4).default(2),
  members: MemberEdit,
});
export type SeanceCreate = z.infer<typeof SeanceCreate>;

export const SeancePatch = z.strictObject({
  label: z.string().trim().min(2).max(60).optional(),
  explanation: z.string().trim().max(200).nullable().optional(),
  difficulty: z.number().int().min(1).max(4).optional(),
  /** "approved" only works when the server allows agents to approve (AGENT_API_ALLOW_APPROVE). */
  status: z.enum(["draft", "approved", "retired"]).optional(),
  members: MemberEdit.optional(),
});
export type SeancePatch = z.infer<typeof SeancePatch>;

export const PuzzleAction = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  action: z.enum(["regenerate", "override"]),
  answerId: z.string().max(40).optional(),
});
export type PuzzleAction = z.infer<typeof PuzzleAction>;

