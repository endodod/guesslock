// Turns API description markup into plain display text.
// API strings contain inline <svg>, <img>, <span class="highlight">, <br>, <Panel> and template
// variables like {s:sign} / {s:hero_name}. We resolve what we can and strip the rest.

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

export type RenderVars = Record<string, string>;

export function renderTemplate(src: string, vars: RenderVars = {}): string {
  let s = src ?? "";
  // Template variables: {s:name}, {g:name}, {i:name}
  s = s.replace(/\{([sgi]):([a-zA-Z_]+)\}/g, (_m, _t, name: string) => {
    if (name in vars) return vars[name];
    if (name === "sign") return "";
    if (name === "hero_name") return vars.hero_name ?? "[this hero]";
    return "";
  });
  // Whole SVG blocks and <Panel> blocks are decoration only.
  s = s.replace(/\s*<svg[\s\S]*?<\/svg>\s*/gi, " ");
  s = s.replace(/\s*<Panel[\s\S]*?(<\/Panel>|\/>)\s*/g, " ");
  s = s.replace(/\s*<img[^>]*>\s*/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  s = s.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
  // Whitespace: collapse runs of spaces, keep paragraph breaks.
  s = s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  // "+ 15%" artefacts from sign templates
  s = s.replace(/\+\s+(?=\d)/g, "+");
  return s.trim();
}

/** Format a numeric API value with its prefix/postfix (e.g. "+25%", "-17s"). */
export function formatValue(
  raw: number,
  opts: { prefix?: string; postfix?: string; units?: string; signed?: boolean } = {},
): string {
  const n = Number.isInteger(raw) ? String(raw) : String(Math.round(raw * 100) / 100);
  const signed = opts.signed ?? (opts.prefix ?? "").includes("{s:sign}");
  const sign = signed && raw > 0 ? "+" : "";
  let post = opts.postfix ?? "";
  if (!post && opts.units === "EDisplayUnit_Meters") post = "m";
  if (!post && opts.units === "EDisplayUnit_MetersPerSecond") post = "m/s";
  const pre = (opts.prefix ?? "").replace("{s:sign}", "");
  return `${pre}${sign}${n}${post}`;
}
