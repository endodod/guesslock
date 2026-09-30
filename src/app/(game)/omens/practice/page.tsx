import { PracticeClient } from "@/components/omens/PracticeClient";
import { getCatalog } from "@/lib/engine/catalog";
import { getMapMeta } from "@/lib/omens/map";
import { poolCounts } from "@/lib/omens/practice";

export const metadata = { title: "Omen practice" };

export default async function OmenPracticePage() {
  const [catalog, map, counts] = await Promise.all([getCatalog(), getMapMeta(), poolCounts()]);
  const cat = {
    heroes: Object.fromEntries(catalog.hero.map((h) => [Number(h.id), { name: h.name, icon: h.icon }])),
    items: Object.fromEntries(catalog.item.map((i) => [Number(i.id), { name: i.name, icon: i.icon, slot: i.slot }])),
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 md:py-8">
      <p className="smallcaps text-xs text-cursed">The Omens</p>
      <h1 className="font-display text-3xl text-paper">Practice</h1>
      <p className="mt-1 max-w-2xl text-ash">
        Endless Omens from real matches. Practice never counts toward your souls, streaks or daily stats; the Ledger tracks your accuracy separately.
      </p>
      <PracticeClient cat={cat} map={map} counts={counts} />
    </div>
  );
}
