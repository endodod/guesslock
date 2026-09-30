import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import type { NormHero } from "@/lib/deadlock/types";

export default async function HeroesAdmin() {
  await requireAdminPage();
  const [heroes, lines] = await Promise.all([
    db.hero.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.voiceLine.groupBy({ by: ["heroId"], where: { status: "approved" }, _count: true }),
  ]);
  const approved = new Map(lines.map((l) => [l.heroId, l._count]));
  const ok = (v: boolean) => (v ? <span className="text-green-700">✓</span> : <span className="text-red-600">–</span>);
  return (
    <div className="rounded border border-neutral-300 bg-white p-4">
      <h1 className="mb-3 text-lg font-semibold">Heroes</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <th>Hero</th><th>Gender</th><th>Species</th><th>Weapon</th><th>Released</th><th>Emoji</th><th>Lines</th><th>Generic VO</th><th>Excluded</th><th>Review</th>
          </tr>
        </thead>
        <tbody>
          {heroes.map((h) => {
            const src = h.source as unknown as NormHero;
            return (
              <tr key={h.id} className={`border-t border-neutral-200 ${h.active ? "" : "opacity-50"}`}>
                <td><Link className="text-blue-700 hover:underline" href={`/admin/heroes/${h.id}`}>{h.name}</Link>{!h.active && " (removed)"}</td>
                <td>{h.genderOverride ?? src.gender ?? "?"}</td>
                <td>{h.species ?? ok(false)}</td>
                <td>{h.weaponTypeOverride ?? src.gunTag ?? ok(false)}</td>
                <td>{h.releaseDate?.toISOString().slice(0, 10) ?? ok(false)}</td>
                <td>{h.emojis.join("")} {ok(h.emojis.length >= 10 && h.emojisReviewed)}</td>
                <td>{approved.get(h.id) ?? 0}</td>
                <td>{h.genericVoice ? "yes" : ""}</td>
                <td className="text-xs">{h.excludeFromModes.join(", ")}</td>
                <td className="text-xs text-amber-700">{h.needsReview ? h.reviewReasons.join(" · ") : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
