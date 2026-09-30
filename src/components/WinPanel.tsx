"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { animate, motion } from "motion/react";
import type { BonusView, PlayView } from "@/lib/engine/types";
import type { LockDef } from "@/locks.config";
import { DecoFrame, Icon, Button } from "./ui";
import { answerImageClass } from "@/lib/images";
import { t } from "@/lib/i18n/en";
import { useGame } from "./GameProvider";

export function ShareButton({ text, label = t.lock.share, variant = "brass" }: { text: string; label?: string; variant?: "brass" | "ghost" }) {
  const { toast } = useGame();
  const share = async () => {
    try {
      if (navigator.share && window.matchMedia("(max-width: 767px)").matches) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast(t.lock.copied);
      }
    } catch {
      /* user cancelled */
    }
  };
  return (
    <Button onClick={share} variant={variant}>
      <Icon name="share" className="h-4 w-4" /> {label}
    </Button>
  );
}

function CountUp({ to }: { to: number }) {
  const { reducedMotion } = useGame();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reducedMotion) return;
    const c = animate(0, to, { duration: 1.1, ease: "easeOut", onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [to, reducedMotion]);
  return <span className="font-mono tabular-nums">{reducedMotion ? to : v}</span>;
}

export function Distribution({ dist, highlight, maxRows = 6 }: { dist: Record<string, number>; highlight?: string; maxRows?: number }) {
  // Show rows 1..maxRows, extended to the highest guess count actually recorded; X only when used.
  const all = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
  const used = Math.max(maxRows, ...all.map((k, i) => (dist[k] || k === highlight ? i + 1 : 0)));
  const keys = [...all.slice(0, used), ...(dist.X || highlight === "X" ? ["X"] : [])];
  const max = Math.max(1, ...Object.values(dist));
  return (
    <ul className="space-y-1 font-mono text-xs">
      {keys.map((k) => (
        <li key={k} className="flex items-center gap-2">
          <span className="w-6 text-right text-ash">{k}</span>
          <span
            className={`flex h-5 min-w-5 items-center justify-end rounded-sm px-1.5 ${k === highlight ? "bg-ecto text-ink" : "bg-brass/25 text-paper"}`}
            style={{ width: `${Math.max(6, ((dist[k] ?? 0) / max) * 100)}%` }}
          >
            {dist[k] ?? 0}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BonusCard({ bonus, onPick }: { bonus: BonusView; onPick: (id: string) => void }) {
  return (
    <div className="rounded-sm border border-cursed/60 bg-cursed/10 p-4">
      <p className="smallcaps mb-3 text-sm text-cursed">{t.lock.bonusTitle}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {bonus.options.map((o) => {
          const state = !bonus.picked ? "" : o.id === bonus.answerId ? "border-ecto bg-ecto/15" : o.id === bonus.picked ? "border-[#c86a6a] bg-velvet" : "opacity-50";
          return (
            <button
              key={o.id}
              type="button"
              disabled={!!bonus.picked}
              onClick={() => onPick(o.id)}
              className={`min-h-11 rounded-sm border border-cursed/40 px-3 py-2 text-left transition-colors hover:border-cursed ${state}`}
            >
              {o.name}
            </button>
          );
        })}
      </div>
      {bonus.picked && <p className="mt-3 text-sm">{bonus.correct ? t.lock.bonusRight : t.lock.bonusWrong}</p>}
    </div>
  );
}

export function WinPanel({
  lock, view, souls, shareText, shareGridText, dist, nextHref, onBonus,
}: {
  lock: LockDef; view: PlayView; souls: number; shareText: string; shareGridText?: string;
  dist: Record<string, number>; nextHref: string; onBonus: (id: string) => void;
}) {
  const won = view.status === "won";
  const a = view.answer!;
  const n = view.rows.length;
  return (
    <DecoFrame as="section" className="p-5 md:p-6" aria-live="polite">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        {/* Door swing reveal */}
        <div className="[perspective:900px]">
          <div className="relative h-32 w-28 overflow-hidden rounded-sm bg-velvet shadow-[inset_0_0_25px_rgba(0,0,0,0.8)]">
            {a.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.image} alt={a.name} className={`${answerImageClass(lock.guess)} ${won ? "" : "grayscale"}`} />
            )}
            <div className={`pointer-events-none absolute inset-0 ${won ? "shadow-[inset_0_0_30px_rgba(127,227,194,0.45)]" : ""}`} />
            <motion.div
              className="absolute inset-0 origin-left border border-brass/60 bg-[linear-gradient(145deg,#3a3129,#1a1816)]"
              initial={{ rotateY: 0 }}
              animate={{ rotateY: -105, opacity: 0.0 }}
              transition={{ duration: 0.45, ease: "easeInOut", opacity: { delay: 0.4, duration: 0.1 } }}
            />
          </div>
        </div>
        <div className="flex-1">
          <p className={`font-display text-2xl ${won ? "text-ecto" : "text-[#d08a8a]"}`}>{won ? t.lock.correct : t.lock.jammed}</p>
          <h2 className="font-display text-3xl text-paper">{a.name}</h2>
          {a.sub && <p className="text-ash">{a.sub}</p>}
          <p className="mt-1 text-paper/90">
            {won ? t.lock.openedIn(n) : view.gaveUp ? t.lock.gaveUp : ""}{" "}
            <span className="text-brass"><CountUp to={souls} /> {t.lock.souls}</span>
          </p>
        </div>
      </div>

      {a.extra?.hero && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {a.extra.hero.image && <img src={a.extra.hero.image} alt="" className="h-10 w-8 rounded-sm object-cover object-top" />}
          Ability of <span className="text-paper">{a.extra.hero.name}</span>
        </p>
      )}
      {a.extra?.exactValue && (
        <p className="mt-4 text-sm text-ash">{t.lock.exactValue}: <span className="font-mono text-lg text-ecto">{a.extra.exactValue}</span></p>
      )}
      {a.extra?.alsoValid && (
        <div className="mt-4">
          <p className="text-sm text-ash">{t.lock.alsoValid}:</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {a.extra.alsoValid.map((x) => (
              <li key={x.name} className="flex items-center gap-2 rounded-sm bg-ink/60 px-2 py-1 text-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {x.image && <img src={x.image} alt="" className="h-6 w-6 object-contain" />}
                {x.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {view.bonus && (
        <div className="mt-5">
          <BonusCard bonus={view.bonus} onPick={onBonus} />
        </div>
      )}
      {/* The Resonance: the ability behind the sounds, once the bonus is answered (or the lock jammed). */}
      {(() => {
        const ability = view.bonus?.reveal ?? a.extra?.ability;
        return ability ? (
          <p className="mt-4 flex items-center gap-3 text-sm text-ash">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ability.image && <img src={ability.image} alt="" className="h-10 w-10 rounded-sm bg-ink object-contain p-1" />}
            The sounds were <span className="text-paper">{ability.name}</span>
          </p>
        ) : null;
      })()}

      <div className="mt-5">
        <p className="mb-2 text-sm text-ash">{t.lock.distribution}</p>
        <Distribution dist={dist} highlight={won ? (n >= 10 ? "10+" : String(n)) : "X"} maxRows={lock.maxTries ?? 6} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <ShareButton text={shareText} />
        {shareGridText && <ShareButton text={shareGridText} label={t.lock.shareGrid} variant="ghost" />}
        <Link href={nextHref} className="inline-flex min-h-11 items-center gap-2 rounded-[3px] border border-ecto/60 bg-ecto/10 px-4 py-2 text-ecto hover:bg-ecto/20">
          {t.lock.nextLock} <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center px-4 py-2 text-ash hover:text-paper">
          {t.nav.back}
        </Link>
      </div>
      <p className="sr-only">{lock.name} complete.</p>
    </DecoFrame>
  );
}
