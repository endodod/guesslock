import { LOCKS } from "@/locks.config";
import { RULES } from "@/lib/i18n/rules";
import { t } from "@/lib/i18n/en";
import { ReplayOnboarding } from "@/components/ReplayOnboarding";

export const metadata = { title: "The Rules" };

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display mb-4 text-3xl text-brass">{t.nav.rules}</h1>
      <div className="space-y-3 text-paper/90">
        <p>Every day at midnight (Zurich time) there are 16 new puzzles. Everyone gets the same ones. In 13 of them you guess an answer and get a better clue after each wrong guess. The 3 Omens are different: they show a frozen moment from a real high-rank match, and you predict what happens next. You answer once, lock in, then watch the match play out.</p>
        <p>Most puzzles have unlimited guesses. The Measure is the exception: 5 tries. Each wrong guess snaps a lockpick; some picks hold a hint, which unlocks when that pick snaps. Stuck? After your first guess you can give up to reveal the answer; the lock jams and scores 0 souls.</p>
        <p><strong>Souls:</strong> a solve is worth 100 souls, minus 10 for each extra guess and 15 for each hint you unlocked, with a minimum of 10. A failed Measure or a lock you gave up on is worth 0. Bonus rounds add 25.</p>
        <p><strong>Streaks:</strong> a day counts toward your streak if you solve at least one puzzle. Replaying past days from the Archive doesn&apos;t count.</p>
        <p>Your progress is stored in this browser only.</p>
        <ReplayOnboarding />
      </div>
      <ol className="mt-8 space-y-5">
        {LOCKS.map((l) => (
          <li key={l.slug} className="border-l-2 border-brass/40 pl-4">
            <h2 className="text-lg">
              <span className="font-display mr-2 text-brass">{l.numeral}</span>
              <span className="font-display">{l.name}</span> <span className="text-ash">— {l.subtitle}</span>
            </h2>
            <p className="mt-1 text-paper/85">{RULES[l.slug]}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
