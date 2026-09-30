"use client";
import { LOCKS, type LockDef } from "@/locks.config";
import type { StoreData } from "@/lib/client/store";
import { dayStreaks, daySouls, ignoredSlugs, lockStats } from "@/lib/client/store";
import { t } from "@/lib/i18n/en";
import { useGame } from "./GameProvider";
import { DecoFrame, Icon } from "./ui";
import { Distribution } from "./WinPanel";

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-brass/25 bg-iron/70 p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 font-mono text-2xl text-paper">{icon}{value}</div>
      <div className="text-xs text-ash">{label}</div>
    </div>
  );
}

/** Omen stats: locks played (live, not archive), average and best score. */
function omenStats(progress: StoreData["progress"], slug: string) {
  const scores = Object.values(progress).map((d) => d[slug]).filter((r) => r && !r.archive && r.o !== undefined).map((r) => r!.souls);
  return { played: scores.length, avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0, best: scores.length ? Math.max(...scores) : 0 };
}

function OmenCard({ l, progress }: { l: LockDef; progress: StoreData["progress"] }) {
  const s = omenStats(progress, l.slug);
  return (
    <DecoFrame className="p-4" corners={false}>
      <h3 className="mb-3 font-display text-lg"><span className="mr-2 text-sm text-cursed">{l.numeral}</span>{l.name}</h3>
      <div className="grid grid-cols-3 gap-2 text-center font-mono text-sm">
        <div><div className="text-paper">{s.played}</div><div className="font-body text-xs text-ash">{t.ledger.played}</div></div>
        <div><div className="text-paper">{s.played ? s.avg : "–"}</div><div className="font-body text-xs text-ash">Avg. souls</div></div>
        <div><div className="text-paper">{s.played ? s.best : "–"}</div><div className="font-body text-xs text-ash">Best</div></div>
      </div>
    </DecoFrame>
  );
}

export function Ledger() {
  const { store, today, hydrated } = useGame();
  if (!hydrated) return null;
  const p = store.progress;
  const st = dayStreaks(p, today, ignoredSlugs(store.settings));
  const total = Object.values(p).reduce((a, d) => a + daySouls(d), 0);
  const days = Object.keys(p).sort();

  // Heatmap: last 26 weeks, one column per week (Monday first)
  const end = new Date(today + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7 * 25 - ((end.getUTCDay() + 6) % 7));
  const cells: { d: string; s: number }[] = [];
  for (const c = new Date(start); c <= end; c.setUTCDate(c.getUTCDate() + 1)) {
    const d = c.toISOString().slice(0, 10);
    cells.push({ d, s: daySouls(p[d]) });
  }
  const max = Math.max(1, ...cells.map((c) => c.s));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t.ledger.daysUnlocked} value={st.days} />
        <Stat label={t.ledger.currentStreak} value={st.current} icon={<Icon name="flame" className="h-5 w-5 text-cursed" />} />
        <Stat label={t.ledger.bestStreak} value={st.best} />
        <Stat label={t.ledger.totalSouls} value={total} />
      </div>

      <section>
        <h2 className="smallcaps mb-3 text-brass">{t.ledger.heatmap}</h2>
        <div className="no-scrollbar overflow-x-auto">
          <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="img" aria-label="Souls per day over the last 26 weeks">
            {cells.map((c) => (
              <span
                key={c.d}
                title={`${c.d}: ${c.s} souls`}
                className="h-3 w-3 rounded-[2px]"
                style={{ background: c.s ? `rgb(127 227 194 / ${0.15 + 0.85 * (c.s / max)})` : "rgb(138 129 117 / 0.12)" }}
              />
            ))}
          </div>
        </div>
      </section>


      {days.length === 0 ? (
        <p className="text-ash">{t.ledger.none}</p>
      ) : (
        <section>
          <h2 className="sr-only">Per lock</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {LOCKS.map((l) => {
              if (l.group === "omens") return <li key={l.slug}><OmenCard l={l} progress={p} /></li>;
              const s = lockStats(p, l.slug, today);
              return (
                <li key={l.slug}>
                  <DecoFrame className="p-4" corners={false}>
                    <div className="mb-3 flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-lg"><span className="mr-2 text-sm text-brass">{l.numeral}</span>{l.name}</h3>
                      <span className="flex items-center gap-1 font-mono text-sm text-paper"><Icon name="flame" className="h-4 w-4 text-cursed" />{s.streak}</span>
                    </div>
                    <div className="mb-3 grid grid-cols-3 gap-2 text-center font-mono text-sm">
                      <div><div className="text-paper">{s.played}</div><div className="font-body text-xs text-ash">{t.ledger.played}</div></div>
                      <div><div className="text-paper">{s.winRate}%</div><div className="font-body text-xs text-ash">{t.ledger.winRate}</div></div>
                      <div><div className="text-paper">{s.avgGuesses || "–"}</div><div className="font-body text-xs text-ash">{t.ledger.avgGuesses}</div></div>
                    </div>
                    {s.played > 0 && <Distribution dist={s.dist} maxRows={l.maxTries ?? 6} />}
                  </DecoFrame>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
