// Per-hero puzzle setup overrides (Hero.setup), edited in /admin/setup when ADMIN_SETUP_MODE is on.
// Stored as JSON so new per-mode knobs need no migration. Unknown or malformed fields are ignored.

export type HeroSetup = {
  /** The Visage: portrait URL used instead of the API card. */
  splash?: string;
  /** The Belongings: item class names always shown (as the most telling items). */
  buildPin?: string[];
  /** The Belongings: item class names never shown. */
  buildBan?: string[];
};

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : undefined);

export function parseSetup(raw: unknown): HeroSetup {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: HeroSetup = {};
  if (typeof r.splash === "string" && r.splash.trim()) out.splash = r.splash.trim();
  const pin = strings(r.buildPin), ban = strings(r.buildBan);
  if (pin?.length) out.buildPin = pin;
  if (ban?.length) out.buildBan = ban;
  return out;
}

/** Custom voice lines added by hand use this file-name prefix; the wiki import leaves them alone. */
export const CUSTOM_LINE_PREFIX = "custom:";
