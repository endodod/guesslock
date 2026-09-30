import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { approveTexts } from "../actions";
import { ActionButton } from "../ui";
import { TextRow } from "./TextRow";

const TYPES = ["hero_lore", "ability_desc", "ability_t1", "ability_t2", "ability_t3"] as const;
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
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Texts (redaction review)</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {TYPES.map((t) => <Link key={t} href={q({ type: t })} className={t === type ? "font-semibold" : "text-blue-700"}>{t}</Link>)}
        <span className="text-neutral-400">|</span>
        {FILTERS.map((f) => <Link key={f} href={q({ filter: f })} className={f === filter ? "font-semibold" : "text-blue-700"}>{f}</Link>)}
        <span className="text-neutral-400">|</span>
        <form className="inline-flex gap-1">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="filter" value={filter} />
          <select name="hero" defaultValue={sp.hero ?? ""} className="rounded border border-neutral-400 px-1">
            <option value="">All heroes</option>
            {heroes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <button className="rounded border border-neutral-400 px-2">Filter</button>
        </form>
      </div>
      <p className="text-xs text-neutral-500">
        Players only see approved or rewritten texts. ▇▇▇ marks a redaction. Also redact place/faction names or unique terms that give the answer away.
        Showing up to 60 entries.
      </p>
      {pendingIds.length > 0 && (
        <ActionButton action={approveTexts.bind(null, pendingIds)} label={`Approve all ${pendingIds.length} shown as-is`} confirm="Approve every shown text unchanged? Make sure you read them." />
      )}
      <ul className="space-y-3">
        {entries.map((e) => (
          <TextRow
            key={e.id}
            entry={{ id: e.id, label: label(Number(e.entityId)), source: e.sourceText, auto: e.autoText, final: e.finalText, status: e.status, stale: e.stale }}
          />
        ))}
      </ul>
      {entries.length === 0 && <p className="text-sm text-neutral-500">Nothing here.</p>}
    </div>
  );
}
