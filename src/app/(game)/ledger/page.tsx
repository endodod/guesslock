import { Ledger } from "@/components/Ledger";
import { t } from "@/lib/i18n/en";

export const metadata = { title: "The Ledger" };

export default function LedgerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display mb-1 text-3xl text-brass">{t.ledger.title}</h1>
      <p className="mb-6 text-ash">Your stats on this device. Archive replays don&apos;t count.</p>
      <Ledger />
    </div>
  );
}
