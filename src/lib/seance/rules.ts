// Category library rules (pure; unit-tested): completeness and how a sync updates derived memberships.
import type { CategoryStatus, CategoryType, LibraryCategory } from "./types";

export type MembershipRow = { heroId: number; member: boolean; source: string };

export type CategoryRow = {
  id: number;
  type: string;
  label: string;
  explanation: string | null;
  difficulty: number;
  status: string;
  memberships: MembershipRow[];
};

/**
 * A category is usable only when every active hero has an explicit yes/no. A missing row is an
 * "unknown" (e.g. a hero added by the sync after the category was written).
 */
export function completeness(rows: MembershipRow[], activeHeroIds: number[]): { complete: boolean; unknown: number[]; members: number[] } {
  const by = new Map(rows.map((r) => [r.heroId, r.member]));
  const unknown = activeHeroIds.filter((id) => !by.has(id));
  const members = activeHeroIds.filter((id) => by.get(id) === true);
  return { complete: unknown.length === 0, unknown, members };
}

/** The categories the board generator may use: approved, complete, members limited to active heroes. */
export function usableCategories(rows: CategoryRow[], activeHeroIds: number[]): LibraryCategory[] {
  const out: LibraryCategory[] = [];
  for (const c of rows) {
    if (c.status !== "approved") continue;
    const { complete, members } = completeness(c.memberships, activeHeroIds);
    if (!complete) continue;
    out.push({
      id: c.id, type: c.type as CategoryType, label: c.label, explanation: c.explanation,
      difficulty: Math.min(4, Math.max(1, c.difficulty)), members,
    });
  }
  return out;
}

export type Reconciled = {
  /** Rows to write (hero -> value) with the derivation source. */
  upserts: { heroId: number; member: boolean }[];
  /** Rows to delete: the API can no longer say (back to "unknown"). */
  deletes: number[];
  added: number[];
  removed: number[];
};

/**
 * Applies freshly derived memberships to the stored rows. Admin rows always win (an admin
 * classified that hero by hand); every other row follows the API.
 */
export function reconcileMemberships(existing: MembershipRow[], derived: Map<number, boolean | null>): Reconciled {
  const by = new Map(existing.map((r) => [r.heroId, r]));
  const out: Reconciled = { upserts: [], deletes: [], added: [], removed: [] };
  for (const [heroId, value] of derived) {
    const prev = by.get(heroId);
    if (prev?.source === "admin") continue;
    if (value === null) {
      if (prev) {
        out.deletes.push(heroId);
        if (prev.member) out.removed.push(heroId);
      }
      continue;
    }
    if (prev && prev.member === value) continue;
    out.upserts.push({ heroId, member: value });
    if (value && !prev?.member) out.added.push(heroId);
    if (!value && prev?.member) out.removed.push(heroId);
  }
  return out;
}

/**
 * Status after a sync changed a category's members: the change flags it for review, but an approved
 * category only drops back to draft when it falls below 4 members.
 */
export function statusAfterSync(status: CategoryStatus, memberCount: number): CategoryStatus {
  return status === "approved" && memberCount < 4 ? "draft" : status;
}
