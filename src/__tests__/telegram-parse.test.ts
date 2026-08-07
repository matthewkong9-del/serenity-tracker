import { describe, it, expect } from "vitest";
import { parseResearchCommand } from "@/lib/telegram";

const pending = [
  { index: 1, claimId: 101 },
  { index: 2, claimId: 102 },
  { index: 3, claimId: 103 },
];

describe("parseResearchCommand", () => {
  it('recognizes "review" — digest of claims awaiting a human verdict', () => {
    expect(parseResearchCommand("review", pending)).toEqual({
      claimIds: [],
      depth: "quick",
      action: "review",
    });
  });

  it('recognizes "REVIEW" (case-insensitive, trimmed)', () => {
    expect(parseResearchCommand("  REVIEW ", pending).action).toBe("review");
  });

  it("keeps existing commands working", () => {
    expect(parseResearchCommand("skip", pending).action).toBe("skip");
    expect(parseResearchCommand("research all", pending)).toEqual({
      claimIds: [101, 102, 103],
      depth: "deep",
      action: "research",
    });
    expect(parseResearchCommand("1 2", pending)).toEqual({
      claimIds: [101, 102],
      depth: "deep",
      action: "research",
    });
    expect(parseResearchCommand("deep 3", pending)).toEqual({
      claimIds: [103],
      depth: "deep",
      action: "research",
    });
  });
});
