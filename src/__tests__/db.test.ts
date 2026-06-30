import { describe, it, expect } from "vitest";
import { parseStance, formatBytes, timeAgo } from "@/lib/db";

describe("parseStance", () => {
  it("extracts Bullish from summary", () => {
    const summary = "**Current Stance**: Bullish\n\nConfidence: high";
    expect(parseStance(summary)).toBe("Bullish");
  });

  it("extracts Bearish from summary", () => {
    const summary = "**Current Stance:** Bearish - the thesis is weakening";
    expect(parseStance(summary)).toBe("Bearish");
  });

  it("extracts Neutral from summary", () => {
    const summary = "**Current Stance:** Neutral\nReason: mixed signals";
    expect(parseStance(summary)).toBe("Neutral");
  });

  it("handles alternate format with asterisks", () => {
    const summary = "**Stance:** *Bullish* — strong conviction";
    expect(parseStance(summary)).toBe("Bullish");
  });

  it("returns null for empty string", () => {
    expect(parseStance("")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(parseStance(null)).toBeNull();
  });

  it("returns null when stance not found", () => {
    expect(parseStance("Just a random summary with no stance")).toBeNull();
  });

  it("handles lowercase stance text", () => {
    const summary = "**Current Stance**: bullish";
    expect(parseStance(summary)).toBe("Bullish");
  });
});

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats KB", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats MB", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("formats GB", () => {
    expect(formatBytes(3.2 * 1024 * 1024 * 1024)).toBe("3.2 GB");
  });
});

describe("timeAgo", () => {
  it('returns "just now" for seconds ago', () => {
    const d = new Date(Date.now() - 30 * 1000);
    expect(timeAgo(d)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const d = new Date(Date.now() - 5 * 60 * 1000);
    expect(timeAgo(d)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(timeAgo(d)).toBe("3h ago");
  });

  it("returns days ago", () => {
    const d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(timeAgo(d)).toBe("2d ago");
  });

  it("returns months ago", () => {
    const d = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    expect(timeAgo(d)).toBe("1mo ago");
  });

  it("accepts string dates", () => {
    const d = new Date(Date.now() - 60 * 60 * 1000);
    expect(timeAgo(d.toISOString())).toBe("1h ago");
  });
});
