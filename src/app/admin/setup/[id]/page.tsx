import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSetupPage } from "@/lib/admin/auth";
import { CUSTOM_LINE_PREFIX, parseSetup } from "@/lib/admin/setup";
import { loadGameData } from "@/lib/engine/context";
import { EMOJI_PUZZLE_SIZE, EMOJI_SET_SIZE } from "@/lib/engine/modes/hero";
import { usableText } from "@/lib/text/entries";
import { todayDate } from "@/lib/day";
import { LOCKS } from "@/locks.config";
import { ActionButton } from "../../ui";
import { HERO_MODES, heroStatuses, type ModeStatus } from "../status";
import { AttributesForm, BuildItems, EmojiList, ModeSwitch, SplashForm } from "../SetupClient";
import { Card, PageHeader, Pill } from "../../kit";
import { cellSource } from "@/lib/admin/categories";
import {
  addVoiceLine, editVoiceLine, rebuildDay, removeVoiceLine, restoreVoiceLine, saveAttributes, saveBuildItems,
  saveClueText, saveEmojiList, saveSplash, setAbilityMode, setEchoVoice, setHeroMode,
} from "../actions";

export const dynamic = "force-dynamic";

const EMOJI_MAX = 16;
const BUILD_MAX = 8;
const input = "w-full rounded border border-neutral-400 px-2 py-1";
const saveBtn = "rounded bg-neutral-900 px-3 py-1 text-sm text-white hover:bg-neutral-700";
const TIER_TYPES = ["ability_t1", "ability_t2", "ability_t3"] as const;

function Section({ heroId, mode, label, status, children }: {
  heroId: number; mode: string; label: string; status: ModeStatus; children: React.ReactNode;
}) {
  return (
    <Card id={mode} title={label} className="scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ModeSwitch on={status.on} label="In this puzzle" action={setHeroMode.bind(null, heroId, mode)} />
        <Pill tone={!status.on ? "slate" : status.inPool ? "green" : "amber"}>{status.note}</Pill>
      </div>
      <div className={status.on ? "" : "opacity-60"}>{children}</div>
    </Card>
  );
}

/** A clue text: edit freely; empty resets to the automatic redaction of the API text. */
function TextForm({ heroId, type, entityId, text, source, rows = 3, compact = false }: {
  heroId: number; type: string; entityId: number; text: string; source?: string; rows?: number; compact?: boolean;
}) {
  return (
    <form action={saveClueText.bind(null, heroId, type, entityId)} className="space-y-1">
      <textarea name="text" defaultValue={text} rows={rows} className={`${input} text-sm`} placeholder="No text: empty keeps it out of this puzzle" />
      <div className="flex items-center gap-3">
        <button className={saveBtn}>Save text</button>
        {!compact && <span className="text-xs text-neutral-500">Empty = automatic redaction of the API text.</span>}
        {source && (
          <details className="text-xs text-neutral-600">
            <summary className="cursor-pointer">API text</summary>
            <p className="mt-1 max-w-3xl whitespace-pre-wrap">{source}</p>
          </details>
        )}
      </div>
    </form>
  );
}

export default async function HeroSetup({ params }: { params: Promise<{ id: string }> }) {
  await requireSetupPage();
  const heroId = Number((await params).id);
  const hero = await db.hero.findUnique({
    where: { id: heroId },
    include: {
      abilities: { where: { active: true }, orderBy: { slot: "asc" } },
      voiceLines: { orderBy: [{ section: "asc" }, { id: "asc" }] },
    },
  });
  if (!hero || !hero.active) notFound();
  const today = todayDate();
  const abilityIds = hero.abilities.map((a) => a.id);
  const [data, texts, items, upcoming] = await Promise.all([
    loadGameData(),
    db.textEntry.findMany({
      where: { OR: [{ entityType: "hero_lore", entityId: heroId }, { entityType: { not: "hero_lore" }, entityId: { in: abilityIds } }] },
    }),
    db.item.findMany({ where: { active: true }, select: { className: true, name: true }, orderBy: { name: "asc" } }),
    db.dailyPuzzle.findMany({
      where: { date: { gte: today }, sealed: false, OR: [{ answerId: String(heroId) }, { answerId: { in: abilityIds.map(String) } }] },
      orderBy: { date: "asc" },
    }),
  ]);
  const h = data.hero(heroId)!;
  const status = heroStatuses(data).get(heroId)!;
  const setup = parseSetup(hero.setup);
  const text = new Map(texts.map((t) => [`${t.entityType}:${Number(t.entityId)}`, t]));
  const textOf = (type: string, id: number) => usableText(text.get(`${type}:${id}`)) ?? "";
  const sourceOf = (type: string, id: number) => text.get(`${type}:${id}`)?.sourceText || undefined;
  const label = Object.fromEntries(HERO_MODES);
  const lockBySlug = new Map(LOCKS.map((l) => [l.slug, l]));
  const liveLines = hero.voiceLines.filter((l) => l.status !== "excluded");
  const excludedLines = hero.voiceLines.filter((l) => l.status === "excluded");
  const abilityMode = (mode: string) => hero.abilities.map((a) => ({ a, on: !a.excludeFromModes.includes(mode), id: Number(a.id) }));
  const slotName = (slot: number) => (slot === 4 ? "Ultimate" : `Ability ${slot}`);

  return (
    <div className="space-y-6">
      <PageHeader title={`${hero.name} puzzle setup`} subtitle="Tune this hero's clues and mode availability." actions={<div className="flex flex-wrap gap-3 text-sm"><Link href={`/admin/heroes/${heroId}`} className="text-blue-700 hover:underline">Curation page</Link><Link href="/admin/setup" className="text-blue-700 hover:underline">All heroes</Link></div>} />
      <Card className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {h.icon && <img src={h.icon} alt="" className="h-14 w-14 rounded bg-neutral-800" />}
        <div>
          <p className="text-sm text-neutral-600">Hero #{hero.id} · configure each mode below</p>
          <nav className="flex flex-wrap gap-x-3 text-sm">
            {HERO_MODES.map(([m, l]) => <a key={m} href={`#${m}`} className="text-blue-700 hover:underline">{l}</a>)}
          </nav>
        </div>
      </Card>

      {upcoming.length > 0 && (
        <Card title="Upcoming generated days" className="border-blue-200 bg-blue-50 text-sm">
          <p className="mb-2">Generated days with {hero.name} as the answer keep the setup they were built with. Rebuild an upcoming day to apply your edits.</p>
          <ul className="space-y-1">
            {upcoming.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3">
                <span className="font-mono">{p.date}</span>
                <span>{lockBySlug.get(p.mode)?.name ?? p.mode}</span>
                {p.date > today
                  ? <ActionButton action={rebuildDay.bind(null, heroId, p.date, p.mode, p.answerId)} label="Rebuild with current setup" />
                  : <span className="text-xs text-neutral-500">live today: not rebuilt</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Section heroId={heroId} mode="classic" label={label.classic} status={status.classic}>
        <p className="mb-2 text-sm text-neutral-600">
          Values for this hero. Rename, reorder or add categories (e.g. Role, Height) under <Link href="/admin/categories" className="text-blue-700 hover:underline">Categories</Link>;
          a custom one joins the puzzle once every hero has a value.
        </p>
        <AttributesForm
          heroId={heroId}
          aliases={hero.aliases.join(", ")}
          fields={data.heroColumns.map((c) => {
            const v = c.get(h, data);
            return { key: c.key, label: c.label, type: c.type, unit: c.unit, disabled: !!c.disabled, value: v === null ? "" : String(v), source: cellSource("hero", c as never, h, v) };
          })}
          action={saveAttributes.bind(null, heroId)}
        />
      </Section>

      <Section heroId={heroId} mode="splash" label={label.splash} status={status.splash}>
        <div className="flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {h.splash && <img src={h.splash} alt="" className="h-48 w-auto rounded bg-neutral-800 object-contain" />}
          <div className="min-w-72 flex-1 space-y-2 text-sm">
            <p className="text-neutral-600">{setup.splash ? "Using a custom portrait." : "Using the API hero card."} Puzzles zoom into a random spot and pull back with each wrong guess.</p>
            <SplashForm current={setup.splash ?? ""} action={saveSplash.bind(null, heroId)} />
          </div>
        </div>
      </Section>

      <Section heroId={heroId} mode="ability-icon" label={label["ability-icon"]} status={status["ability-icon"]}>
        <p className="mb-2 text-sm text-neutral-600">Each puzzle scrambles the icon of one of the switched-on abilities.</p>
        <ul className="flex flex-wrap gap-4">
          {abilityMode("ability-icon").map(({ a, on, id }) => (
            <li key={id} className="flex items-center gap-2 rounded border border-neutral-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {data.ability(id)?.icon ? <img src={data.ability(id)!.icon!} alt="" className="h-10 w-10 rounded bg-neutral-800 object-contain p-1" /> : <span className="text-xs text-neutral-500">no icon</span>}
              <div>
                <div className="text-sm font-medium">{a.name}</div>
                <ModeSwitch on={on} label="Use" action={setAbilityMode.bind(null, heroId, id, "ability-icon")} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section heroId={heroId} mode="lore" label={label.lore} status={status.lore}>
        <p className="mb-2 text-sm text-neutral-600">Revealed in up to 6 parts along sentence breaks. Keep the hero&apos;s name and giveaway terms out (use ▇▇▇).</p>
        <TextForm heroId={heroId} type="hero_lore" entityId={heroId} text={textOf("hero_lore", heroId)} source={sourceOf("hero_lore", heroId)} rows={8} />
      </Section>

      <Section heroId={heroId} mode="ability-desc" label={label["ability-desc"]} status={status["ability-desc"]}>
        <ul className="space-y-4">
          {abilityMode("ability-desc").map(({ a, on, id }) => (
            <li key={id} className="border-t border-neutral-200 pt-2">
              <div className="mb-1 flex items-center gap-3">
                <strong className="text-sm">{a.name}</strong><span className="text-xs text-neutral-500">{slotName(a.slot)}</span>
                <ModeSwitch on={on} label="Use" action={setAbilityMode.bind(null, heroId, id, "ability-desc")} />
              </div>
              <TextForm heroId={heroId} type="ability_desc" entityId={id} text={textOf("ability_desc", id)} source={sourceOf("ability_desc", id)} />
            </li>
          ))}
        </ul>
      </Section>

      <Section heroId={heroId} mode="whose-build" label={label["whose-build"]} status={status["whose-build"]}>
        <p className="mb-2 text-sm text-neutral-600">
          Normally the 8 items high-rank players buy far more often on {hero.name} than on other heroes, from recent match data.
        </p>
        <BuildItems pin={setup.buildPin ?? []} ban={setup.buildBan ?? []} max={BUILD_MAX}
          options={items.map((i) => ({ cls: i.className, name: i.name }))} save={saveBuildItems.bind(null, heroId)} />
      </Section>

      <Section heroId={heroId} mode="upgrades" label={label.upgrades} status={status.upgrades}>
        <p className="mb-2 text-sm text-neutral-600">An ability needs all 3 upgrade texts to be an answer. Shown T3 first. An empty text goes back to the automatic redaction of the API text.</p>
        <ul className="space-y-4">
          {abilityMode("upgrades").map(({ a, on, id }) => (
            <li key={id} className="border-t border-neutral-200 pt-2">
              <div className="mb-1 flex items-center gap-3">
                <strong className="text-sm">{a.name}</strong><span className="text-xs text-neutral-500">{slotName(a.slot)}</span>
                <ModeSwitch on={on} label="Use" action={setAbilityMode.bind(null, heroId, id, "upgrades")} />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {TIER_TYPES.map((t, i) => (
                  <div key={t}>
                    <div className="text-xs text-neutral-500">Tier {i + 1}</div>
                    <TextForm heroId={heroId} type={t} entityId={id} text={textOf(t, id)} source={sourceOf(t, id)} rows={2} compact />
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section heroId={heroId} mode="emoji" label={label.emoji} status={status.emoji}>
        <EmojiList initial={hero.emojis} min={EMOJI_SET_SIZE} max={EMOJI_MAX} puzzle={EMOJI_PUZZLE_SIZE} save={saveEmojiList.bind(null, heroId)} />
      </Section>

      <Section heroId={heroId} mode="quote" label={label.quote} status={status.quote}>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
          <ModeSwitch on={hero.genericVoice} label="Generic voice (keeps the hero out of The Echo)" action={setEchoVoice.bind(null, heroId)} />
          <span className="text-neutral-600">{liveLines.length} lines in use. Each puzzle shows 5; a starred line is saved for last.</span>
        </div>
        <form action={addVoiceLine.bind(null, heroId)} className="mb-3 flex flex-wrap items-center gap-2">
          <input name="text" placeholder="Add a line (the hero's name is redacted automatically)" className={`${input} min-w-0 flex-1 text-sm`} />
          <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" name="starred" /> Iconic</label>
          <button className={saveBtn}>Add line</button>
        </form>
        <ul className="divide-y divide-neutral-200">
          {liveLines.map((l) => (
            <li key={l.id} className="py-1.5">
              <form action={editVoiceLine.bind(null, heroId, l.id)} className="flex flex-wrap items-center gap-2">
                <input name="text" defaultValue={l.text ?? l.autoText} className={`${input} min-w-0 flex-1 text-sm`} />
                <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" name="starred" defaultChecked={l.starred} /> Iconic</label>
                <span className="w-20 text-xs text-neutral-500">{l.fileName.startsWith(CUSTOM_LINE_PREFIX) ? "custom" : l.status === "approved" ? "wiki" : l.status.replace("_", " ")}</span>
                <button className="rounded border border-neutral-400 px-2 py-0.5 text-xs">Save</button>
                <ActionButton action={removeVoiceLine.bind(null, heroId, l.id)} label="Remove" />
              </form>
            </li>
          ))}
        </ul>
        {excludedLines.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-neutral-600">Removed or filtered lines ({excludedLines.length})</summary>
            <ul className="mt-1 divide-y divide-neutral-200">
              {excludedLines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-1">
                  <span className="flex-1 text-neutral-600">{l.text ?? l.autoText}</span>
                  {l.autoReason && <span className="text-xs text-neutral-500">{l.autoReason}</span>}
                  <ActionButton action={restoreVoiceLine.bind(null, heroId, l.id)} label="Restore" />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>
    </div>
  );
}
