import { describe, expect, it } from "vitest";
import { DAILY_BASE, DAILY_MAX_STEPS, DAILY_STEP, DAILY_WEEK_BONUS, claimStreak, dailyReward } from "@/lib/market/rewards";
import { inviteToken, parseInvite } from "@/lib/market/earn";

describe("daily login reward", () => {
  it("grows each day up to a cap, with a bonus every seventh day", () => {
    expect(dailyReward(1)).toBe(DAILY_BASE);
    expect(dailyReward(2)).toBe(DAILY_BASE + DAILY_STEP);
    expect(dailyReward(6)).toBe(DAILY_BASE + 5 * DAILY_STEP);
    expect(dailyReward(7)).toBe(DAILY_BASE + 6 * DAILY_STEP + DAILY_WEEK_BONUS);
    expect(dailyReward(10)).toBe(DAILY_BASE + DAILY_MAX_STEPS * DAILY_STEP);
    expect(dailyReward(11)).toBe(dailyReward(10)); // capped
    expect(dailyReward(14)).toBe(dailyReward(10) + DAILY_WEEK_BONUS);
    expect(dailyReward(0)).toBe(DAILY_BASE); // never below day 1
  });

  it("the streak runs over consecutive claim days and survives until the day after", () => {
    expect(claimStreak([], "2026-10-05")).toEqual({ streak: 0, claimedToday: false });
    expect(claimStreak(["2026-10-05"], "2026-10-05")).toEqual({ streak: 1, claimedToday: true });
    // Claimed up to yesterday: alive, today's still waiting.
    expect(claimStreak(["2026-10-04", "2026-10-03", "2026-10-02"], "2026-10-05")).toEqual({ streak: 3, claimedToday: false });
    expect(claimStreak(["2026-10-05", "2026-10-04", "2026-10-03"], "2026-10-05")).toEqual({ streak: 3, claimedToday: true });
    // A missed day breaks it.
    expect(claimStreak(["2026-10-05", "2026-10-03"], "2026-10-05")).toEqual({ streak: 1, claimedToday: true });
    expect(claimStreak(["2026-10-02"], "2026-10-05")).toEqual({ streak: 0, claimedToday: false });
    // Across a month boundary.
    expect(claimStreak(["2026-10-01", "2026-09-30"], "2026-10-01").streak).toBe(2);
  });
});

describe("invite links", () => {
  it("carry the inviter and can't be altered", () => {
    const id = "3f2b6a3e-aaaa-4bbb-8ccc-0123456789ab";
    const token = inviteToken(id);
    expect(parseInvite(token)).toBe(id);
    expect(parseInvite(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBeNull(); // signature changed
    const other = inviteToken("someone-else");
    expect(parseInvite(`${other.split(".")[0]}.${token.split(".")[1]}`)).toBeNull(); // another player's id, this signature
    expect(parseInvite("nonsense")).toBeNull();
    expect(parseInvite("")).toBeNull();
    expect(parseInvite("x".repeat(500))).toBeNull();
  });
});
