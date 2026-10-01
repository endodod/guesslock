import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { approveTexts } from "../actions";
import { ActionButton } from "../ui";
import { TextRow } from "./TextRow";
import { Card, PageHeader } from "../kit";

export const dynamic = "force-dynamic";

const TYPES = ["hero_lore", "ability_desc", "ability_t1", "ability_t2", "ability_t3"] as const;
const TYPE_LABELS: Record<string, string> = {
  hero_lore: "Hero Lore",
  ability_desc: "Ability Description",
  ability_t1: "Tier 1 Upgrade",
  ability_t2: "Tier 2 Upgrade",
  ability_t3: "Tier 3 Upgrade",
};
const FILTERS = ["pending", "stale", "approved", "all"] as const;

export default async function TextsAdmin({ searchParams }: { searchParams: Promise<{ type?: string; filter?: string; hero?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const type = TYPES.includes(sp.type as never) ? sp.type! : "hero_lore";
  const filter = FILTERS.includes(sp.filter as never) ? sp.filter! : "pending";
  const heroId = sp.hero ? Number(sp.hero) : undefined;

  const [heroes, abilities] = await Promise.all([
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.ability.findMany({ where: { active: true }, select: { id: true, name: true, heroId: true } }),
  ]);
  const heroName = new Map(heroes.map((h) => [h.id, h.name]));
  const ability = new Map(abilities.map((a) => [Number(a.id), a]));
  const idsForHero = heroId
    ? type === "hero_lore" ? [heroId] : abilities.filter((a) => a.heroId === heroId).map((a) => Number(a.id))
    : undefined;

  const where = {
    entityType: type,
    ...(filter === "pending" ? { status: "auto" } : filter === "stale" ? { stale: true } : filter === "approved" ? { status: { in: ["approved", "rewritten"] } } : {}),
    ...(idsForHero ? { entityId: { in: idsForHero } } : {}),
  };
  const entries = await db.textEntry.findMany({ where, orderBy: { entityId: "asc" }, take: 60 });
  const label = (id: number) => {
    if (type === "hero_lore") return heroName.get(id) ?? `#${id}`;
    const a = ability.get(id);
    return a ? `${heroName.get(a.heroId)} — ${a.name}` : `#${id}`;
  };
  const q = (p: Record<string, string | undefined>) =>
    "?" + new URLSearchParams(Object.entries({ type, filter, hero: sp.hero, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const pendingIds = entries.filter((e) => e.status === "auto").map((e) => e.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Text Redactions"
        subtitle="Review automatic redactions for The Testament, The Incantation, and The Ascension. ▇▇▇ indicates redacted terms."
        actions={
          pendingIds.length > 0 ? (
            <ActionButton
              action={approveTexts.bind(null, pendingIds)}
              label={`Approve ${pendingIds.length} shown as-is`}
              confirm="Approve every shown text unchanged? Make sure you have reviewed them."
            />
          ) : undefined
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-100 pb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPES.map((t) => (
              <Link
                key={t}
                href={q({ type: t })}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  t === type ? "bg-neutral-900 text-white" : "border border-neutral-200 bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {TYPE_LABELS[t]}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5 text-xs font-medium">
              {FILTERS.map((f) => (
                <Link
                  key={f}
                  href={q({ filter: f })}
                  className={`rounded px-2 py-0.5 capitalize transition ${
                    f === filter ? "bg-white font-semibold text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"
                  }`}
                >
                  {f}
                </Link>
              ))}
            </div>

            <form className="inline-flex gap-1.5">
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="filter" value={filter} />
              <select
                name="hero"
                defaultValue={sp.hero ?? ""}
                className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 focus:outline-none"
              >
                <option value="">All Heroes</option>
                {heroes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              <button
                type="submit"
                className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Filter
              </button>
            </form>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {entries.length === 0 ? (
            <div className="py-8 text-center">
              <p className="font-medium text-neutral-800">No texts match the selected filter.</p>
              <p className="mt-1 text-xs text-neutral-500">Try selecting another text type or filter option above.</p>
            </div>
          ) : (
            entries.map((e) => (
              <TextRow
                key={e.id}
                entry={{ id: e.id, label: label(Number(e.entityId)), source: e.sourceText, auto: e.autoText, final: e.finalText, status: e.status, stale: e.stale }}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
