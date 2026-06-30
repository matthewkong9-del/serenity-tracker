/**
 * DB freshness check — run against the live database to detect stale or
 * stuck data. Meant to be called from `npm run check` or standalone.
 *
 * Usage: npx tsx scripts/check-freshness.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface Issue {
  severity: "ok" | "warn" | "error";
  check: string;
  detail: string;
}

async function main() {
  const issues: Issue[] = [];
  const now = new Date();

  // 1. Newest tweet — is data still flowing?
  const newestTweet = await prisma.tweet.findFirst({
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  if (!newestTweet?.timestamp) {
    issues.push({ severity: "error", check: "Tweet freshness", detail: "No tweets in database at all." });
  } else {
    const daysAgo = Math.floor((now.getTime() - newestTweet.timestamp.getTime()) / 86_400_000);
    if (daysAgo > 14) {
      issues.push({
        severity: "error",
        check: "Tweet freshness",
        detail: `Newest tweet is ${daysAgo} days old. Has the sync pipeline stopped?`,
      });
    } else if (daysAgo > 7) {
      issues.push({
        severity: "warn",
        check: "Tweet freshness",
        detail: `Newest tweet is ${daysAgo} days old. Consider running a sync.`,
      });
    } else {
      issues.push({
        severity: "ok",
        check: "Tweet freshness",
        detail: `Newest tweet is ${daysAgo} days old.`,
      });
    }
  }

  // 2. Stocks missing summaries
  const unsummarized = await prisma.stock.count({
    where: {
      summary: null,
      claims: { some: {} }, // has claims but no summary
    },
  });
  const totalStocks = await prisma.stock.count();
  if (unsummarized > 0) {
    issues.push({
      severity: "warn",
      check: "Missing summaries",
      detail: `${unsummarized}/${totalStocks} stocks have claims but no AI summary. Run "Summarize All" from the home page.`,
    });
  } else {
    issues.push({
      severity: "ok",
      check: "Missing summaries",
      detail: `All ${totalStocks} stocks have summaries (or no claims to summarize).`,
    });
  }

  // 3. Stale summaries — stocks where newer data exists but summary hasn't been refreshed
  const staleSummaries = await prisma.stock.count({
    where: {
      summary: { not: null },
      OR: [
        { lastSummaryAt: null },
        {
          claims: {
            some: {
              createdAt: { gt: new Date(now.getTime() - 14 * 86_400_000) },
            },
          },
        },
      ],
    },
  });
  // Simpler check: count stocks where lastSummaryAt is older than most recent claim
  const stocksWithClaims = await prisma.stock.findMany({
    where: {
      summary: { not: null },
      claims: { some: {} },
    },
    select: {
      ticker: true,
      lastSummaryAt: true,
      claims: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  const staleList: string[] = [];
  for (const s of stocksWithClaims) {
    if (s.lastSummaryAt && s.claims[0]?.createdAt && s.claims[0].createdAt > s.lastSummaryAt) {
      staleList.push(s.ticker);
    }
  }
  if (staleList.length > 0) {
    issues.push({
      severity: "warn",
      check: "Stale summaries",
      detail: `${staleList.length} stocks have new claims since last summary: ${staleList.slice(0, 5).join(", ")}${staleList.length > 5 ? "..." : ""}. Run "Summarize All".`,
    });
  } else {
    issues.push({ severity: "ok", check: "Stale summaries", detail: "All summaries are up to date." });
  }

  // 4. Claims stuck unverified for 7+ days
  const stuckCutoff = new Date(now.getTime() - 7 * 86_400_000);
  const stuckCount = await prisma.claim.count({
    where: {
      status: "unverified",
      createdAt: { lt: stuckCutoff },
    },
  });
  if (stuckCount > 20) {
    issues.push({
      severity: "warn",
      check: "Stuck claims",
      detail: `${stuckCount} claims have been unverified for 7+ days. Run "Verify All" on affected stocks.`,
    });
  } else if (stuckCount > 0) {
    issues.push({
      severity: "ok",
      check: "Stuck claims",
      detail: `${stuckCount} claims stuck unverified for 7+ days — manageable.`,
    });
  } else {
    issues.push({
      severity: "ok",
      check: "Stuck claims",
      detail: "No claims stuck unverified for 7+ days.",
    });
  }

  // 5. Stocks with extraction errors
  const errorStocks = await prisma.stock.findMany({
    where: { extractionError: { not: null } },
    select: { ticker: true, extractionError: true },
  });
  if (errorStocks.length > 0) {
    issues.push({
      severity: "error",
      check: "Extraction errors",
      detail: `${errorStocks.length} stocks have extraction errors. Latest: ${errorStocks[0].ticker} — "${errorStocks[0].extractionError?.slice(0, 80)}"`,
    });
  } else {
    issues.push({ severity: "ok", check: "Extraction errors", detail: "No extraction errors." });
  }

  // 6. Low-confidence claims (from extraction self-scoring)
  const lowConfCount = await prisma.claim.count({
    where: { extractionConfidence: { lte: 2 } },
  });
  if (lowConfCount > 10) {
    issues.push({
      severity: "warn",
      check: "Low-confidence claims",
      detail: `${lowConfCount} claims have extraction confidence ≤ 2. Review these on the claims page.`,
    });
  } else if (lowConfCount > 0) {
    issues.push({
      severity: "ok",
      check: "Low-confidence claims",
      detail: `${lowConfCount} low-confidence claims (≤ 2) — spot-check recommended.`,
    });
  } else {
    issues.push({
      severity: "ok",
      check: "Low-confidence claims",
      detail: "No low-confidence claims (or not yet scored).",
    });
  }

  // Print results
  console.log("\n🔍 DB Freshness Check\n");
  const pad = (s: string, len: number) => s + " ".repeat(Math.max(0, len - s.length));

  const icons: Record<string, string> = { ok: "✅", warn: "⚠️", error: "❌" };

  for (const issue of issues) {
    console.log(`  ${icons[issue.severity]}  ${pad(issue.check, 24)} ${issue.detail}`);
  }

  console.log("");

  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warn");

  if (hasErrors) {
    console.log("❌  Errors found — action needed.\n");
    process.exit(1);
  } else if (hasWarnings) {
    console.log("⚠️   Warnings only — things to keep an eye on.\n");
    process.exit(0);
  } else {
    console.log("✅  All checks passed. Data is fresh and healthy.\n");
    process.exit(0);
  }
}

main()
  .catch((e) => {
    console.error("Freshness check failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
