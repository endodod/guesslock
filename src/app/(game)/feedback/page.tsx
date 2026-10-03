import { HARD_LOCKS, LOCKS } from "@/locks.config";
import { loadGameData } from "@/lib/engine/context";
import { formatCell, type Attrs, type ColumnDef } from "@/lib/engine/columns";
import { todayDate } from "@/lib/day";
import { FeedbackForm, type FeedbackEntity, type FeedbackLock } from "@/components/FeedbackForm";

export const metadata = { title: "Report a problem" };
export const dynamic = "force-dynamic";

const plain = (s: string | null | undefined, max = 300) => {
  const t = (s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const data = await loadGameData();
  const locks: FeedbackLock[] = [...LOCKS, ...HARD_LOCKS].map((l) => ({ slug: l.slug, label: `${l.numeral}. ${l.name}${l.table ? ` · ${l.table.label}` : ""}` }));

  // Every hero, item and ability with the values a player can see, so the report says what was shown.
  const values = <T extends { attrs: Attrs }>(row: T, cols: ColumnDef<T>[]) =>
    Object.fromEntries(cols.filter((c) => !c.disabled).map((c) => [c.key, formatCell(c, c.get(row, data))]));
  const heroCols = data.heroColumns.filter((c) => !c.disabled);
  const itemCols = data.itemColumns.filter((c) => !c.disabled);
  const entities: FeedbackEntity[] = [
    ...data.heroes.map((h) => ({
      entity: "hero" as const, id: h.id, name: h.name,
      fields: [...heroCols.map((c) => ({ key: c.key, label: c.label })), { key: "name", label: "Name" }, { key: "lore", label: "Lore text" }],
      values: { ...values(h, data.heroColumns), name: h.name, lore: plain(h.src.lore) },
    })),
    ...data.items.map((i) => ({
      entity: "item" as const, id: i.id, name: i.name,
      fields: [...itemCols.map((c) => ({ key: c.key, label: c.label })), { key: "name", label: "Name" }, { key: "description", label: "Description" }],
      values: { ...values(i, data.itemColumns), name: i.name, description: plain(i.src.description) },
    })),
    ...data.abilities.map((a) => ({
      entity: "ability" as const, id: a.id, name: `${data.hero(a.heroId)?.name ?? "?"}: ${a.name}`,
      fields: [
        { key: "name", label: "Name" }, { key: "description", label: "Description" }, { key: "upgrades", label: "Upgrades" },
        ...(a.src.stats ?? []).map((s) => ({ key: `stat:${s.key}`, label: s.label })),
      ],
      values: {
        name: a.name, description: plain(a.src.description), upgrades: plain(a.src.tiers.filter(Boolean).join(" · ")),
        ...Object.fromEntries((a.src.stats ?? []).map((s) => [`stat:${s.key}`, s.display])),
      },
    })),
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl text-brass">Report a problem</h1>
        <p className="mt-2 text-paper/85">Found a broken puzzle, or a value that&apos;s wrong? Tell us here. Every report is read.</p>
      </div>
      <FeedbackForm
        locks={locks} entities={entities} today={todayDate()}
        initial={{
          kind: sp.kind === "data" ? "data" : "bug",
          date: sp.date, lock: sp.lock, entity: sp.entity, id: sp.id ? Number(sp.id) : undefined, field: sp.field,
        }}
      />
    </div>
  );
}
