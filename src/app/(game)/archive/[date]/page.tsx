import { notFound, redirect } from "next/navigation";
import { Vault } from "@/components/Vault";
import { config } from "@/lib/config";
import { isDay, numberFor, todayDate } from "@/lib/day";
import { dayMeta, hardMeta } from "@/lib/server/puzzles";

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return { title: `Archive ${date}` };
}

export default async function ArchiveDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isDay(date)) notFound();
  const today = todayDate();
  if (date >= today) redirect("/");
  const [meta, hard] = await Promise.all([dayMeta(date), hardMeta(date)]);
  if (meta.every((m) => m.state === "empty")) notFound();
  return (
    <>
      <h1 className="sr-only">Archive — {date}</h1>
      <Vault date={date} number={numberFor(date)} meta={meta} hardMeta={hard} isArchive nextReset={0} site={config.siteUrl} />
    </>
  );
}
