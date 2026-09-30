"use client";
// Core visual primitives: DecoFrame, Logo, icons, KeyholeLoader, LockpickRow, Countdown.
import { useEffect } from "react";
import { useNow } from "@/lib/client/hooks";
import { motion } from "motion/react";

// ───────────── DecoFrame ─────────────

function Corner({ className }: { className: string }) {
  // Stepped art-deco corner
  return (
    <svg viewBox="0 0 18 18" className={`deco-corner ${className}`} aria-hidden>
      <path d="M1 17V7h3V4h3V1h10" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 17V10h3V7h3V4h7" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.6" />
    </svg>
  );
}

export function DecoFrame({
  children, className = "", as: Tag = "div", corners = true, ...rest
}: { children: React.ReactNode; className?: string; as?: "div" | "section" | "article"; corners?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`deco rounded-[3px] ${className}`} {...rest}>
      {corners && (
        <>
          <Corner className="-left-[5px] -top-[5px]" />
          <Corner className="-right-[5px] -top-[5px] rotate-90" />
          <Corner className="-bottom-[5px] -right-[5px] rotate-180" />
          <Corner className="-bottom-[5px] -left-[5px] -rotate-90" />
        </>
      )}
      {children}
    </Tag>
  );
}

// ───────────── Logo: GUESSLOCK with a keyhole O ─────────────

export function Keyhole({ className = "", glow = false }: { className?: string; glow?: boolean }) {
  return (
    <svg viewBox="0 0 24 32" className={`${className} ${glow ? "keyhole-glow" : ""}`} aria-hidden>
      <circle cx="12" cy="11" r="7" fill="currentColor" />
      <path d="M8.5 15 L6 30 H18 L15.5 15 Z" fill="currentColor" />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "text-5xl md:text-6xl" : size === "sm" ? "text-xl" : "text-2xl";
  return (
    <span className={`font-display inline-flex items-baseline tracking-wide text-brass ${cls}`} aria-label="GUESSLOCK">
      <span aria-hidden>GUESSL</span>
      <span aria-hidden className="relative inline-flex h-[0.72em] w-[0.62em] items-center justify-center self-center rounded-full border-[0.09em] border-brass">
        <Keyhole className="h-[0.42em] w-[0.3em] text-brass" />
      </span>
      <span aria-hidden>CK</span>
    </span>
  );
}

// ───────────── Icons (thin-line brass) ─────────────

type IconName = "ledger" | "archive" | "settings" | "back" | "info" | "question" | "flame" | "speaker" | "lock" | "unlock" | "check" | "approx" | "cross" | "up" | "down" | "share" | "close" | "seal" | "arrow-right" | "arrow-left";

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    ledger: <><rect x="5" y="3" width="14" height="18" rx="1" {...p} /><path d="M9 7h6M9 11h6M9 15h4" {...p} /></>,
    archive: <><rect x="3" y="4" width="18" height="5" rx="1" {...p} /><path d="M5 9v10h14V9M10 13h4" {...p} /></>,
    settings: <><circle cx="12" cy="12" r="3" {...p} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" {...p} /></>,
    back: <path d="M15 5l-7 7 7 7" {...p} />,
    "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" {...p} />,
    "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" {...p} />,
    info: <><circle cx="12" cy="12" r="9" {...p} /><path d="M12 11v6M12 7.5v.5" {...p} /></>,
    question: <><circle cx="12" cy="12" r="9" {...p} /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5" {...p} /></>,
    flame: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" {...p} />,
    speaker: <><path d="M4 9h4l5-4v14l-5-4H4z" {...p} /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" {...p} /></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="1.5" {...p} /><path d="M8 10V7a4 4 0 0 1 8 0v3" {...p} /></>,
    unlock: <><rect x="5" y="10" width="14" height="10" rx="1.5" {...p} /><path d="M8 10V7a4 4 0 0 1 7.5-2" {...p} /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" {...p} strokeWidth={2.2} />,
    approx: <path d="M5 10c2-2 4-2 7 0s5 2 7 0M5 15c2-2 4-2 7 0s5 2 7 0" {...p} strokeWidth={2} />,
    cross: <path d="M6 6l12 12M18 6L6 18" {...p} strokeWidth={2.2} />,
    up: <path d="M12 19V5M6 11l6-6 6 6" {...p} strokeWidth={2.2} />,
    down: <path d="M12 5v14M6 13l6 6 6-6" {...p} strokeWidth={2.2} />,
    share: <><path d="M12 15V3M7 8l5-5 5 5" {...p} /><path d="M5 13v7h14v-7" {...p} /></>,
    close: <path d="M6 6l12 12M18 6L6 18" {...p} />,
    seal: <><circle cx="12" cy="12" r="7" {...p} /><path d="M12 5v2M12 17v2M5 12h2M17 12h2M9 9l6 6M15 9l-6 6" {...p} /></>,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {paths[name]}
    </svg>
  );
}

// ───────────── KeyholeLoader: a key slowly turning in a keyhole ─────────────

export function KeyholeLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 py-8 text-brass">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-brass-dim bg-iron">
        <svg viewBox="0 0 40 40" className="key-turn h-9 w-9" aria-hidden>
          <circle cx="12" cy="20" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M18 20h16M29 20v5M33 20v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

// ───────────── LockpickRow ─────────────

export function Lockpick({ broken, glowing, hint }: { broken: boolean; glowing?: boolean; hint?: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 16 64"
      className={`h-12 w-4 ${glowing ? "text-ecto drop-shadow-[0_0_6px_rgba(127,227,194,0.8)]" : broken ? "text-ash/60" : "text-brass"}`}
      aria-hidden
      initial={false}
    >
      {/* handle */}
      <rect x="4" y="2" width="8" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {hint && <circle cx="8" cy="10" r="2" fill="currentColor" />}
      {/* shaft: lower part drops away when snapped */}
      <path d="M8 18v18" stroke="currentColor" strokeWidth="1.6" />
      <motion.path
        d="M8 36v18l4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        initial={false}
        animate={broken ? { rotate: 38, x: 5, y: 4, opacity: 0.45 } : { rotate: 0, x: 0, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        style={{ originX: "8px", originY: "36px" }}
      />
    </motion.svg>
  );
}

export function LockpickRow({
  total, broken, hintAt = [], glowing = false, triesLeft,
}: { total: number; broken: number; hintAt?: number[]; glowing?: boolean; triesLeft?: number }) {
  return (
    <div className="flex items-center justify-center gap-3" aria-label={`${Math.min(broken, total)} of ${total} lockpicks snapped`}>
      <div className="flex items-end gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <Lockpick key={i} broken={i < broken} glowing={glowing && i >= broken} hint={hintAt.includes(i + 1)} />
        ))}
      </div>
      {triesLeft !== undefined && <span className="font-mono text-xs text-ash">{triesLeft} left</span>}
    </div>
  );
}

// ───────────── Countdown ─────────────

export function Countdown({ target, onZero, className = "" }: { target: number; onZero?: () => void; className?: string }) {
  const now = useNow();
  const left = now === null ? null : Math.max(0, target - now);
  useEffect(() => {
    if (left === 0) onZero?.();
  }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return [h, m, sec].map((x) => String(x).padStart(2, "0")).join(":");
  };
  return (
    <time className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>
      {left === null ? "--:--:--" : fmt(left)}
    </time>
  );
}

export function SlotDot({ slot }: { slot: string }) {
  const c = slot === "weapon" ? "bg-slot-weapon" : slot === "vitality" ? "bg-slot-vitality" : "bg-slot-spirit";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${c}`} aria-hidden />;
}

export function Button({
  children, variant = "brass", className = "", ...rest
}: { variant?: "brass" | "ghost" | "cursed" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v =
    variant === "brass"
      ? "border-brass bg-brass/10 text-brass hover:bg-brass/20"
      : variant === "cursed"
        ? "border-cursed/70 bg-cursed/10 text-paper hover:bg-cursed/20"
        : "border-ash/40 text-paper hover:border-brass/60";
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[3px] border px-4 py-2 text-[0.95rem] transition-colors disabled:opacity-40 ${v} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
