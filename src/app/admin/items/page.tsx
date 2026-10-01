import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import type { NormItem } from "@/lib/deadlock/types";
import { mediaUrl } from "@/lib/media";
import { saveItem } from "../actions";
import { ExcludeBoxes, MODE_OPTIONS } from "../shared";
import { Card, PageHeader, Pill, Stat } from "../kit";

export const dynamic = "force-dynamic";

const ITEM_MODES = MODE_OPTIONS.slice(10);

export default async function ItemsAdmin() {
  await requireAdminPage();
  const items = await db.item.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  const weaponCount = items.filter((i) => (i.source as unknown as NormItem).slot === "weapon").length;
  const vitalityCount = items.filter((i) => (i.source as unknown as NormItem).slot === "vitality").length;
  const spiritCount = items.filter((i) => (i.source as unknown as NormItem).slot === "spirit").length;
  const reviewCount = items.filter((i) => i.needsReview).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Items"
        subtitle="Used by The Relic (icon), The Appraisal (attributes), The Lineage (build path) and The Measure (stats). Tier 5 and disabled items are excluded automatically."
        actions={
          <Link href="/admin/categories?entity=item" className="text-xs text-blue-700 hover:underline">
            Appraisal Attribute Categories ↗
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Shop Items" value={items.length} sub="Active catalog items" />
        <Stat label="By Category Slot" value={`${weaponCount}W · ${vitalityCount}V`} sub={`${spiritCount} Spirit items`} />
        <Stat label="Needs Review" value={reviewCount} tone={reviewCount > 0 ? "amber" : "green"} sub="Sync changes" />
        <Stat label="Item Modes" value={ITEM_MODES.length} sub="Relic · Appraisal · Lineage · Measure" />
      </div>

      <Card>
        <div className="divide-y divide-neutral-100">
          {items.map((i) => {
            const src = i.source as unknown as NormItem;
            const icon = mediaUrl(src.image);

            return (
              <div key={String(i.id)} id={`item-${i.id}`} className="py-3">
                <form action={saveItem.bind(null, Number(i.id))} className="flex flex-wrap items-center gap-3 text-sm">
                  <div className="flex w-60 items-center gap-3">
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon} alt="" className="h-9 w-9 shrink-0 rounded border border-neutral-700 bg-neutral-900 object-contain p-1 shadow-sm" />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded border border-neutral-200 bg-neutral-100" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-neutral-900">{i.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                        <Pill tone={src.slot === "weapon" ? "amber" : src.slot === "vitality" ? "green" : "indigo"}>
                          {src.slot} · T{src.tier}
                        </Pill>
                        {src.isActive && <Pill tone="slate">Active</Pill>}
                        {i.needsReview && <Pill tone="amber">Review</Pill>}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-44 flex-1">
                    <input
                      name="aliases"
                      defaultValue={i.aliases.join(", ")}
                      placeholder="Aliases (comma-separated)"
                      className="w-full rounded border border-neutral-300 bg-neutral-50/50 px-2.5 py-1 text-xs text-neutral-800 transition focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <ExcludeBoxes selected={i.excludeFromModes} modes={ITEM_MODES} />

                  <button
                    type="submit"
                    className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 active:bg-neutral-100"
                  >
                    Save
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
