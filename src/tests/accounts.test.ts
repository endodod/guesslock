import { describe, expect, it } from "vitest";
import { mergeGuesses, nameKey, nextSource, streakFromDays, validateDisplayName, weekStart } from "@/lib/accounts/rules";

describe("guess merging (append-only)", () => {
  it("appends new guesses", () => {
    expect(mergeGuesses(["1", "2"], ["1", "2", "3"])).toEqual({ guesses: ["1", "2", "3"], added: 1, conflict: false });
  });
  it("keeps the stored list when the client is behind (another device)", () => {
    expect(mergeGuesses(["1", "2", "3"], ["1"])).toEqual({ guesses: ["1", "2", "3"], added: 0, conflict: false });
  });
  it("rejects a diverging history", () => {
    expect(mergeGuesses(["1", "2"], ["1", "9", "3"])).toEqual({ guesses: ["1", "2"], added: 0, conflict: true });
  });
  it("first guess on an empty record", () => {
    expect(mergeGuesses([], ["5"])).toEqual({ guesses: ["5"], added: 1, conflict: false });
  });
});

describe("ranked vs import", () => {
  it("one guess at a time stays ranked", () => {
    expect(nextSource(undefined, 1)).toBe("live");
    expect(nextSource("live", 1)).toBe("live");
    expect(nextSource("live", 0)).toBe("live");
  });
  it("bulk guesses (played signed out first) become unranked, permanently", () => {
    expect(nextSource(undefined, 3)).toBe("import");
    expect(nextSource("live", 2)).toBe("import");
    expect(nextSource("import", 1)).toBe("import");
  });
});

describe("streaks", () => {
  it("current streak may end yesterday; best is the longest run", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-10", "2026-09-28", "2026-09-29"];
    expect(streakFromDays(days, "2026-09-30")).toEqual({ current: 2, best: 3, count: 6 });
    expect(streakFromDays(days, "2026-10-01").current).toBe(0);
    expect(streakFromDays([...days, "2026-09-30"], "2026-09-30").current).toBe(3);
    expect(streakFromDays([], "2026-09-30")).toEqual({ current: 0, best: 0, count: 0 });
  });
});

describe("display names", () => {
  it("validates", () => {
    expect(validateDisplayName("Keeper_01")).toBeNull();
    expect(validateDisplayName("Lady Geist fan")).toBeNull();
    expect(validateDisplayName("Zoë")).toBeNull();
    expect(validateDisplayName("ab")).toMatch(/3/);
    expect(validateDisplayName("x".repeat(21))).toMatch(/20/);
    expect(validateDisplayName("<script>")).not.toBeNull();
    expect(validateDisplayName("a  b")).not.toBeNull();
    expect(validateDisplayName("Ad-min")).toMatch(/reserved/);
  });
  it("uniqueness key is case-insensitive", () => {
    expect(nameKey(" Keeper ")).toBe(nameKey("keeper"));
  });
});

describe("week start", () => {
  it("Monday-based", () => {
    expect(weekStart("2026-09-30")).toBe("2026-09-28"); // Wednesday
    expect(weekStart("2026-09-28")).toBe("2026-09-28"); // Monday
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sunday
  });
});
