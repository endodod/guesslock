import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import type { NormHero } from "@/lib/deadlock/types";
import type { SeanceEntity } from "@/locks.config";
import { activeEntities, categoryUsage } from "@/lib/seance/library";
import { completeness } from "@/lib/seance/rules";
import { ENTITY_TYPES } from "@/lib/seance/types";
import { ActionButton } from "../../ui";
import { clearFlag, deleteCategory, fillUnknown, saveCategory } from "../actions";
import { MembershipGrid } from "./MembershipGrid";
import { Card, PageHeader, Pill, Stat } from "../../kit";

export default async function CategoryEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id: raw } = await params;
  const id = Number(raw);
  const found = Number.isInteger(id) ? await db.seanceCategory.findUnique({ where: { id }, include: { memberships: true } }) : null;
  if (!found) notFound();
  const entity = found.entity as SeanceEntity;
  const c = { ...found, memberships: found.memberships.map((m) => ({ entityId: Number(m.entityId), member: m.member, source: m.source })) };
  const [tiles, loreRows, usage] = await Promise.all([
    activeEntities(entity),
    entity === "hero" ? db.hero.findMany({ where: { active: true }, select: { id: true, source: true } }) : [],
    categoryUsage(),
  ]);
  const lore = new Map(loreRows.map((h) => [h.id, (h.source as unknown as NormHero).lore?.slice(0, 600) ?? null]));
  const heroes = tiles.map((t) => ({ id: t.id, name: t.sub ? `${t.name} (${t.sub})` : t.name, image: t.image, lore: lore.get(t.id) ?? null }));
  const comp = completeness(c.memberships, heroes.map((h) => h.id));
  const used = usage.get(c.id);
  const diff = c.diff as { added?: number[]; removed?: number[]; at?: string } | null;
  const name = new Map(heroes.map((h) => [h.id, h.name]));

  return (
    <div className="space-y-6">
      <PageHeader title={c.label} subtitle={`${entity} · ${c.type} · ${c.source}${c.key ? ` (${c.key})` : ""}`} actions={<Link className="text-sm text-blue-700 hover:underline" href="/admin/seance">← Séance categories</Link>} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Members" value={comp.members.length} />
        <Stat label="Status" value={<Pill tone={c.status === "approved" ? "green" : c.status === "retired" ? "slate" : "amber"}>{c.status}</Pill>} />
        <Stat label="Completeness" value={comp.complete ? "Complete" : `${comp.unknown.length} unknown`} tone={comp.complete ? "green" : "red"} />
        <Stat label="Last used" value={used ? used.date : "Never"} />
      </div>
      <Card title="Category details" hint="Label and approval state shown to puzzle solvers">
        <p className="text-sm text-neutral-600">
          {c.type} · source {c.source}{c.key ? ` (${c.key})` : ""} · {comp.members.length} members ·{" "}
          <span className={comp.complete ? "text-green-800" : "text-red-700"}>{comp.complete ? "complete" : `${comp.unknown.length} unknown`}</span> ·
          last used {used ? `${used.date} (${used.table})` : "never"}
        </p>
        {c.flagged && (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
            {c.flagReason}
            {diff && (
              <span className="ml-2 text-xs">
                {diff.added?.length ? <span className="text-green-800">+ {diff.added.map((h) => name.get(h) ?? h).join(", ")} </span> : null}
                {diff.removed?.length ? <span className="text-red-700">− {diff.removed.map((h) => name.get(h) ?? h).join(", ")}</span> : null}
              </span>
            )}
            <span className="ml-2"><ActionButton action={clearFlag.bind(null, c.id)} label="Looks right" /></span>
          </div>
        )}
        <form action={saveCategory.bind(null, c.id)} className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <label className="flex flex-col">Label (shown after the group is solved)
            <input name="label" defaultValue={c.label} className="rounded border border-neutral-400 px-1 py-0.5" />
          </label>
          <label className="flex flex-col">Explanation (one line in the results)
            <input name="explanation" defaultValue={c.explanation ?? ""} className="rounded border border-neutral-400 px-1 py-0.5" />
          </label>
          <label className="flex flex-col">Difficulty (1 obvious … 4 devious)
            <select name="difficulty" defaultValue={String(c.difficulty)} className="rounded border border-neutral-400 px-1 py-0.5">
              {[1, 2, 3, 4].map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex flex-col">Status
            <select name="status" defaultValue={c.status} className="rounded border border-neutral-400 px-1 py-0.5">
              {["draft", "approved", "retired"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          {c.source === "curated" && (
            <label className="flex flex-col">Type
              <select name="type" defaultValue={c.type} className="rounded border border-neutral-400 px-1 py-0.5">
                {ENTITY_TYPES[entity].map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          )}
          <div className="flex items-end gap-2">
            <button className="rounded border border-neutral-400 bg-neutral-50 px-3 py-1 hover:bg-neutral-200">Save</button>
            {c.status === "approved" && !comp.complete && <span className="text-xs text-red-700">Approved but incomplete: not used until everything is classified.</span>}
          </div>
        </form>
      </Card>

      <Card title="Members" hint="Click to cycle yes, no, and unknown. Choices persist across syncs.">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span className="text-xs text-neutral-600">
            Click to cycle yes → no → unknown. Your choices are kept across syncs{c.source !== "curated" ? " (they override the API)" : ""}.
            {c.type === "lore" ? " Hover a hero for their lore." : ""}
          </span>
          {comp.unknown.length > 0 && <ActionButton action={fillUnknown.bind(null, c.id, false)} label={`Set ${comp.unknown.length} unknown to "no"`} confirm="Only do this after checking every remaining hero. Continue?" />}
        </div>
        <MembershipGrid
          categoryId={c.id}
          type={c.type}
          heroes={heroes}
          values={Object.fromEntries(c.memberships.map((m) => [m.entityId, { member: m.member, source: m.source }]))}
        />
      </Card>

      {c.source === "curated" && (
        <Card title="Danger zone" className="border-red-200">
          <ActionButton action={deleteCategory.bind(null, c.id)} label="Delete category" confirm="Delete this category and all its memberships?" />
        </Card>
      )}
    </div>
  );
}
