import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { soundEligible } from "@/lib/engine/modes/hero";
import { mediaUrl } from "@/lib/media";
import type { NormAbility } from "@/lib/deadlock/types";
import { ActionButton } from "../ui";
import { runMeasure, runSoundImport, saveSoundMap } from "./actions";
import { ClipTable, type ClipRowData } from "./ClipTable";

// The Resonance: per-hero folder mapping and clip curation. Only approved clips are ever used.
export default async function SoundsAdmin({ searchParams }: { searchParams: Promise<{ hero?: string; show?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const [heroes, maps, counts, lastRun] = await Promise.all([
    db.hero.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { abilities: { where: { active: true }, orderBy: { slot: "asc" } } } }),
    db.heroSoundMap.findMany(),
    db.soundClip.groupBy({ by: ["heroId", "abilityId", "kind", "status", "role"], _count: true }),
    db.syncRun.findFirst({ where: { kind: "sounds" }, orderBy: { id: "desc" } }),
  ]);
  const mapBy = new Map(maps.map((m) => [m.heroId, m]));
  const approvedOf = (abilityId: bigint) =>
    counts.filter((c) => c.abilityId === abilityId && c.status === "approved").flatMap((c) => Array<{ role: string }>(c._count).fill({ role: c.role }));
  const heroRows = heroes.map((h) => {
    const eligible = h.abilities.filter((a) => soundEligible(approvedOf(a.id))).length;
    const n = (pred: (c: (typeof counts)[number]) => boolean) => counts.filter((c) => c.heroId === h.id && pred(c)).reduce((a, c) => a + c._count, 0);
    return {
      h, eligible,
      approved: n((c) => c.status === "approved" && c.kind === "ability"),
      suggested: n((c) => c.status === "suggested" && c.kind === "ability"),
      gun: n((c) => c.status === "approved" && c.kind === "weapon"),
    };
  });
  const heroId = sp.hero ? Number(sp.hero) : undefined;
  const hero = heroes.find((h) => h.id === heroId);
  const showAll = sp.show === "all";
  const unmeasured = await db.soundClip.count({ where: { status: "suggested", measuredAt: null, missing: false } });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">The Resonance — sounds</h1>
      <section className="rounded border border-neutral-300 bg-white p-4 text-sm">
        <p>
          Clips come from deadlock-api&apos;s sound index. The automatic pass only <em>suggests</em> (by file name); a clip is used once you approve it,
          which also mirrors it (players only ever get opaque <code>/media/…</code> URLs). An ability is eligible with ≥ 1 approved <strong>cast</strong> clip
          and ≥ 2 approved clips. ★ = preferred clip 1 (or the preferred gun clip). Gain brings every clip to −20 dBFS.
        </p>
        <p className="mt-2 text-neutral-600">
          Last import: {lastRun ? `${lastRun.finishedAt?.toISOString().slice(0, 16) ?? "running"} (${lastRun.status})` : "never"} ·
          Eligible heroes: {heroRows.filter((r) => r.eligible > 0).length}/{heroes.length} · Suggested clips not yet measured: {unmeasured}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton action={runSoundImport} label="Import sound index now" />
          <ActionButton action={runMeasure.bind(null, undefined)} label="Measure pending clips (~50 s)" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <nav className="rounded border border-neutral-300 bg-white p-2 text-sm">
          <table className="w-full">
            <thead><tr className="text-left text-xs text-neutral-500"><th>Hero</th><th title="eligible abilities">Elig.</th><th title="approved ability clips">Appr.</th><th title="approved gun clips">Gun</th></tr></thead>
            <tbody>
              {heroRows.map(({ h, eligible, approved, gun, suggested }) => (
                <tr key={h.id} className={`border-t border-neutral-100 ${h.id === heroId ? "bg-blue-50" : ""}`}>
                  <td>
                    <Link className="text-blue-700 hover:underline" href={`/admin/sounds?hero=${h.id}`}>{h.name}</Link>
                    {!mapBy.get(h.id)?.abilityFolders.length && <span className="ml-1 text-xs text-red-700">no folder</span>}
                    {h.excludeFromModes.includes("hero-sound") && <span className="ml-1 text-xs text-neutral-500">excluded</span>}
                  </td>
                  <td className={eligible ? "text-green-700" : "text-neutral-400"}>{eligible}</td>
                  <td title={`${suggested} suggested`}>{approved}</td>
                  <td className={gun ? "" : "text-neutral-400"}>{gun}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </nav>

        {hero ? (
          <HeroSounds heroId={hero.id} showAll={showAll} />
        ) : (
          <p className="text-sm text-neutral-500">Pick a hero.</p>
        )}
      </div>
    </div>
  );
}

async function HeroSounds({ heroId, showAll }: { heroId: number; showAll: boolean }) {
  const hero = await db.hero.findUniqueOrThrow({ where: { id: heroId }, include: { abilities: { where: { active: true }, orderBy: { slot: "asc" } }, soundMap: true } });
  const clips = await db.soundClip.findMany({
    // Default view: everything not excluded, plus unmatched clips (for the "not matched" list).
    where: { heroId, ...(showAll ? {} : { OR: [{ status: { not: "excluded" } }, { manual: true }, { kind: "ability", abilityId: null }] }) },
    orderBy: [{ status: "asc" }, { role: "asc" }, { sourcePath: "asc" }],
  });
  const abilities = hero.abilities.map((a) => ({ id: Number(a.id), name: a.name, slot: a.slot, icon: mediaUrl((a.source as unknown as NormAbility).image) }));
  const row = (c: (typeof clips)[number]): ClipRowData => ({
    id: c.id, name: c.sourcePath.split("/").slice(2).join("/"), folder: c.sourcePath.split("/").slice(0, 2).join("/"), url: c.sourceUrl,
    kind: c.kind as "ability" | "weapon", role: c.role, status: c.status, abilityId: c.abilityId === null ? null : Number(c.abilityId),
    score: c.score, preferred: c.preferred, reason: c.autoReason, changed: c.changed, missing: c.missing, manual: c.manual,
    durationMs: c.durationMs, loudnessDb: c.loudnessDb, gainDb: c.gainDb, mirrored: !!c.assetId,
  });
  const input = "w-full rounded border border-neutral-400 px-2 py-1";
  const q = showAll ? "" : "&show=all";
  return (
    <div className="space-y-4">
      <section className="rounded border border-neutral-300 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">{hero.name} <span className="text-sm font-normal text-neutral-500">{hero.className}</span></h2>
          <Link className="text-sm text-blue-700" href={`/admin/sounds?hero=${heroId}${q}`}>{showAll ? "Hide excluded clips" : "Show excluded clips too"}</Link>
          <ActionButton action={runMeasure.bind(null, heroId)} label="Measure this hero's pending clips" />
          <Link className="text-sm text-blue-700" href={`/admin/heroes/${heroId}`}>Hero page (exclude from The Resonance)</Link>
        </div>
        <form action={saveSoundMap.bind(null, heroId)} className="grid gap-2 text-sm md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
          <label>Ability folders <span className="text-xs text-neutral-500">(under abilities/, comma-separated)</span>
            <input name="abilityFolders" defaultValue={hero.soundMap?.abilityFolders.join(", ") ?? ""} className={input} />
          </label>
          <label>Weapon folders <span className="text-xs text-neutral-500">(under weapons/)</span>
            <input name="weaponFolders" defaultValue={hero.soundMap?.weaponFolders.join(", ") ?? ""} className={input} />
          </label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" name="auto" defaultChecked={hero.soundMap?.source !== "manual"} /> auto (re-resolved on import)</label>
          <button className="rounded bg-neutral-900 px-3 py-1 text-white">Save + re-import</button>
        </form>
      </section>

      {abilities.map((a) => {
        const mine = clips.filter((c) => c.kind === "ability" && c.abilityId !== null && Number(c.abilityId) === a.id);
        const approved = mine.filter((c) => c.status === "approved");
        const ok = soundEligible(approved);
        return (
          <section key={a.id} className="rounded border border-neutral-300 bg-white p-4">
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.icon && <img src={a.icon} alt="" className="h-7 w-7 rounded bg-neutral-800 p-0.5" />}
              {a.name} <span className="text-xs font-normal text-neutral-500">{a.slot === 4 ? "Ultimate" : `Ability ${a.slot}`}</span>
              <span className={`text-xs font-normal ${ok ? "text-green-700" : "text-amber-700"}`}>
                {ok ? "eligible" : "not eligible"} · {approved.length} approved ({approved.filter((c) => c.role === "cast").length} cast)
              </span>
            </h3>
            {mine.length ? <ClipTable rows={mine.map(row)} abilities={abilities} /> : <p className="text-sm text-neutral-500">No clips suggested (passives often have none).</p>}
          </section>
        );
      })}

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h3 className="mb-2 font-semibold">Gun (hint after 4 wrong guesses)</h3>
        <ClipTable rows={clips.filter((c) => c.kind === "weapon").map(row)} abilities={abilities} />
      </section>

      <details className="rounded border border-neutral-300 bg-white p-4">
        <summary className="cursor-pointer font-semibold">
          Not matched to an ability ({clips.filter((c) => c.kind === "ability" && c.abilityId === null).length})
        </summary>
        <p className="my-2 text-xs text-neutral-500">Renamed abilities end up here (e.g. Holliday&apos;s Crackshot is &quot;target_practice&quot;). Pick the ability, then approve.</p>
        <ClipTable rows={clips.filter((c) => c.kind === "ability" && c.abilityId === null).map(row)} abilities={abilities} />
      </details>
    </div>
  );
}
