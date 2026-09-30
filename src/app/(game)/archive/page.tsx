import { ArchiveCalendar } from "@/components/ArchiveCalendar";
import { config } from "@/lib/config";
import { todayDate } from "@/lib/day";
import { playedDates } from "@/lib/server/puzzles";
import { addDays } from "@/lib/time";
import { t } from "@/lib/i18n/en";

export const metadata = { title: "The Archive" };

export default async function ArchivePage() {
  const yesterday = addDays(todayDate(), -1);
  const from = config.launchDate < yesterday ? config.launchDate : addDays(yesterday, -365);
  const dates = await playedDates(from, yesterday);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display mb-1 text-3xl text-brass">{t.archive.title}</h1>
      <p className="mb-6 text-ash">{t.archive.pick} Replays don&apos;t count toward your Ledger.</p>
      {dates.length ? <ArchiveCalendar dates={dates} /> : <p className="text-ash">{t.archive.none}</p>}
    </div>
  );
}
