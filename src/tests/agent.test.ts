import { describe, expect, it, beforeEach } from "vitest";
import { config } from "@/lib/config";
import { guard, readBody } from "@/lib/agent/guard";
import { EntityPatch, CategoryCreate, SeanceCreate, PuzzleAction } from "@/lib/agent/schemas";
import { puzzleAction } from "@/lib/agent/ops";

// 32-char test tokens
const TEST_READ_TOKEN = "test-agent-read-token-32chars-long-1234";
const TEST_WRITE_TOKEN = "test-agent-write-token-32chars-long-5678";

describe("Agent API Authentication & Guard", () => {
  beforeEach(() => {
    // Reset test config tokens
    (config as any).agentReadToken = TEST_READ_TOKEN;
    (config as any).agentWriteToken = TEST_WRITE_TOKEN;
  });

  it("returns 404 when both tokens are disabled/too short", async () => {
    (config as any).agentReadToken = "too-short";
    (config as any).agentWriteToken = "";

    const req = new Request("https://guesslock.local/api/agent/v1/state", {
      headers: { authorization: `Bearer ${TEST_READ_TOKEN}` },
    });
    const result = await guard(req, "read");
    expect("res" in result).toBe(true);
    if ("res" in result) {
      expect(result.res.status).toBe(404);
      const data = await result.res.json();
      expect(data.error).toBe("Not found");
    }
  });

  it("returns 401 on missing or wrong token", async () => {
    const reqNoHeader = new Request("https://guesslock.local/api/agent/v1/state");
    const resNoHeader = await guard(reqNoHeader, "read");
    expect("res" in resNoHeader).toBe(true);
    if ("res" in resNoHeader) expect(resNoHeader.res.status).toBe(401);

    const reqWrong = new Request("https://guesslock.local/api/agent/v1/state", {
      headers: { authorization: "Bearer wrong-token-123456789012345678901234" },
    });
    const resWrong = await guard(reqWrong, "read");
    expect("res" in resWrong).toBe(true);
    if ("res" in resWrong) expect(resWrong.res.status).toBe(401);
  });

  it("returns 403 when a read token is used on a write route", async () => {
    const req = new Request("https://guesslock.local/api/agent/v1/puzzles/visage", {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_READ_TOKEN}` },
    });
    const result = await guard(req, "write");
    expect("res" in result).toBe(true);
    if ("res" in result) {
      expect(result.res.status).toBe(403);
      const data = await result.res.json();
      expect(data.error).toContain("read-only");
    }
  });

  it("authenticates write token on both read and write routes", async () => {
    const reqRead = new Request("https://guesslock.local/api/agent/v1/state", {
      headers: { authorization: `Bearer ${TEST_WRITE_TOKEN}` },
    });
    const resRead = await guard(reqRead, "read");
    expect("who" in resRead).toBe(true);
    if ("who" in resRead) {
      expect(resRead.who.scope).toBe("write");
    }

    const reqWrite = new Request("https://guesslock.local/api/agent/v1/categories", {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_WRITE_TOKEN}` },
    });
    const resWrite = await guard(reqWrite, "write");
    expect("who" in resWrite).toBe(true);
    if ("who" in resWrite) {
      expect(resWrite.who.scope).toBe("write");
    }
  });

  it("throttles after 10 failed auth attempts from the same IP", async () => {
    const clientIp = "192.168.1.100";
    for (let i = 0; i < 10; i++) {
      const req = new Request("https://guesslock.local/api/agent/v1/state", {
        headers: { authorization: "Bearer bad-token", "x-forwarded-for": clientIp },
      });
      await guard(req, "read");
    }

    // 11th attempt
    const req11 = new Request("https://guesslock.local/api/agent/v1/state", {
      headers: { authorization: "Bearer bad-token", "x-forwarded-for": clientIp },
    });
    const res11 = await guard(req11, "read");
    expect("res" in res11).toBe(true);
    if ("res" in res11) {
      expect(res11.res.status).toBe(429);
      const data = await res11.res.json();
      expect(data.error).toContain("Too many failed attempts");
    }
  });
});

describe("Agent API Schemas & Body Validation", () => {
  it("rejects unknown fields on strict schemas", async () => {
    const req = new Request("https://guesslock.local/api/agent/v1/entities/heroes/1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aliases: ["Valid"], hackerField: "bad" }),
    });
    const result = await readBody(req, EntityPatch);
    expect("res" in result).toBe(true);
    if ("res" in result) {
      expect(result.res.status).toBe(422);
      const data = await result.res.json();
      expect(data.issues.some((i: string) => i.includes("unrecognized_keys") || i.includes("hackerField"))).toBe(true);
    }
  });

  it("validates CategoryCreate constraints", () => {
    expect(CategoryCreate.safeParse({ entity: "hero", label: "Speed", type: "numeric" }).success).toBe(true);
    expect(CategoryCreate.safeParse({ entity: "invalidEntity", label: "Speed" }).success).toBe(false);
    expect(CategoryCreate.safeParse({ entity: "hero", label: "" }).success).toBe(false);
  });

  it("validates SeanceCreate constraints", () => {
    expect(SeanceCreate.safeParse({
      type: "lore",
      label: "The Arcana",
      members: { add: [1, 2, 3] },
    }).success).toBe(true);

    expect(SeanceCreate.safeParse({
      type: "unknown-type",
      label: "The Arcana",
      members: { add: [1] },
    }).success).toBe(false);
  });

  it("validates PuzzleAction constraints", () => {
    expect(PuzzleAction.safeParse({ date: "2026-10-10", action: "regenerate" }).success).toBe(true);
    expect(PuzzleAction.safeParse({ date: "not-a-date", action: "regenerate" }).success).toBe(false);
    expect(PuzzleAction.safeParse({ date: "2026-10-10", action: "destroy" }).success).toBe(false);
  });
});

describe("Agent API Rules & Business Logic", () => {
  it("rejects today and past dates for puzzleAction", async () => {
    await expect(puzzleAction("visage", { date: "2020-01-01", action: "regenerate" }, true)).rejects.toThrow(
      /future dates/
    );

    // Invalid slug
    await expect(puzzleAction("unknown-lock-xyz", { date: "2099-01-01", action: "regenerate" }, true)).rejects.toThrow(
      /Unknown lock/
    );
  });
});
