import Link from "next/link";
import { notFound } from "next/navigation";
import { getLock } from "@/locks.config";
import { isEndlessLock } from "@/lib/endless";
import { getCatalog } from "@/lib/engine/catalog";
import { config } from "@/lib/config";
import { RULES } from "@/lib/i18n/rules";
import { EndlessLock } from "@/components/EndlessLock";
import { Icon } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const lock = getLock((await params).slug);
  return lock ? { title: `${lock.name} — Endless` } : {};
}

export default async function EndlessLockPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ n?: string }> }) {
  const { slug } = await params;
  const { n } = await searchParams;
  const lock = getLock(slug);
  if (!lock || !isEndlessLock(slug)) notFound();
  const catalog = await getCatalog();
  const entries = lock.input || !(lock.guess === "hero" || lock.guess === "ability" || lock.guess === "item" || lock.guess === "grid") ? [] : catalog[lock.guess === "grid" ? "hero" : lock.guess];
  return (
    <div className={`mx-auto px-4 py-5 md:py-8 ${lock.mode === "classic" || lock.mode === "item-classic" ? "max-w-5xl" : "max-w-[760px]"}`}>
      <div className="mb-5 flex items-center gap-3">
        <Link href="/endless" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-brass/30 text-brass hover:border-brass" aria-label="All endless locks">
          <Icon name="back" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="smallcaps text-xs text-cursed">Endless · practice</p>
          <h1 className="font-display text-2xl leading-tight text-paper md:text-3xl">{lock.name}</h1>
          <p className="text-sm text-ash">{lock.subtitle}</p>
        </div>
      </div>
      {/* `n` changes with every "Next puzzle", so a new puzzle starts from a fresh component. */}
      <EndlessLock key={n ?? "first"} slug={slug} entries={entries} site={config.siteUrl} rules={RULES[slug] ?? ""} />
    </div>
  );
}
