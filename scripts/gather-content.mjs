/**
 * Content coverage batch runner.
 *
 * Gathers web-sourced company information for stocks that have zero content
 * (no tweets/claims, files, or notes). These stocks can never be summarized
 * without some seed data — this script fills that gap.
 *
 * Usage:  npx tsx scripts/gather-content.mjs [--limit N] [--dry-run]
 *
 * Excludes Private/Pre-IPO and ETF stocks (web search won't find useful data).
 * Target: make 50+ stocks actionable for the orchestrator summarizer.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Parse CLI flags
const args = process.argv.slice(2);
const limit = parseInt(args[args.indexOf("--limit") + 1] || "0", 10) || 0;
const dryRun = args.includes("--dry-run");

// Dynamic import for TypeScript modules (ESM compat)
const { gatherStockContent } = await import("../src/lib/content-gather.ts");

const CONCURRENCY = 3;

console.log("🔍 Finding empty stocks...\n");

// Find stocks with zero content (no claims, files, or notes).
// Exclude Private/Pre-IPO and ETFs — web search won't find useful data.
const stocks = await prisma.stock.findMany({
  where: {
    id: {
      notIn: (
        await prisma.claim.findMany({ select: { stockId: true }, distinct: ["stockId"] })
      ).map((c) => c.stockId),
    },
    files: { none: {} },
    notes: { none: {} },
    sector: {
      notIn: ["Private / Pre-IPO", "ETF"],
    },
  },
  select: { ticker: true, name: true, sector: true },
  orderBy: { ticker: "asc" },
});

console.log(`Found ${stocks.length} empty stocks (excluding Private/Pre-IPO and ETFs)`);

if (limit > 0 && stocks.length > limit) {
  console.log(`Limiting to first ${limit} stocks (--limit ${limit})`);
  stocks.length = limit;
}

if (dryRun) {
  console.log("\n🏁 DRY RUN — would process these stocks:\n");
  for (const s of stocks) {
    console.log(`  ${s.ticker.padEnd(14)} ${s.name.padEnd(45)} [${s.sector}]`);
  }
  console.log(`\n${stocks.length} stocks would be processed.`);
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`Processing ${stocks.length} stocks (concurrency=${CONCURRENCY})...\n`);

// ── Run with concurrency ────────────────────────────────────────────────────

const queue = [...stocks];
let done = 0;
let succeeded = 0;
let failed = 0;
const startTime = Date.now();
let totalChars = 0;

async function worker(id) {
  while (queue.length > 0) {
    const stock = queue.shift();
    if (!stock) break;

    try {
      const result = await gatherStockContent(stock.ticker, stock.name);
      done++;
      if (result.saved) {
        succeeded++;
        totalChars += result.totalChars;
      } else {
        failed++;
      }
    } catch (e) {
      done++;
      failed++;
      console.error(`  ❌ ${stock.ticker}: ${e.message}`);
    }

    // Progress every 10 stocks
    if (done % 10 === 0 || done === stocks.length) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const remaining = stocks.length - done;
      const rate = done / elapsed;
      const eta = rate > 0 ? Math.round(remaining / rate / 60) : "?";
      const avgChars = succeeded > 0 ? Math.round(totalChars / succeeded) : 0;
      console.log(
        `  📊 ${done}/${stocks.length} | ✅ ${succeeded} | ❌ ${failed} | ⏱ ${elapsed}s | ETA ~${eta}min | avg ${avgChars.toLocaleString()} chars/stock`
      );
    }
  }
}

const workers = Array.from({ length: Math.min(CONCURRENCY, stocks.length) }, (_, i) =>
  worker(i + 1)
);
await Promise.all(workers);

// ── Summary ──────────────────────────────────────────────────────────────────

const totalSec = Math.round((Date.now() - startTime) / 1000);
console.log(
  `\n✅ Done! ${succeeded} stocks now have content, ${failed} failed in ${Math.floor(totalSec / 60)}m${totalSec % 60}s`
);

if (succeeded > 0) {
  console.log(
    `\n📝 ${succeeded} stocks are now actionable — the orchestrator will pick them up for summarization.`
  );
  console.log(
    `   Total content gathered: ${totalChars.toLocaleString()} characters across ${succeeded} stocks.`
  );
}

await prisma.$disconnect();
