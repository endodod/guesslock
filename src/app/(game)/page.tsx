import { Vault } from "@/components/Vault";
import { config } from "@/lib/config";
import { numberFor, todayDate } from "@/lib/day";
import { dayMeta } from "@/lib/server/puzzles";
import { healToday } from "@/lib/server/heal";
import { nextResetAt } from "@/lib/time";

export default async function VaultPage() {
  const now = new Date();
  const date = todayDate(now);
  const meta = await dayMeta(date);
  healToday(date, meta);
  return (
    <>
      <h1 className="sr-only">The Vault — today&apos;s locks</h1>
      <Vault date={date} number={numberFor(date)} meta={meta} isArchive={false} nextReset={nextResetAt(now, config.timezone).getTime()} site={config.siteUrl} />
    </>
  );
}
