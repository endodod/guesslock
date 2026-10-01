"use client";
import { useEffect } from "react";

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="rounded border border-red-200 bg-red-50 p-6 text-sm text-red-900">
      <h1 className="text-lg font-semibold">This admin page failed</h1>
      <p className="mt-1">{error.message || "Unexpected error."}{error.digest ? ` (reference ${error.digest}, see the server logs)` : ""}</p>
      <button type="button" onClick={() => retry()} className="mt-3 rounded bg-neutral-900 px-3 py-1.5 text-white">Try again</button>
    </div>
  );
}
