import { describe, expect, it } from "vitest";
import { formatValue, renderTemplate } from "@/lib/text/render";
import { CENSOR, findLeaks, redact } from "@/lib/text/redact";
import { heroTerms } from "@/lib/text/entries";
import { fuzzyScore, normalize } from "@/lib/text/normalize";
import { chunkText } from "@/lib/engine/modes/hero";
import { cleanWikiText, ownLines, parseVoiceLines } from "@/lib/wiki/voicelines";

describe("template rendering", () => {
  it("strips markup, svg, img and resolves variables", () => {
    const src = 'Spew <svg width="1"><path d="M0"/></svg>\n<span class="inline-attribute-label">spirit damage</span>, applying <img src="x.png"/><span>slow</span>. Hurts {s:hero_name}.<br>{s:sign}15%';
    expect(renderTemplate(src)).toBe("Spew spirit damage, applying slow. Hurts [this hero].\n15%");
    expect(renderTemplate("a &amp; b", {})).toBe("a & b");
    expect(renderTemplate("{s:unknown}x")).toBe("x");
  });
  it("formats values with sign, postfix and units", () => {
    expect(formatValue(25, { prefix: "{s:sign}", postfix: "%" })).toBe("+25%");
    expect(formatValue(-17, { postfix: "s", signed: true })).toBe("-17s");
    expect(formatValue(1.5, { units: "EDisplayUnit_Meters" })).toBe("1.5m");
  });
});

describe("redaction", () => {
  const terms = heroTerms({ name: "Lady Geist", className: "hero_ghost", aliases: ["Geisty"] }, ["Essence Bomb", "Life Drain"]);

  it("removes names, possessives, aliases and ability names", () => {
    const { text } = redact("Lady Geist's Essence Bomb explodes. Geist smiles. Geisty drains life with Life Drain.", terms);
    expect(text).not.toMatch(/Geist|Essence Bomb|Life Drain/i);
    expect(text).toContain(CENSOR);
  });

  it("is accent-insensitive and whole-word only", () => {
    expect(redact("Hazé strikes.", [{ term: "Haze" }]).text).toBe(`${CENSOR} strikes.`);
    expect(redact("A hazelnut.", [{ term: "Haze" }]).text).toBe("A hazelnut.");
  });

  it("longest terms first", () => {
    expect(redact("Mo & Krill dig.", [{ term: "Krill" }, { term: "Mo & Krill" }]).text).toBe(`${CENSOR} dig.`);
  });

  it("no answer name survives in redacted lore", () => {
    const lore = "Before she was Lady Geist, she was an actress. Geist never forgave them.";
    const out = redact(lore, terms).text;
    expect(findLeaks(out, ["Lady Geist", "Geist", "Geisty"])).toEqual([]);
  });
});

describe("search normalization", () => {
  it("accent-insensitive fuzzy search", () => {
    expect(normalize("Mo & Krill")).toBe("mo and krill");
    expect(fuzzyScore("vindi", "Vindicta")).toBeGreaterThan(50);
    expect(fuzzyScore("vindicat", "Vindicta")).toBeGreaterThan(0); // one typo
    expect(fuzzyScore("krill", "Mo & Krill")).toBeGreaterThan(50);
    expect(fuzzyScore("zzz", "Haze")).toBe(0);
  });
});

describe("lore chunking", () => {
  it("splits into at most n chunks along sentence boundaries", () => {
    const text = Array.from({ length: 14 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
    const chunks = chunkText(text, 6);
    expect(chunks.length).toBe(6);
    expect(chunks.join(" ")).toBe(text);
  });
});

describe("wiki voice line parsing", () => {
  const wikitext = [
    "== Select ==",
    "|{{Audio link|Haze select 01.mp3|They won't ''see'' me coming, not ever.}}",
    "|{{Audio link|Haze select 02.mp3|I am the [[Sandman|sandman]] and I bring the end.}}",
    "|{{Audio link|Haze select 02b.mp3|I am the sandman and I bring the end.}}",
    "== Conversations ==",
    "{{Audio link|atlas match start atlas haze convo01 01.mp3|You like being a Sandman?}}",
  ].join("\n");

  it("cleans markup", () => {
    expect(cleanWikiText("I ''am'' [[Link|here]] {{tpl}}")).toBe("I am here");
  });

  it("keeps only the page hero's own lines, deduped", () => {
    const own = ownLines(parseVoiceLines(wikitext));
    expect(own.map((l) => l.text)).toEqual(["They won't see me coming, not ever.", "I am the sandman and I bring the end."]);
    expect(own[0].section).toBe("Select");
  });
});
