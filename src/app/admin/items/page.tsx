import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import type { NormItem } from "@/lib/deadlock/types";
import { saveItem } from "../actions";
import { ExcludeBoxes, MODE_OPTIONS } from "../shared";

const ITEM_MODES = MODE_OPTIONS.slice(10);

export default async function ItemsAdmin() {
  await requireAdminPage();
  const items = await db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return (
    <div className="rounded border border-neutral-300 bg-white p-4">
      <h1 className="mb-1 text-lg font-semibold">Items ({items.length})</h1>
      <p className="mb-3 text-xs text-neutral-500">Tier 5 (Street Brawl) and disabled items are excluded at sync. Aliases help search.</p>
      <ul className="divide-y divide-neutral-200">
        {items.map((i) => {
          const src = i.source as unknown as NormItem;
          return (
            <li key={String(i.id)} className="py-2">
              <form action={saveItem.bind(null, Number(i.id))} className="flex flex-wrap items-end gap-3 text-sm">
                <div className="w-56">
                  <strong>{i.name}</strong>
                  <div className="text-xs text-neutral-500">{src.slot} · T{src.tier} · {src.isActive ? "active" : "passive"} · {src.statBonuses.length} stats{i.needsReview ? " · needs review" : ""}</div>
                </div>
                <label className="min-w-48 flex-1">Aliases
                  <input name="aliases" defaultValue={i.aliases.join(", ")} className="w-full rounded border border-neutral-400 px-2 py-1" />
                </label>
                <ExcludeBoxes selected={i.excludeFromModes} modes={ITEM_MODES} />
                <button className="rounded border border-neutral-400 px-3 py-1">Save</button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
