/**
 * Standalone summarization runner — processes all stale stocks directly
 * without the HTTP timeout issue. Run this from the project root:
 *   node scripts/summarize-all.mjs
 *
 * Each stock: summarizeStock() → runExtractions() → generateNarrative()
 * Progress logged every 10 stocks.
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Dynamic imports for ESM compat with TypeScript modules
const { summarizeStock, needsSummary } = await import('../src/lib/summarize.ts');
const { runExtractions } = await import('../src/lib/relationships.ts');
const { generateNarrative } = await import('../src/lib/narrative.ts');

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('DEEPSEEK_API_KEY not set');
  process.exit(1);
}

const stocks = await prisma.stock.findMany({
  include: { files: true, notes: true, claims: true },
});

const stale = stocks.filter(needsSummary);
console.log(`${stale.length} of ${stocks.length} stocks need summarization\n`);

let done = 0;
let skipped = 0;
const startTime = Date.now();

for (const s of stale) {
  try {
    await summarizeStock(s.ticker, apiKey);
    await runExtractions(s.ticker, apiKey).catch(() => {});
    await generateNarrative(s.ticker, apiKey).catch(() => {});
    done++;
  } catch (e) {
    if (e.message === "No content to summarize. Add tweets, files, or notes first.") {
      skipped++;
    } else {
      console.error(`  ❌ ${s.ticker}: ${e.message}`);
      skipped++;
    }
  }

  if ((done + skipped) % 10 === 0) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const remaining = stale.length - done - skipped;
    const rate = (done + skipped) / elapsed;
    const eta = rate > 0 ? Math.round(remaining / rate / 60) : '?';
    console.log(`  ${done}/${stale.length} done, ${skipped} skipped, ${remaining} remain — ${elapsed}s elapsed, ~${eta}min ETA`);
  }
}

const totalSec = Math.round((Date.now() - startTime) / 1000);
console.log(`\n✅ Done! ${done} summarized, ${skipped} skipped in ${Math.floor(totalSec/60)}m${totalSec%60}s`);

await prisma.$disconnect();
