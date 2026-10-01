import Link from "next/link";
import { DecoFrame, Keyhole } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <DecoFrame className="p-8 text-center">
        <Keyhole className="mx-auto mb-4 h-14 w-10 text-brass/70" />
        <h1 className="font-display text-3xl text-paper">No such lock</h1>
        <p className="mt-2 text-ash">This door doesn&apos;t exist, or not on that day. The key fits somewhere else.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-[3px] border border-ecto/60 bg-ecto/10 px-5 text-ecto hover:bg-ecto/20">Back to the Vault</Link>
          <Link href="/archive" className="inline-flex min-h-11 items-center px-4 text-brass hover:underline">The Archive</Link>
        </div>
      </DecoFrame>
    </div>
  );
}
