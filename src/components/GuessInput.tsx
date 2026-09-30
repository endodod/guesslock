"use client";
// Autocomplete guess input: desktop dropdown, mobile bottom sheet.
// Fuzzy + accent-insensitive; already-guessed entries are greyed and struck through.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import type { CatalogEntry } from "@/lib/engine/types";
import { fuzzyScore } from "@/lib/text/normalize";
import { Icon, SlotDot } from "./ui";
import { useMediaQuery } from "@/lib/client/hooks";
import { t } from "@/lib/i18n/en";
import { useGame } from "./GameProvider";

const useIsMobile = () => useMediaQuery("(max-width: 767px)");

type Props = {
  entries: CatalogEntry[];
  guessed: Set<string>;
  placeholder: string;
  /** Input unusable (e.g. saved guesses still restoring). */
  disabled?: boolean;
  /** A guess is being checked: submits are ignored, but the field keeps focus and text. */
  busy?: boolean;
  /** Changes on every wrong guess; each change shakes the field. */
  shake?: number;
  grouped?: boolean; // group by entry.group (abilities by hero)
  /** Resolves to true when the guess was right. */
  onGuess: (id: string) => Promise<boolean> | void;
  autoFocus?: boolean;
};

/** Shakes the returned scope element whenever `trigger` changes (skipped with reduced motion). */
function useShake(trigger: number | undefined) {
  const { reducedMotion } = useGame();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  useEffect(() => {
    if (!trigger || reducedMotion || !scope.current) return;
    void animate(scope.current, { x: [0, -8, 7, -5, 3, 0] }, { duration: 0.36, ease: "easeOut" });
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps
  return scope;
}

function rank(entries: CatalogEntry[], q: string) {
  if (!q.trim()) return entries.map((e) => ({ e, s: 1 }));
  return entries
    .map((e) => ({
      e,
      s: Math.max(fuzzyScore(q, e.name), ...(e.aliases ?? []).map((a) => fuzzyScore(q, a) - 5), e.group ? fuzzyScore(q, e.group) - 30 : 0),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
}

export function GuessInput({ entries, guessed, placeholder, disabled, busy, shake, grouped, onGuess, autoFocus }: Props) {
  const isMobile = useIsMobile();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const shakeRef = useShake(shake);

  const results = useMemo(() => {
    const r = rank(entries, q);
    if (grouped && !q.trim()) r.sort((a, b) => (a.e.group ?? "").localeCompare(b.e.group ?? "") || a.e.name.localeCompare(b.e.name));
    return r.slice(0, isMobile ? 80 : q.trim() ? 8 : grouped ? 60 : 0).map((x) => x.e);
  }, [entries, q, isMobile, grouped]);

  const selectable = results.filter((e) => !guessed.has(e.id));
  useEffect(() => {
    // Check the viewport directly: during hydration isMobile is still false on phones.
    if (autoFocus && !disabled && !window.matchMedia("(max-width: 767px)").matches) inputRef.current?.focus();
  }, [autoFocus, isMobile, disabled]);

  const submit = async (id?: string) => {
    const pick = id ?? selectable[active]?.id;
    if (busy || disabled || !pick || guessed.has(pick)) return;
    setActive(0);
    if (isMobile) setOpen(false);
    const right = await onGuess(pick);
    if (right) { setQ(""); setOpen(false); return; }
    // Wrong (or failed): keep what the player typed so they can refine it; select it so
    // typing starts a fresh search.
    if (!isMobile) {
      const el = inputRef.current;
      el?.focus();
      el?.select();
      setOpen(true);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, selectable.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  const activeId = selectable[active]?.id;

  const list = (big: boolean) => (
    <ul id={listId} role="listbox" className={big ? "divide-y divide-brass/10" : "max-h-80 overflow-y-auto"}>
      {results.length === 0 && q.trim() && <li className="px-4 py-3 text-ash">{t.lock.noMatches}</li>}
      {results.map((e, i) => {
        const done = guessed.has(e.id);
        const showGroup = grouped && e.group && (i === 0 || results[i - 1].group !== e.group) && !q.trim();
        return (
          <li key={e.id} role="presentation">
            {showGroup && <div className="smallcaps bg-ink/60 px-4 pt-3 pb-1 text-xs text-brass">{e.group}</div>}
            <div
              role="option"
              id={`${listId}-${e.id}`}
              aria-selected={e.id === activeId}
              aria-disabled={done}
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => !done && submit(e.id)}
              onMouseEnter={() => !done && setActive(selectable.indexOf(e))}
              className={`flex cursor-pointer items-center gap-3 px-3 ${big ? "min-h-14 py-2 text-lg" : "min-h-11 py-1.5"} ${
                done ? "cursor-not-allowed text-ash/60 line-through" : e.id === activeId ? "bg-brass/15 text-paper" : "hover:bg-brass/10"
              }`}
            >
              {e.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.icon} alt="" loading="lazy" className={`${big ? "h-10 w-10" : "h-8 w-8"} shrink-0 rounded-sm bg-ink object-contain ${done ? "opacity-40 grayscale" : ""}`} />
              ) : (
                <span className={`${big ? "h-10 w-10" : "h-8 w-8"} shrink-0 rounded-sm bg-ink`} />
              )}
              <span className="flex-1 truncate">{e.name}</span>
              {e.slot && <SlotDot slot={e.slot} />}
              {grouped && q.trim() && e.group && <span className="truncate text-xs text-ash">{e.group}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );

  const field = (big: boolean) => (
    <div className={`search-field flex items-center gap-1 rounded-[3px] border border-brass/50 bg-ink/80 pl-3 pr-1 transition-[border-color,box-shadow] ${busy ? "opacity-80" : ""} ${big ? "min-h-14" : "min-h-12"}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId ? `${listId}-${activeId}` : undefined}
        aria-autocomplete="list"
        aria-label={placeholder}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-busy={busy}
        value={q}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => !isMobile && setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
        className="min-w-0 flex-1 bg-transparent py-2 text-[1.05rem] text-paper outline-none placeholder:text-ash"
      />
      {q && (
        <button
          type="button"
          onClick={() => { setQ(""); setActive(0); inputRef.current?.focus(); }}
          className="flex h-10 w-8 shrink-0 items-center justify-center text-ash hover:text-paper"
          aria-label={t.lock.clear}
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => submit()}
        disabled={disabled || busy || !selectable.length || (!q.trim() && !grouped)}
        className="flex h-10 items-center rounded-[3px] px-3 text-brass disabled:opacity-30"
        aria-label={t.lock.submit}
      >
        <Icon name="arrow-right" />
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div ref={shakeRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-brass/30 bg-ink/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <button
            type="button"
            disabled={disabled}
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="flex min-h-12 w-full items-center gap-3 rounded-[3px] border border-brass/50 bg-iron px-4 text-left text-ash disabled:opacity-40"
          >
            <Icon name="question" className="h-5 w-5 shrink-0 text-brass" />
            <span className={`truncate ${q ? "text-paper" : ""}`}>{q || placeholder}</span>
          </button>
        </div>
        <AnimatePresence>
          {open && !disabled && (
            <motion.div
              className="fixed inset-0 z-40 flex flex-col bg-ink/70"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            >
              <motion.div
                role="dialog"
                aria-label={placeholder}
                className="deco mt-auto flex max-h-[85dvh] flex-col rounded-t-md"
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "tween", duration: 0.22 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 border-b border-brass/20 p-3">
                  <div className="flex-1">{field(true)}</div>
                  <button className="flex h-12 w-12 items-center justify-center text-ash" onClick={() => setOpen(false)} aria-label={t.settings.close}>
                    <Icon name="close" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{list(true)}</div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="relative" ref={shakeRef}>
      {field(false)}
      {open && (results.length > 0 || q.trim()) && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-[3px] border border-brass/50 bg-iron-2 shadow-[0_18px_40px_rgba(0,0,0,0.6)]" onMouseDown={(e) => e.preventDefault()}>
          {list(false)}
        </div>
      )}
    </div>
  );
}

/** Numeric input for The Measure. A wrong number stays in the field so it can be adjusted. */
export function NumberInput({
  placeholder, disabled, busy, shake, onGuess, postfix,
}: {
  placeholder: string; disabled?: boolean; busy?: boolean; shake?: number;
  onGuess: (v: string) => Promise<boolean> | void; postfix?: string;
}) {
  const [v, setV] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const shakeRef = useShake(shake);
  const submit = async () => {
    const n = Number(v.replace(",", "."));
    if (busy || disabled || v.trim() === "" || !Number.isFinite(n)) return;
    const right = await onGuess(String(n));
    if (right) setV("");
    else inputRef.current?.select();
  };
  return (
    <div ref={shakeRef} className="fixed inset-x-0 bottom-0 z-30 border-t border-brass/30 bg-ink/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      <form
        className="search-field flex min-h-12 items-center gap-2 rounded-[3px] border border-brass/50 bg-ink/80 pl-3 pr-1 transition-[border-color,box-shadow]"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
        <input
          ref={inputRef}
          inputMode="decimal"
          enterKeyHint="go"
          aria-label={placeholder}
          aria-busy={busy}
          autoComplete="off"
          disabled={disabled}
          value={v}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value.replace(/[^0-9.,-]/g, ""))}
          className="min-w-0 flex-1 bg-transparent py-2 font-mono text-lg text-paper outline-none placeholder:font-body placeholder:text-ash"
        />
        {postfix && <span className="font-mono text-ash">{postfix}</span>}
        <button type="submit" disabled={disabled || busy || !v.trim()} className="flex h-10 items-center px-3 text-brass disabled:opacity-30" aria-label={t.lock.submit}>
          <Icon name="arrow-right" />
        </button>
      </form>
    </div>
  );
}
