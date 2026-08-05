/**
 * Standalone executive-brief backfill — generates a synthesis for every
 * stock that doesn't have one yet. Run from the project root:
 *
 *   npx tsx scripts/backfill-synthesis.mjs               # all missing briefs
 *   npx tsx scripts/backfill-synthesis.mjs --ticker=NVDA # one stock
 *   npx tsx scripts/backfill-synthesis.mjs --limit=20    # first N only
 *
 * Uses generateSynthesis() from the summarize module — same prompt and
 * flow as the fire-and-forget call after each summarize.
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const { generateSynthesis } = await import('../src/lib/summarize.ts');

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('DEEPSEEK_API_KEY not set');
  process.exit(1);
}

const args = process.argv.slice(2);
const tickerArg = args.find((a) => a.startsWith('--ticker='))?.split('=')[1];
const limitArg = parseInt(
  args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '0',
  10
);

let stocks;
if (tickerArg) {
  stocks = await prisma.stock.findMany({
    where: { ticker: tickerArg.toUpperCase() },
  });
} else {
  stocks = await prisma.stock.findMany({ where: { synthesis: null } });
}
if (limitArg) stocks = stocks.slice(0, limitArg);

console.log(`${stocks.length} stocks to backfill\n`);

let done = 0;
let skipped = 0;
const startTime = Date.now();

for (const s of stocks) {
  try {
    const result = await generateSynthesis(s.ticker, apiKey);
    if (result) {
      done++;
      console.log(`  ✓ ${s.ticker} (${result.length} chars)`);
    } else {
      // null = no content to synthesize, or LLM failed (error already logged
      // internally as "[synthesis] failed for ...")
      skipped++;
      console.log(`  – ${s.ticker}: no content or generation failed`);
    }
  } catch (e) {
    skipped++;
    console.error(`  ❌ ${s.ticker}: ${e.message}`);
  }
}

const mins = ((Date.now() - startTime) / 60000).toFixed(1);
console.log(`\nDone — ${done} briefs generated, ${skipped} skipped in ${mins} min`);
await prisma.$disconnect();
