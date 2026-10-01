"use client";
// Error boundary for every game page: the header and footer stay, the page shows this instead.
import Link from "next/link";
import { useEffect } from "react";
import { DecoFrame, Icon } from "@/components/ui";

export default function GameError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <DecoFrame className="p-8 text-center">
        <Icon name="seal" className="mx-auto mb-3 h-12 w-12 text-[#b0433f]" />
        <h1 className="font-display text-3xl text-paper">The lock jammed</h1>
        <p className="mt-2 text-ash">Something went wrong on our side. Your progress is safe; try again in a moment.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-ash/70">Reference {error.digest}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className="inline-flex min-h-11 items-center rounded-[3px] border border-ecto/60 bg-ecto/10 px-5 text-ecto hover:bg-ecto/20">Try again</button>
          <Link href="/" className="inline-flex min-h-11 items-center px-4 text-brass hover:underline">Back to the Vault</Link>
        </div>
      </DecoFrame>
    </div>
  );
}
