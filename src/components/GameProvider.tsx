"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useHydrated, useMediaQuery } from "@/lib/client/hooks";
import { MotionConfig } from "motion/react";
import { adoptServerProgress, emptyStore, loadStore, saveStore, type LockRecord, type Settings, type StoreData } from "@/lib/client/store";
import { sfx } from "@/lib/client/sound";

type Toast = { id: number; text: string };

export type AccountUser = { id: string; name: string } | null;

type Ctx = {
  store: StoreData;
  hydrated: boolean;
  today: string;
  user: AccountUser;
  setRecord(date: string, slug: string, rec: LockRecord): void;
  setSettings(patch: Partial<Settings>): void;
  addPractice(omen: string, souls: number): void;
  setOnboarded(): void;
  resetAll(): void;
  play(sound: keyof typeof sfx): void;
  toast(text: string): void;
  reducedMotion: boolean;
};

const GameCtx = createContext<Ctx | null>(null);

// External store so every component sees the same localStorage snapshot.
let cache: StoreData | null = null;
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = () => { cache = loadStore(); listeners.forEach((l) => l()); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
}
function getSnapshot(): StoreData {
  return (cache ??= loadStore());
}
const serverSnapshot = emptyStore();
function write(next: StoreData) {
  cache = next;
  saveStore(next);
  listeners.forEach((l) => l());
}

export function GameProvider({ children, today, user = null }: { children: React.ReactNode; today: string; user?: AccountUser }) {
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
  // adopt the account's progress (so locks played on other devices show up here).
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
  }, [hydrated, user, toast]);

  const value = useMemo<Ctx>(() => ({
    store, hydrated, today, reducedMotion, user,
    setRecord(date, slug, rec) {
      const cur = getSnapshot();
      write({ ...cur, progress: { ...cur.progress, [date]: { ...(cur.progress[date] ?? {}), [slug]: rec } } });
    },
    setSettings(patch) {
      const cur = getSnapshot();
      write({ ...cur, settings: { ...cur.settings, ...patch } });
    },
    addPractice(omen, souls) {
      const cur = getSnapshot();
      const p = cur.practice[omen] ?? { n: 0, souls: 0 };
      write({ ...cur, practice: { ...cur.practice, [omen]: { n: p.n + 1, souls: p.souls + souls } } });
    },
    setOnboarded() {
      write({ ...getSnapshot(), onboarded: true });
    },
    resetAll() {
      write(emptyStore());
    },
    play(sound) {
      if (getSnapshot().settings.sound) sfx[sound]();
    },
    toast,
  }), [store, hydrated, today, reducedMotion, toast, user]);

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
