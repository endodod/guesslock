import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin/auth";
import type { NormHero } from "@/lib/deadlock/types";
import { mediaUrl } from "@/lib/media";
import { saveAbility, saveHero } from "../../actions";
import { ExcludeBoxes, MODE_OPTIONS } from "../../shared";
import { EmojiEditor } from "./EmojiEditor";
import { VoiceLineManager } from "./VoiceLineManager";

const HERO_MODES = MODE_OPTIONS.slice(0, 9);
const ABILITY_MODES = MODE_OPTIONS.filter(([m]) => ["ability-icon", "ability-desc", "upgrades"].includes(m));

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src.images.small && <img src={mediaUrl(src.images.small)!} alt="" className="h-16 w-16 rounded bg-neutral-800" />}
        <div>
          <h1 className="text-xl font-semibold">{hero.name} <span className="text-sm font-normal text-neutral-500">#{hero.id} · {hero.className}</span></h1>
          <p className="text-sm text-neutral-600">
            API: {src.gender ?? "?"} · {src.heroType ?? "?"} · complexity {src.complexity ?? "?"} · {src.gunTag ?? "no gun tag"} · {src.maxHealth} HP · {src.dps} DPS
          </p>
          {hero.needsReview && <p className="text-sm text-amber-700">Needs review: {hero.reviewReasons.join(" · ")}</p>}
        </div>
        <Link href="/admin/heroes" className="ml-auto text-sm text-blue-700 hover:underline">All heroes</Link>
      </div>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-3 font-semibold">Curation</h2>
        <form action={saveHero.bind(null, hero.id)} className="grid gap-3 md:grid-cols-2">
          <label>Species <span className="text-xs text-neutral-500">(comma-separate multiple, e.g. &quot;Human, Undead&quot;)</span>
            <input name="species" defaultValue={hero.species ?? ""} className={input} />
          </label>
          <label>Release date <span className="text-xs text-neutral-500">(when the hero became playable)</span>
            <input name="releaseDate" type="date" defaultValue={hero.releaseDate?.toISOString().slice(0, 10) ?? ""} className={input} />
          </label>
          <label>Gender override <span className="text-xs text-neutral-500">(API: {src.gender ?? "none"})</span>
            <input name="genderOverride" defaultValue={hero.genderOverride ?? ""} className={input} />
          </label>
          <label>Weapon type override <span className="text-xs text-neutral-500">(API: {src.gunTag ?? "none"})</span>
            <input name="weaponTypeOverride" defaultValue={hero.weaponTypeOverride ?? ""} className={input} />
          </label>
          <label className="md:col-span-2">Aliases <span className="text-xs text-neutral-500">(comma-separated; used for search and redaction, e.g. nicknames, factions that give the hero away)</span>
            <input name="aliases" defaultValue={hero.aliases.join(", ")} className={input} />
          </label>
          <div className="md:col-span-2"><ExcludeBoxes selected={hero.excludeFromModes} modes={HERO_MODES} /></div>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="markReviewed" defaultChecked={hero.needsReview} /> Mark reviewed</label>
          <div><button className="rounded bg-neutral-900 px-4 py-1.5 text-white">Save</button></div>
        </form>
      </section>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-3 font-semibold">Abilities</h2>
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
      </section>

      <section id="emoji" className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-3 font-semibold">The Cipher — emoji set</h2>
        <EmojiEditor heroId={hero.id} initial={hero.emojis} reviewed={hero.emojisReviewed} others={others} />
      </section>

      <section id="voice" className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="mb-3 font-semibold">The Echo — voice lines</h2>
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
      </section>
    </div>
  );
}
