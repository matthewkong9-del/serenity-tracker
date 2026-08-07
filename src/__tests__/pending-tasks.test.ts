import { describe, it, expect } from "vitest";
import { backoffMs, MAX_ATTEMPTS } from "@/lib/pending-tasks";

describe("backoffMs", () => {
  it("returns the retry schedule 60s → 5min → 20min (slower recovery after 3-min timeouts)", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(300_000);
    expect(backoffMs(3)).toBe(1_200_000);
  });

  it("clamps to the largest step beyond the table", () => {
    expect(backoffMs(4)).toBe(1_200_000);
    expect(backoffMs(100)).toBe(1_200_000);
  });

  it("falls back to the largest step for non-positive attempts", () => {
    expect(backoffMs(0)).toBe(1_200_000);
  });
});

describe("MAX_ATTEMPTS", () => {
  it("is 3 — a task dead-letters after three failures", () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });
});
