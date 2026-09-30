import Link from "next/link";
import "../globals.css";
import { isAdmin } from "@/lib/admin/auth";
import { config } from "@/lib/config";
import { LOCKS } from "@/locks.config";
import { logout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "GUESSLOCK admin", robots: { index: false, follow: false } };

// Plain, unthemed admin UI (own root layout: no vault chrome).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAdmin();
  return (
    <html lang="en" className="bg-neutral-100">
      <body suppressHydrationWarning className="min-h-dvh bg-neutral-100 font-sans text-[15px] text-neutral-900" style={{ fontFamily: "system-ui, sans-serif" }}>
        {authed && (
          <nav className="border-b border-neutral-300 bg-white px-4 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-4">
              <strong className="text-[15px]">GUESSLOCK admin</strong>
              {[["/admin", "Status"], ["/admin/calendar", "Calendar"], ["/admin/review", "Review queue"]].map(([href, label]) => (
                <Link key={href} href={href} className="text-blue-700 hover:underline">{label}</Link>
              ))}
              <span className="flex-1" />
              <Link href="/" className="text-neutral-600 hover:underline">Open site</Link>
              <form action={logout}><button className="text-neutral-600 hover:underline">Log out</button></form>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href="/admin/puzzles" className="w-20 font-medium text-neutral-700 hover:underline">Puzzles</Link>
              {LOCKS.map((l) => (
                <Link key={l.slug} href={`/admin/puzzles/${l.slug}`} title={`${l.name}: ${l.subtitle}`} className="text-blue-700 hover:underline">
                  {l.numeral} {l.name.replace(/^The /, "")}
                </Link>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-20 font-medium text-neutral-700">Site-wide</span>
              {[
                ["/admin/heroes", "Heroes"],
                ["/admin/abilities", "Abilities"],
                ["/admin/items", "Items"],
                ["/admin/categories", "Categories"],
                ["/admin/texts", "Texts"],
                ...(config.adminSetup ? [["/admin/setup", "Hero setup"]] : []),
              ].map(([href, label]) => (
                <Link key={href} href={href} className="text-blue-700 hover:underline">{label}</Link>
              ))}
            </div>
          </nav>
        )}
        <main className="mx-auto max-w-7xl p-4">{children}</main>
      </body>
    </html>
  );
}
