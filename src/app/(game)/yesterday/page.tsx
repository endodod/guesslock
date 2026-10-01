import Link from "next/link";
import { DecoFrame } from "@/components/ui";
import { answerImageClass } from "@/lib/images";
import { AnswerMosaic } from "@/components/AnswerMosaic";
import { todayDate } from "@/lib/day";
import { answersFor } from "@/lib/server/puzzles";
import { addDays } from "@/lib/time";

export const metadata = { title: "Yesterday's answers" };

export default async function YesterdayPage() {
  const date = addDays(todayDate(), -1);
  const answers = await answersFor(date);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display mb-1 text-3xl text-brass">Yesterday&apos;s answers</h1>
      <p className="mb-6 text-ash">
        {date}. <Link href={`/archive/${date}`} className="text-brass underline-offset-4 hover:underline">Replay that day</Link>
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {answers.map(({ lock, answer }) => (
          <li key={lock.slug}>
            <DecoFrame className="flex items-center gap-3 p-3" corners={false}>
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-velvet">
                {answer?.images?.length ? (
                  <AnswerMosaic images={answer.images} />
                ) : answer?.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={answer.image} alt="" loading="lazy" className={answerImageClass(lock.guess)} />
                )}
              </div>
              <div className="min-w-0">
                <p className="smallcaps text-xs text-brass">{lock.numeral} · {lock.name}{lock.table ? ` · ${lock.table.label}` : ""}</p>
                <p className={lock.box ? "text-sm leading-snug" : "truncate text-lg"}>{answer ? answer.name : <span className="text-ash">Nothing in this box.</span>}</p>
                {answer?.sub && <p className="truncate text-xs text-ash">{answer.sub}</p>}
              </div>
            </DecoFrame>
          </li>
        ))}
      </ul>
    </div>
  );
}
