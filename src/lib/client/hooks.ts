"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during SSR and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// One shared 1s ticker for all countdowns.
const tickListeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribeTick(cb: () => void) {
  tickListeners.add(cb);
  timer ??= setInterval(() => tickListeners.forEach((l) => l()), 1000);
  return () => {
    tickListeners.delete(cb);
    if (!tickListeners.size && timer) { clearInterval(timer); timer = null; }
  };
}

/** Current time rounded to the second; null during SSR. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribeTick, () => Math.floor(Date.now() / 1000) * 1000, () => null);
}
