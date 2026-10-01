"use client";
// One collectible: its picture or glyph, name, rarity and value. Shared by The Black Market and the inventory.
import { RARITY_LABEL, type Collectible, type Rarity } from "@/lib/market/catalog";

export const RARITY_CLS: Record<Rarity, string> = {
  common: "border-ash/40 text-paper", rare: "border-[#7d9ef0]/70 text-[#a9c0ff]", epic: "border-cursed/70 text-[#c7b2ff]",
  legendary: "border-brass text-brass shadow-[0_0_18px_rgba(201,164,92,0.45)]",
};
/** The rarity's text colour alone. */
export const rarityText = (r: Rarity) => RARITY_CLS[r].split(" ")[1];

export function Art({ c, size = "h-16 w-16" }: { c: Pick<Collectible, "image" | "glyph">; size?: string }) {
  return c.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={c.image} alt="" loading="lazy" className={`${size} shrink-0 rounded-sm bg-ink/60 object-contain p-1`} />
  ) : (
    <span aria-hidden className={`${size} cipher-glyph flex shrink-0 items-center justify-center rounded-sm bg-ink/60 text-3xl`}>{c.glyph}</span>
  );
}

export function CollectibleTile({ c, children }: { c: Collectible; children?: React.ReactNode }) {
  return (
    <div className={`flex h-full flex-col gap-2 rounded-sm border bg-iron/60 p-3 ${RARITY_CLS[c.rarity]}`}>
      <div className="flex items-center gap-3">
        <Art c={c} />
        <div className="min-w-0">
          <p className="truncate font-display text-base leading-tight text-paper">{c.name}</p>
          <p className={`smallcaps text-xs ${rarityText(c.rarity)}`}>{RARITY_LABEL[c.rarity]}</p>
          {c.sub && <p className="truncate text-xs text-ash">{c.sub}</p>}
        </div>
      </div>
      <p className="font-mono text-xs text-ash">worth {c.value.toLocaleString("en-US")} souls</p>
      {children}
    </div>
  );
}
