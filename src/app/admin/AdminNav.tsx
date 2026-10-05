"use client";
// Admin sidebar: grouped navigation with the active page highlighted; a slide-in drawer on small screens.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "./actions";

export type NavLock = { slug: string; numeral: string; name: string; group: string; label?: string };

const GROUPS: { id: string; title: string }[] = [
  { id: "spirits", title: "The Spirits" },
  { id: "shop", title: "Curiosity Shop" },
  { id: "omens", title: "The Omens" },
  { id: "seance", title: "The Séance" },
  { id: "stars", title: "More locks" },
  { id: "words", title: "The Words" },
];

const OVERVIEW = [["/admin", "Status"], ["/admin/review", "Review queue"], ["/admin/feedback", "Feedback"], ["/admin/calendar", "Calendar"], ["/admin/coverage", "Data coverage"], ["/admin/debug", "Debug preview"]] as const;

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-3 py-4 text-white no-underline">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#b8913f]/60 bg-[#b8913f]/15">
        <svg viewBox="0 0 24 32" className="h-4 w-3 text-[#d9b866]" aria-hidden>
          <circle cx="12" cy="11" r="7" fill="currentColor" />
          <path d="M8.5 15 6 30h12l-2.500-15z" fill="currentColor" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="block text-[0.95rem] font-semibold tracking-wide">GUESSLOCK</span>
        <span className="block text-[0.68rem] uppercase tracking-[0.14em] text-[#7d849d]">Admin</span>
      </span>
    </Link>
  );
}

const isActive = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));

function Item({ path, href, children }: { path: string; href: string; children: React.ReactNode }) {
  return <Link href={href} className="adm-link" aria-current={isActive(path, href) ? "page" : undefined}>{children}</Link>;
}

export function AdminNav({ locks, setup }: { locks: NavLock[]; setup: boolean }) {
  const path = usePathname();
  // The drawer is open only on the page it was opened on, so navigating closes it.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((typeof v === "function" ? v(open) : v) ? path : null);

  const active = (href: string) => isActive(path, href);
  const library: [string, string][] = [
    ["/admin/heroes", "Heroes"], ["/admin/abilities", "Abilities"], ["/admin/items", "Items"], ["/admin/categories", "Categories"], ["/admin/weapons", "Weapon groups"],
    ["/admin/texts", "Texts"], ["/admin/sounds", "Sounds"], ["/admin/seance", "Séance groups"],
    ...(setup ? [["/admin/setup", "Hero setup"] as [string, string]] : []),
  ];
  const onPuzzles = path.startsWith("/admin/puzzles");

  const panel = (
    <div className="adm-side flex h-full w-72 flex-col overflow-y-auto pb-4">
      <Brand />
      <nav className="flex-1 px-2" aria-label="Admin">
        <p className="adm-group" style={{ marginTop: 0 }}>Overview</p>
        {OVERVIEW.map(([href, label]) => <Item key={href} path={path} href={href}>{label}</Item>)}

        <p className="adm-group">Puzzles</p>
        <Item path={path} href="/admin/puzzles">All puzzles</Item>
        {GROUPS.map((g) => {
          const items = locks.filter((l) => l.group === g.id);
          if (!items.length) return null;
          const hasActive = items.some((l) => active(`/admin/puzzles/${l.slug}`));
          return (
            <details key={g.id} open={hasActive || (onPuzzles && g.id === "spirits" && !path.split("/")[3])} className="mt-1">
              <summary className="adm-link justify-between" style={{ color: "#8f96ae" }}>
                <span>{g.title}</span><span className="text-[0.7rem] opacity-70">{items.length}</span>
              </summary>
              <div className="ml-2 border-l border-white/10 pl-1.5">
                {items.map((l) => (
                  <Item key={l.slug} path={path} href={`/admin/puzzles/${l.slug}`}>
                    <span className="adm-chip">{l.numeral}</span>
                    <span className="truncate">{l.name.replace(/^The /, "")}{l.label ? ` · ${l.label}` : ""}</span>
                  </Item>
                ))}
              </div>
            </details>
          );
        })}

        <p className="adm-group">Library</p>
        {library.map(([href, label]) => <Item key={href} path={path} href={href}>{label}</Item>)}
      </nav>
      <div className="mt-4 space-y-0.5 border-t border-white/10 px-2 pt-3">
        <Link href="/" className="adm-link" target="_blank">Open site ↗</Link>
        <form action={logout}><button className="adm-link w-full text-left">Log out</button></form>
      </div>
    </div>
  );

  return (
    <>
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">{panel}</aside>
      {/* mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#11141f] px-2 lg:hidden">
        <Brand />
        <button type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mr-1 flex h-10 w-10 items-center justify-center text-white">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 shadow-2xl">{panel}</div>
        </div>
      )}
    </>
  );
}
