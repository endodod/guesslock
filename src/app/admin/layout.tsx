import Link from "next/link";
import "../globals.css";
import { isAdmin } from "@/lib/admin/auth";
import { config } from "@/lib/config";
import { logout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "GUESSLOCK admin", robots: { index: false, follow: false } };

// Plain, unthemed admin UI (own root layout: no vault chrome).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAdmin();
  return (
    <html lang="en" className="bg-neutral-100">
      <body className="min-h-dvh bg-neutral-100 font-sans text-[15px] text-neutral-900" style={{ fontFamily: "system-ui, sans-serif" }}>
        {authed && (
          <nav className="flex flex-wrap items-center gap-4 border-b border-neutral-300 bg-white px-4 py-2">
            <strong>GUESSLOCK admin</strong>
            {[
              ["/admin", "Status"],
              ["/admin/review", "Review queue"],
              ["/admin/heroes", "Heroes"],
              ["/admin/texts", "Texts"],
              ["/admin/items", "Items"],
              ["/admin/categories", "Categories"],
              ["/admin/calendar", "Calendar"],
              ["/admin/omens", "Omens"],
              ...(config.adminSetup ? [["/admin/setup", "Puzzle setup"]] : []),
            ].map(([href, label]) => (
              <Link key={href} href={href} className="text-blue-700 hover:underline">{label}</Link>
            ))}
            <span className="flex-1" />
            <Link href="/" className="text-neutral-600 hover:underline">Open site</Link>
            <form action={logout}><button className="text-neutral-600 hover:underline">Log out</button></form>
          </nav>
        )}
        <main className="mx-auto max-w-7xl p-4">{children}</main>
      </body>
    </html>
  );
}
