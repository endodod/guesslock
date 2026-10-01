import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { requireAdminPage } from "@/lib/admin/auth";
import { todayDate } from "@/lib/day";
import { addDays } from "@/lib/time";
import { loadGameData, type GameData } from "@/lib/engine/context";
import type { BasePayload } from "@/lib/engine/mode";
import type { OmenPayload } from "@/lib/omens/types";
import { RULES } from "@/lib/i18n/rules";
import { LOCK_BY_SLUG, LOCKS } from "@/locks.config";
import { ActionButton } from "../../ui";
import { ModeSwitch } from "../../setup/SetupClient";
import { buildDay, overrideAnswer, setInMode } from "../actions";
import { poolRows, type PoolRow } from "../pool";
import { Card, PageHeader, Pill, Stat } from "../../kit";

export const dynamic = "force-dynamic";

/** Where to edit what this lock uses from one hero/ability/item. */
function editHref(mode: string, r: PoolRow): string {
  const hero = r.heroId;
  switch (mode) {
    case "classic": return `/admin/categories?entity=hero`;
    case "lore": return `/admin/texts?type=hero_lore&hero=${hero}&filter=all`;
    case "ability-desc": return `/admin/texts?type=ability_desc&hero=${hero}&filter=all`;
    case "upgrades": return `/admin/texts?type=ability_t1&hero=${hero}&filter=all`;
    case "item-classic": return `/admin/categories?entity=item`;
    case "item-picture": case "build-path": case "stat-bonus": return `/admin/items#item-${r.id}`;
    default: return config.adminSetup ? `/admin/setup/${hero}#${mode}` : `/admin/heroes/${hero}`;
  }
}

/** A short look at what this lock takes from the row. */
function Preview({ mode, r, data }: { mode: string; r: PoolRow; data: GameData }) {
  const h = r.heroId ? data.hero(r.heroId) : undefined;
  const abilitySwitches = (m: string) => (
    <div className="flex flex-wrap gap-2">
      {data.abilitiesOf(r.heroId!).map((a) => (
        <span key={a.id} className="inline-flex items-center gap-1 rounded border border-neutral-200 px-1.5 py-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {a.icon && <img src={a.icon} alt="" className="h-5 w-5 rounded bg-neutral-800 object-contain" />}
          <ModeSwitch on={!a.exclude.includes(m)} label={a.name} action={setInMode.bind(null, "ability", String(a.id), m)} />
        </span>
      ))}
    </div>
  );
  switch (mode) {
    // eslint-disable-next-line @next/next/no-img-element
    case "splash": return h?.splash ? <img src={h.splash} alt="" className="h-12 w-auto rounded bg-neutral-800" /> : null;
    case "ability-icon": case "ability-desc": return abilitySwitches(mode);
    case "lore": return <span className="line-clamp-2 max-w-xl text-xs text-neutral-600">{data.text("hero_lore", r.heroId!) ?? "no lore"}</span>;
    case "emoji": return <span className="text-lg">{h?.emojis.join("")}</span>;
    case "quote": return <span className="text-xs">{data.voiceEntries(r.heroId!, "select").length} select lines</span>;
    case "quote-cast": return <span className="text-xs">{data.voiceEntries(r.heroId!, "cast").length} cast lines</span>;
    case "quote-convo": return <span className="text-xs">{data.voiceEntries(r.heroId!, "convo").length} conversations</span>;
    case "whose-build": return <span className="text-xs">{(h?.setup.buildPin?.length ?? 0)} always · {(h?.setup.buildBan?.length ?? 0)} never shown</span>;
    case "upgrades": return <span className="line-clamp-2 max-w-xl text-xs text-neutral-600">{data.text("ability_t3", Number(r.id)) ?? "no Tier III text"}</span>;
    // eslint-disable-next-line @next/next/no-img-element
    default: return r.kind === "item" && r.icon ? <img src={r.icon} alt="" className="h-8 w-8 rounded bg-neutral-800 object-contain p-0.5" /> : null;
  }
}

export default async function PuzzleAdmin({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdminPage();
  const { slug } = await params;
  const lock = LOCK_BY_SLUG[slug];
  if (!lock) notFound();
  const today = todayDate();
  const days = [addDays(today, -1), ...Array.from({ length: 8 }, (_, i) => addDays(today, i))];
  const [data, dayRows] = await Promise.all([
    loadGameData(),
    db.dailyPuzzle.findMany({ where: { mode: slug, date: { in: days } } }),
  ]);
  const byDate = new Map(dayRows.map((r) => [r.date, r]));
  const isOmen = lock.group === "omens";
  const isSeance = !!lock.box;
  const pool = isOmen || isSeance ? [] : poolRows(lock, data, today);
  const options = pool.filter((r) => r.inPool && r.answerId).sort((a, b) => a.name.localeCompare(b.name));
  const counts = { in: pool.filter((r) => r.inPool).length, off: pool.filter((r) => !r.on).length, missing: pool.filter((r) => r.on && !r.inPool).length };
  const answerName = (p: unknown) => {
    const x = p as BasePayload | OmenPayload;
    return x.mode === "omen" ? (x as OmenPayload).scenarioId : (x as BasePayload).answer?.name;
  };
  const idx = LOCKS.findIndex((l) => l.slug === slug);
  const prev = LOCKS[(idx + LOCKS.length - 1) % LOCKS.length], next = LOCKS[(idx + 1) % LOCKS.length];

  return (
    <div className="space-y-6">
      <PageHeader title={`${lock.numeral}. ${lock.name}`} subtitle={lock.subtitle} actions={<div className="flex flex-wrap gap-3 text-sm"><Link href={`/admin/puzzles/${prev.slug}`} className="text-blue-700 hover:underline">← {prev.numeral}</Link><Link href={`/admin/puzzles/${next.slug}`} className="text-blue-700 hover:underline">{next.numeral} →</Link><Link href="/admin/puzzles" className="text-blue-700 hover:underline">All puzzles</Link><Link href={`/lock/${slug}`} className="text-blue-700 hover:underline">Open on site</Link></div>} />
      <Card className="text-sm text-neutral-700">{RULES[slug]}</Card>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Today" value={byDate.get(today) && !byDate.get(today)!.sealed ? "Ready" : "Sealed"} tone={byDate.get(today) && !byDate.get(today)!.sealed ? "green" : "red"} />
        <Stat label="Next 7 days" value={`${days.slice(1).filter((d) => { const r = byDate.get(d); return r && !r.sealed; }).length} / 8`} sub="Generated and playable" />
        <Stat label="Answer pool" value={options.length} sub={isOmen || isSeance ? "Managed in its own library" : `${counts.missing} missing data`} />
        <Stat label="Mode" value={lock.mode} sub={lock.guess} />
      </div>
      <Card title="Schedule" hint="Build upcoming days and override answers when needed">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-neutral-500"><th className="pr-4">Day</th><th className="pr-4">Status</th><th className="pr-4">Answer</th><th>Fix</th></tr></thead>
          <tbody>
            {days.map((d) => {
              const r = byDate.get(d);
              const live = r && !r.sealed;
              return (
                <tr key={d} className="border-t border-neutral-200 align-middle">
                  <td className="py-1.5 pr-4 font-mono">{d}{d === today ? " (today)" : d < today ? " (past)" : ""}</td>
                  <td className="pr-4">
                    {live ? <Pill tone="green">ready{r.overridden ? " · overridden" : ""}</Pill>
                      : r ? <Pill tone="red">sealed: {r.sealedReason}</Pill>
                      : <Pill tone="amber">not generated</Pill>}
                  </td>
                  <td className="pr-4">
                    {live ? (
                      isOmen ? (
                        <Link className="text-blue-700 hover:underline" href={`/admin/omens/${r.answerId}`}>{answerName(r.payload)}</Link>
                      ) : isSeance ? (
                        <span>Table: {lock.table?.label}</span>
                      ) : (
                        answerName(r.payload)
                      )
                    ) : ""}
                  </td>
                  <td className="whitespace-nowrap">
                    {d >= today && (!live || d > today) && <ActionButton action={buildDay.bind(null, slug, d)} label={live ? "Rebuild" : "Build now"} confirm={live ? "Pick a new answer for this day?" : undefined} />}
                    {!isOmen && !isSeance && d >= today && options.length > 0 && (
                      <form action={overrideAnswer.bind(null, slug, d)} className="ml-2 inline-flex gap-1">
                        <select name="answerId" defaultValue="" className="rounded border border-neutral-400 px-1 py-0.5 text-xs">
                          <option value="">Set answer…</option>
                          {options.map((o) => <option key={o.answerId!} value={o.answerId!}>{o.name}{o.sub ? ` (${o.sub})` : ""}</option>)}
                        </select>
                        <button className="rounded border border-neutral-400 px-2 py-0.5 text-xs">Set</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-neutral-500">
          Hints: {lock.hints.length ? lock.hints.map((h) => `${h.label} after ${h.after} wrong`).join(", ") : "none"}. Today can only be built while it has no playable puzzle; set an answer to replace a live one.
        </p>
      </Card>

      {isOmen ? (
        <Card title="Scenarios">
          <p className="text-sm">Matches are harvested daily and each day freezes one scenario; if none is ready, a bundled seed scenario is used.
            Harvest queue, candidate pool, approvals and detection tuning: <Link href="/admin/omens" className="text-blue-700 hover:underline">Omens admin</Link>.</p>
        </Card>
      ) : isSeance ? (
        <Card title={`Séance Table (${lock.table?.label})`}>
          <p className="text-sm">This table draws from approved, complete Séance categories.
            Manage categories, curate memberships, and preview boards: <Link href="/admin/seance" className="text-blue-700 hover:underline">Séance admin</Link>.</p>
        </Card>
      ) : (
        <Card title="Answer pool" hint={`${counts.in} in pool · ${counts.missing} missing data · ${counts.off} turned off`}>
          <p className="mb-3 text-xs text-neutral-500">
            Switches here are the same site-wide settings as on the {lock.guess === "item" ? "Items" : lock.guess === "ability" ? "Abilities" : "Heroes"} pages; changes apply to newly built days.
          </p>
          <table className="w-full text-sm">
            <tbody>
              {[...pool].sort((a, b) => Number(a.inPool) - Number(b.inPool) || (a.sub ?? "").localeCompare(b.sub ?? "") || a.name.localeCompare(b.name)).map((r) => (
                <tr key={`${r.kind}-${r.id}`} id={`${r.kind}-${r.id}`} className="border-t border-neutral-200 align-middle">
                  <td className="w-10 py-1.5"><ModeSwitch on={r.on} label="" action={setInMode.bind(null, r.kind, r.id, lock.mode)} /></td>
                  <td className="w-56 pr-3">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {r.icon && r.kind !== "item" && <img src={r.icon} alt="" className="h-6 w-6 rounded bg-neutral-800 object-contain" />}
                      <span className={r.on ? "" : "text-neutral-400"}>{r.name}</span>
                      {r.sub && <span className="text-xs text-neutral-500">{r.sub}</span>}
                    </div>
                  </td>
                  <td className="w-60 pr-3">
                    <Pill tone={!r.on ? "slate" : r.inPool ? "green" : "amber"}>{r.note}</Pill>
                  </td>
                  <td className="pr-3"><Preview mode={lock.mode} r={r} data={data} /></td>
                  <td className="w-12 text-right"><Link href={editHref(lock.mode, r)} className="text-blue-700 hover:underline">Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
