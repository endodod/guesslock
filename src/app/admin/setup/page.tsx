import Link from "next/link";
import { requireSetupPage } from "@/lib/admin/auth";
import { loadGameData } from "@/lib/engine/context";
import { HERO_MODES, heroStatuses } from "./status";

export const dynamic = "force-dynamic";

// Puzzle setup overview (ADMIN_SETUP_MODE): every hero against every hero mode.
export default async function SetupOverview() {
  await requireSetupPage();
  const data = await loadGameData();
  const status = heroStatuses(data);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Puzzle setup</h1>
      <p className="mb-4 text-sm text-neutral-600">
        What each hero brings to each puzzle. Open a hero to turn modes on or off and to edit, add or remove its clues.
        Changes apply to puzzles generated from now on; already generated days can be rebuilt from the hero page.
      </p>
      <div className="overflow-x-auto rounded border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-neutral-500">
              <th className="px-3 py-2">Hero</th>
              {HERO_MODES.map(([m, label]) => <th key={m} className="px-2 py-2">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.heroes.map((h) => (
              <tr key={h.id} className="border-t border-neutral-200">
                <td className="px-3 py-1.5">
                  <Link href={`/admin/setup/${h.id}`} className="inline-flex items-center gap-2 text-blue-700 hover:underline">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {h.icon && <img src={h.icon} alt="" className="h-6 w-6 rounded bg-neutral-800" />}
                    {h.name}
                  </Link>
                </td>
                {HERO_MODES.map(([m]) => {
                  const s = status.get(h.id)![m];
                  return (
                    <td key={m} className="px-2 py-1.5">
                      <Link href={`/admin/setup/${h.id}#${m}`} title={s.note}
                        className={`inline-block rounded px-1.5 py-0.5 text-xs ${!s.on ? "bg-neutral-200 text-neutral-500" : s.inPool ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                        {!s.on ? "off" : s.inPool ? "✓" : "missing"}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
