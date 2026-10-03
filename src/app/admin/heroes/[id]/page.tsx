import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import { config } from "@/lib/config";
import type { NormHero } from "@/lib/deadlock/types";
import { mediaUrl } from "@/lib/media";
import { saveAbility, saveHero } from "../../actions";
import { rebuildDataPuzzles, saveValues } from "../../categories/actions";
import { apiValue, cellSource } from "@/lib/admin/categories";
import { loadGameData } from "@/lib/engine/context";
import type { Attrs, ColumnDef } from "@/lib/engine/columns";
import { AttributeEditor, type AttrField } from "./AttributeEditor";
import { ExcludeBoxes, HERO_MODE_OPTIONS, MODE_OPTIONS } from "../../shared";
import { EmojiEditor } from "./EmojiEditor";
import { VoiceLineManager } from "./VoiceLineManager";
import { Card, PageHeader, Pill } from "../../kit";

const HERO_MODES = HERO_MODE_OPTIONS;
const ABILITY_MODES = MODE_OPTIONS.filter(([m]) => ["ability-icon", "ability-desc", "upgrades", "hero-sound", "ability-stats"].includes(m));

// "Rebuild future puzzles" runs the generator inside the action.
export const maxDuration = 300;

export default async function HeroAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const hero = await db.hero.findUnique({
    where: { id: Number(id) },
    include: { abilities: { where: { active: true }, orderBy: { slot: "asc" } }, voiceLines: { orderBy: [{ section: "asc" }, { id: "asc" }] } },
  });
  if (!hero) notFound();
  const src = hero.source as unknown as NormHero;
  const others = await db.hero.findMany({ where: { id: { not: hero.id }, active: true }, select: { name: true, emojis: true } });
  const input = "w-full rounded border border-neutral-400 px-2 py-1";
  // Every category (built-in, curated, custom) with its current value, where it comes from and the API value.
  const data = await loadGameData();
  const row = data.hero(hero.id);
  const fields: AttrField[] = row
    ? (data.heroColumns as ColumnDef<{ attrs: Attrs }>[]).map((c) => {
        const v = c.get(row, data);
        const api = apiValue("hero", c, row, data);
        return {
          key: c.key, label: c.label, type: c.type, unit: c.unit, info: c.info, custom: c.custom, disabled: c.disabled,
          value: v === null ? "" : String(v), source: cellSource("hero", c, row, v), api: api === null ? undefined : String(api),
        };
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={hero.name}
        subtitle={`${hero.className} · ${src.gender ?? "?"} · ${src.heroType ?? "?"} · ${src.maxHealth} HP · ${src.dps} DPS`}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {hero.needsReview && <Pill tone="amber">Needs review</Pill>}
            {config.adminSetup && <Link href={`/admin/setup/${hero.id}`} className="text-blue-700 hover:underline">Puzzle setup</Link>}
            <Link href="/admin/heroes" className="text-blue-700 hover:underline">All heroes</Link>
          </div>
        }
      />
      <Card className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src.images.small && <img src={mediaUrl(src.images.small)!} alt="" className="h-16 w-16 rounded bg-neutral-800" />}
        <div>
          <p className="text-sm text-neutral-600">Hero #{hero.id} · complexity {src.complexity ?? "?"} · {src.gunTag ?? "no gun tag"}</p>
          {hero.needsReview && <p className="mt-1 text-xs text-amber-700">{hero.reviewReasons.join(" · ")}</p>}
        </div>
      </Card>

      <Card title="Curation" hint="Overrides and exclusions used by puzzle generation">
        <form action={saveHero.bind(null, hero.id)} className="grid gap-3 md:grid-cols-2">
          <label className="md:col-span-2">Aliases <span className="text-xs text-neutral-500">(comma-separated; used for search and redaction, e.g. nicknames, factions that give the hero away)</span>
            <input name="aliases" defaultValue={hero.aliases.join(", ")} className={input} />
          </label>
          <div className="md:col-span-2"><ExcludeBoxes selected={hero.excludeFromModes} modes={HERO_MODES} /></div>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="markReviewed" defaultChecked={hero.needsReview} /> Mark reviewed</label>
          <div><button className="rounded bg-neutral-900 px-4 py-1.5 text-white">Save</button></div>
        </form>
      </Card>

      <Card id="attributes" title="Attributes" hint="Every category of The Reckoning and The Constellation, including custom ones (Role, Height…). Blue = set by admin, red = missing.">
        {row ? (
          <AttributeEditor id={hero.id} fields={fields} save={saveValues.bind(null, "hero")} rebuild={rebuildDataPuzzles.bind(null, "hero")} />
        ) : (
          <p className="text-sm text-neutral-500">This hero is not in the current game data (inactive), so it has no category values.</p>
        )}
      </Card>

      <Card title="Abilities" hint="Aliases and mode availability for this hero">
        <ul className="space-y-3">
          {hero.abilities.map((a) => (
            <li key={String(a.id)}>
              <form action={saveAbility.bind(null, Number(a.id))} className="flex flex-wrap items-end gap-3 border-t border-neutral-200 pt-2">
                <div className="w-48"><strong>{a.name}</strong><div className="text-xs text-neutral-500">{a.slot === 4 ? "Ultimate" : `Ability ${a.slot}`}</div></div>
                <label className="flex-1 text-sm">Aliases<input name="aliases" defaultValue={a.aliases.join(", ")} className={input} /></label>
                <ExcludeBoxes selected={a.excludeFromModes} modes={ABILITY_MODES} />
                <button className="rounded border border-neutral-400 px-3 py-1 text-sm">Save</button>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Card id="emoji" title="The Cipher — emoji set">
        <EmojiEditor heroId={hero.id} initial={hero.emojis} reviewed={hero.emojisReviewed} others={others} />
      </Card>

      <Card title="The Resonance — sounds" className="text-sm">
        <Link className="text-blue-700 hover:underline" href={`/admin/sounds?hero=${hero.id}`}>Curate {hero.name}&apos;s ability and gun sounds</Link>
      </Card>

      <Card id="voice" title="The Echo — voice lines">
        <VoiceLineManager
          heroId={hero.id}
          heroName={hero.name}
          importedAt={hero.voiceImportedAt?.toISOString() ?? null}
          revisionId={hero.voiceRevisionId}
          generic={hero.genericVoice}
          genericManual={hero.genericVoiceManual}
          lines={hero.voiceLines.map((l) => ({
            id: l.id, text: l.text ?? l.autoText, source: l.sourceText, words: l.wordCount, status: l.status,
            starred: l.starred, section: l.section, reason: l.autoReason, audio: !!l.audioUrl, changed: l.sourceChanged, edited: l.manuallyEdited,
          }))}
        />
      </Card>
    </div>
  );
}
