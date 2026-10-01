import { ENDLESS_LOCKS } from "@/lib/endless";
import { EndlessList } from "@/components/EndlessList";

export const metadata = { title: "Endless — practice any lock" };

export default function EndlessPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-10">
      <h1 className="font-display text-3xl text-paper">Endless</h1>
      <p className="mt-1 max-w-2xl text-ash">
        Practise any lock as often as you like: a new puzzle every time. Endless puzzles never count for your soul tally, streak or the leaderboards.
      </p>
      <EndlessList locks={ENDLESS_LOCKS.map(({ slug, numeral, name, subtitle }) => ({ slug, numeral, name, subtitle }))} />
    </div>
  );
}
