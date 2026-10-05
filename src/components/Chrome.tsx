"use client";
// Global header/footer, settings modal and onboarding overlay.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHydrated } from "@/lib/client/hooks";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { t } from "@/lib/i18n/en";
import { useGame } from "./GameProvider";
import { backupFile, readBackup } from "@/lib/client/store";
import { Button, Countdown, DecoFrame, Icon, Logo } from "./ui";

export function Header({ dateLabel, nextReset }: { dateLabel: string; nextReset: number }) {
  const { toast, user } = useGame();
  // Five icons and the logo must fit a 320 px phone: the buttons narrow a little below 360 px (they stay 44 px tall).
  const navBtn = "flex h-11 w-[1.875rem] items-center justify-center text-brass hover:text-paper min-[360px]:w-10 sm:w-11";
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 border-b border-brass/20 bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-1 px-2 min-[360px]:gap-2 min-[360px]:px-3 md:h-16 md:px-6">
        <Link href="/" aria-label="GUESSLOCK — The Vault" className="shrink-0 max-[359px]:[&>span]:text-lg">
          <Logo size="sm" />
        </Link>
        <div className="hidden flex-col items-center text-center leading-tight sm:flex">
          <span className="text-xs text-ash">{dateLabel}</span>
          <span className="text-sm text-paper">
            <span className="text-ash">{t.vault.nextIn} </span>
            <Countdown target={nextReset} onZero={() => toast(t.lock.newDay)} />
          </span>
        </div>
        <nav className="flex items-center" aria-label="Main">
          <Link href="/market" className={navBtn} aria-label="The Black Market" title="The Black Market">
            <Icon name="market" />
          </Link>
          <Link href="/hall" className={navBtn} aria-label={t.nav.hall} title={t.nav.hall}>
            <Icon name="crown" />
          </Link>
          <Link href="/ledger" className={navBtn} aria-label={t.nav.ledger} title={t.nav.ledger}>
            <Icon name="ledger" />
          </Link>
          <Link href="/archive" className={navBtn} aria-label={t.nav.archive} title={t.nav.archive}>
            <Icon name="archive" />
          </Link>
          <button type="button" onClick={() => setSettingsOpen(true)} className={navBtn} aria-label={t.nav.settings} title={t.nav.settings}>
            <Icon name="settings" />
          </button>
          {user ? (
            <Link href="/account" className={navBtn} aria-label={`${t.nav.account}: ${user.name}`} title={user.name}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ecto/70 bg-ecto/10 font-display text-sm text-ecto">
                {user.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
            </Link>
          ) : (
            <Link href="/auth/sign-in" className={navBtn} aria-label={t.nav.signIn} title={t.nav.signIn}>
              <Icon name="user" />
            </Link>
          )}
        </nav>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-brass/15 px-4 pt-8 pb-28 text-center text-sm text-ash md:pb-8">
      <p className="mx-auto max-w-2xl">{t.footer.disclaimer}</p>
      {/* Each link is at least 44px tall: the footer is where thumbs end up on a phone. */}
      <nav aria-label="More" className="mt-2 flex flex-wrap justify-center gap-x-5">
        {[["/endless", "Endless"], ["/community", "Community"], ["/market", "The Black Market"], ["/yesterday", t.vault.yesterday], ["/how-to-play", t.nav.rules], ["/feedback", "Report a problem"], ["/about", t.footer.credits]].map(([href, label]) => (
          <Link key={href} href={href} className="inline-flex min-h-11 items-center hover:text-paper">{label}</Link>
        ))}
      </nav>
    </footer>
  );
}

function Toggle({ label, checked, onChange, desc }: { label: string; checked: boolean; onChange: (v: boolean) => void; desc?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-1">
      <span>
        {label}
        {desc && <span className="block text-xs text-ash">{desc}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${checked ? "border-ecto bg-ecto/30" : "border-ash/50 bg-ink"}`}
      >
        <span className={`absolute top-0.5 h-5.5 w-5.5 rounded-full transition-all ${checked ? "left-[1.4rem] bg-ecto" : "left-0.5 bg-ash"}`} style={{ height: 22, width: 22 }} />
      </button>
    </label>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, [href], input")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);
  // Portal to <body>: an ancestor with backdrop-filter (the sticky header) would otherwise become
  // the containing block for this fixed overlay and push the dialog off-screen.
  if (!hydrated) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/75 p-2 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div ref={ref} role="dialog" aria-modal="true" aria-label={title} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
            {/* The frame stays put (corners and double rule intact); only the body scrolls. */}
            <DecoFrame className="flex max-h-[calc(100dvh-2.5rem)] flex-col p-5 sm:max-h-[88dvh]">
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <h2 className="font-display text-xl text-brass">{title}</h2>
                <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center text-ash hover:text-paper" aria-label={t.settings.close}>
                  <Icon name="close" />
                </button>
              </div>
              <div className="thin-scroll -mr-3 min-h-0 overflow-y-auto overscroll-contain pr-3">{children}</div>
            </DecoFrame>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { store, setSettings, resetAll, importStore, toast, user, guest } = useGame();
  const s = store.settings;
  return (
    <Modal open={open} onClose={onClose} title={t.settings.title}>
      <div className="divide-y divide-brass/10">
        <Toggle label={t.settings.colorblind} checked={s.colorblind} onChange={(v) => setSettings({ colorblind: v })} />
        <div className="flex min-h-11 items-center justify-between gap-4 py-1">
          <span>{t.settings.reducedMotion}</span>
          <div role="radiogroup" aria-label={t.settings.reducedMotion} className="flex overflow-hidden rounded-sm border border-brass/40 text-sm">
            {(["auto", "reduced", "full"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={s.motion === m} onClick={() => setSettings({ motion: m, motionChosen: true })} className={`min-h-9 px-3 ${s.motion === m ? "bg-brass/25 text-paper" : "text-ash"}`}>
                {m === "auto" ? t.settings.motionAuto : m === "reduced" ? t.settings.motionOn : t.settings.motionOff}
              </button>
            ))}
          </div>
        </div>
        <Toggle label={t.settings.sound} checked={s.sound} onChange={(v) => setSettings({ sound: v })} />
        <label className="flex min-h-11 items-center justify-between gap-4 py-1">
          <span>{t.settings.soundVolume}</span>
          <input
            type="range" min={0} max={100} step={5}
            value={Math.round(s.soundVolume * 100)}
            onChange={(e) => setSettings({ soundVolume: Number(e.target.value) / 100 })}
            aria-valuetext={`${Math.round(s.soundVolume * 100)}%`}
            className="w-36 accent-brass"
          />
        </label>
        <Toggle label={t.settings.skipSound} desc={t.settings.skipSoundDesc} checked={s.skipSound} onChange={(v) => setSettings({ skipSound: v })} />
        <Toggle label={t.settings.colorEmoji} checked={s.colorEmoji} onChange={(v) => setSettings({ colorEmoji: v })} />
        {guest ? (
          <div className="space-y-1 py-3">
            <p className="text-sm text-paper">Guest</p>
            <p className="text-xs text-ash">Nothing you play is saved: no stats, streaks or souls, and your locks are gone when you close this tab. <Link href="/auth/sign-in" className="text-brass underline-offset-4 hover:underline">Sign in</Link> to keep them.</p>
          </div>
        ) : (
        <div className="space-y-2 py-3">
          <p className="text-sm text-paper">Your progress</p>
          <p className="text-xs text-ash">
            {user ? "Signed in: your plays are saved to your account and synced across devices." : "Saved in this browser only. Download a backup to keep it safe or move it to another device (or sign in to sync automatically)."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => {
              let endless: unknown = null;
              try { endless = JSON.parse(localStorage.getItem("guesslock:endless") ?? "null"); } catch { /* none */ }
              const blob = new Blob([backupFile(store, endless)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `guesslock-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            }}>Download backup</Button>
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-[3px] border border-brass/40 px-4 text-sm text-paper hover:border-brass">
              Restore from backup
              <input type="file" accept="application/json,.json" className="sr-only" onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file || file.size > 5_000_000) return;
                const backup = readBackup(await file.text());
                if (!backup) { toast("That file isn't a GUESSLOCK backup."); return; }
                importStore(backup.store);
                if (backup.endless && typeof backup.endless === "object") {
                  try { if (!localStorage.getItem("guesslock:endless")) localStorage.setItem("guesslock:endless", JSON.stringify(backup.endless)); } catch { /* ignore */ }
                }
                // Signed in: the next page load brings the restored plays into the account (unranked, like any import).
                if (user) try { sessionStorage.removeItem(`guesslock:synced:${user.id}`); } catch { /* ignore */ }
                toast(`Restored ${Object.keys(backup.store.progress).length} days of progress.`);
              }} />
            </label>
          </div>
        </div>
        )}
        <div className="pt-4">
          <Button
            variant="ghost"
            className="w-full border-[#b0433f]/60 text-[#e6a3a0]"
            onClick={() => {
              if (window.confirm(t.settings.resetConfirm)) { resetAll(); toast(t.settings.resetDone); onClose(); }
            }}
          >
            {t.settings.reset}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Onboarding() {
  const { store, hydrated, setOnboarded, gated } = useGame();
  const [i, setI] = useState(0);
  const [forced, setForced] = useState(false);
  useEffect(() => {
    const on = () => { setI(0); setForced(true); };
    window.addEventListener("guesslock:onboarding", on);
    return () => window.removeEventListener("guesslock:onboarding", on);
  }, []);
  const open = forced || (hydrated && !store.onboarded && !gated);
  const close = () => { setOnboarded(); setForced(false); };
  const card = t.onboarding[i];
  return (
    <Modal open={open} onClose={close} title={card?.title ?? ""}>
      <p className="min-h-24 text-paper/90">{card?.body}</p>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1.5" aria-hidden>
          {t.onboarding.map((_, j) => <span key={j} className={`h-1.5 w-6 rounded ${j === i ? "bg-brass" : "bg-brass/25"}`} />)}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={close}>{t.onboardingSkip}</Button>
          {i < t.onboarding.length - 1 ? (
            <Button onClick={() => setI(i + 1)}>{t.onboardingNext}</Button>
          ) : (
            <Button onClick={close}>{t.onboardingDone}</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
