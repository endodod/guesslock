"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useHydrated, useMediaQuery } from "@/lib/client/hooks";
import { MotionConfig } from "motion/react";
import { adoptServerProgress, emptyStore, loadStore, mergeStores, saveStore, type LockRecord, type Settings, type StoreData } from "@/lib/client/store";
import { sfx } from "@/lib/client/sound";
import { setEndlessGuest } from "@/lib/client/endless";
import { GUEST_COOKIE } from "@/lib/guest";


type Toast = { id: number; text: string };

export type AccountUser = { id: string; name: string } | null;

type Ctx = {
  store: StoreData;
  hydrated: boolean;
  today: string;
  user: AccountUser;
  /** Playing as a guest: nothing is saved beyond this tab (no stats, streaks or souls). */
  guest: boolean;
  /** Accounts exist and the visitor is neither signed in nor a guest yet: the welcome screen asks first. */
  gated: boolean;
  startGuest(): void;
  setRecord(date: string, slug: string, rec: LockRecord): void;
  setSettings(patch: Partial<Settings>): void;
  setOnboarded(): void;
  resetAll(): void;
  /** Merges an imported backup into this device's progress. */
  importStore(incoming: StoreData): void;
  play(sound: keyof typeof sfx): void;
  toast(text: string): void;
  reducedMotion: boolean;
};

const GameCtx = createContext<Ctx | null>(null);

// External store so every component sees the same localStorage snapshot.
let cache: StoreData | null = null;
let guestMode = false;
function setGuestMode(on: boolean) {
  if (on === guestMode) return;
  guestMode = on;
  cache = null;
  setEndlessGuest(on);
}
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = () => { cache = loadStore(guestMode); listeners.forEach((l) => l()); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
}
function getSnapshot(): StoreData {
  return (cache ??= loadStore(guestMode));
}
const serverSnapshot = emptyStore();
function write(next: StoreData) {
  cache = next;
  saveStore(next, guestMode);
  listeners.forEach((l) => l());
}

export function GameProvider({ children, today, user = null, guest: guestIn = false, accounts = false }: {
  children: React.ReactNode; today: string; user?: AccountUser; guest?: boolean; accounts?: boolean;
}) {
  const [guestPicked, setGuestPicked] = useState(guestIn);
  // Guests exist only where accounts do; a signed-in visitor is never a guest.
  const guest = accounts && !user && guestPicked;
  setGuestMode(guest);
  const store = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
  const hydrated = useHydrated();
  const osReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  // Apply settings to <html> so CSS tokens switch (colorblind palette, motion).
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.cb = store.settings.colorblind ? "1" : "0";
    el.dataset.motion = store.settings.motion === "auto" ? "" : store.settings.motion;
  }, [store.settings.colorblind, store.settings.motion]);

  const reducedMotion = store.settings.motion === "reduced" || (store.settings.motion === "auto" && osReduced);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // Signed in: once per browser session, bring this device's history into the account and
  // adopt the account's progress (so locks played on other devices show up here). Coming back to the tab after a
  // while syncs again, so a lock finished on the phone shows up on the open laptop.
  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    if (!user) return;
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) {
        try { sessionStorage.removeItem(`guesslock:synced:${user.id}`); } catch { /* ignore */ }
        setSyncTick((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user]);
  useEffect(() => {
    if (!hydrated || !user) return;
    const key = `guesslock:synced:${user.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch { /* storage blocked: sync every load */ }
    const local = getSnapshot().progress;
    fetch("/api/account/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ progress: local }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((res: { imported: number; plays: Record<string, Record<string, LockRecord>> }) => {
        const cur = getSnapshot();
        write({ ...cur, progress: adoptServerProgress(cur.progress, res.plays) });
        try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
        if (res.imported > 0) toast(`Brought ${res.imported} ${res.imported === 1 ? "lock" : "locks"} from this device into your account.`);
      })
      .catch(() => { /* offline or signed out meanwhile: the game keeps working locally */ });
  }, [hydrated, user, toast, syncTick]);

  useEffect(() => {
    // Signed in: the guest choice is over.
    if (user) document.cookie = `${GUEST_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }, [user]);

  const value = useMemo<Ctx>(() => ({
    store, hydrated, today, reducedMotion, user, guest, gated: accounts && !user && !guest,
    startGuest() {
      // A session cookie (gone when the browser closes) so the server can render the right screen.
      document.cookie = `${GUEST_COOKIE}=1; path=/; SameSite=Lax`;
      setGuestPicked(true);
    },
    setRecord(date, slug, rec) {
      const cur = getSnapshot();
      write({ ...cur, progress: { ...cur.progress, [date]: { ...(cur.progress[date] ?? {}), [slug]: rec } } });
    },
    setSettings(patch) {
      const cur = getSnapshot();
      write({ ...cur, settings: { ...cur.settings, ...patch } });
    },
    setOnboarded() {
      write({ ...getSnapshot(), onboarded: true });
    },
    resetAll() {
      write(emptyStore());
    },
    importStore(incoming) {
      write(mergeStores(getSnapshot(), incoming));
    },
    play(sound) {
      if (getSnapshot().settings.sound) sfx[sound]();
    },
    toast,
  }), [store, hydrated, today, reducedMotion, toast, user, guest, accounts]);

  return (
    <GameCtx.Provider value={value}>
      <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
        {children}
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-8">
          {toasts.map((t) => (
            <div key={t.id} role="status" className="deco pointer-events-auto rounded px-4 py-2 text-sm shadow-lg">
              {t.text}
            </div>
          ))}
        </div>
      </MotionConfig>
    </GameCtx.Provider>
  );
}

export function useGame(): Ctx {
  const c = useContext(GameCtx);
  if (!c) throw new Error("useGame outside GameProvider");
  return c;
}
