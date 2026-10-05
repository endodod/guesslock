"use client";
// The Codex: a picture-and-name list of every hero (or every item, by shop tab) to look things up while guessing.
import { useState } from "react";
import type { Codex as CodexData } from "@/lib/codex";
import { t } from "@/lib/i18n/en";
import { Modal } from "./Chrome";
import { Icon } from "./ui";

const TABS = ["weapon", "vitality", "spirit"] as const;

export function CodexButton({ codex }: { codex: CodexData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center text-brass" aria-label={t.codex.open}>
        <Icon name="book" className="h-6 w-6" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={codex.kind === "hero" ? t.codex.heroes : t.codex.items}>
        <CodexList codex={codex} />
      </Modal>
    </>
  );
}

function CodexList({ codex }: { codex: CodexData }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("weapon");
  const shown = codex.kind === "item" ? codex.entries.filter((e) => e.slot === tab) : codex.entries;
  return (
    <div>
      {codex.kind === "item" && (
        <div role="tablist" className="mb-3 grid grid-cols-3 gap-1">
          {TABS.map((s) => (
            <button
              key={s} type="button" role="tab" aria-selected={tab === s} onClick={() => setTab(s)}
              className={`min-h-11 rounded-[3px] border text-sm ${tab === s ? `border-brass bg-brass/15 text-paper` : "border-brass/25 text-ash hover:text-paper"}`}
            >
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${s === "weapon" ? "bg-slot-weapon" : s === "vitality" ? "bg-slot-vitality" : "bg-slot-spirit"}`} />
              {t.codex.slots[s]}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {shown.map((e) => (
          <li key={e.id} className="flex flex-col items-center gap-1 rounded-sm border border-brass/15 bg-ink/50 p-1.5 text-center">
            {e.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.icon} alt="" loading="lazy" className="h-14 w-14 rounded-sm bg-ink object-contain" />
            ) : (
              <span className="h-14 w-14 rounded-sm bg-ink" />
            )}
            <span className="w-full text-xs leading-tight text-paper/90 [overflow-wrap:anywhere]">{e.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
