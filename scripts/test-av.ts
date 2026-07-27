/**
 * Standalone test: verify Alpha Vantage OVERVIEW works for international tickers.
 * Run: npx tsx scripts/test-av.ts
 */

import { fetchStockMetrics } from "../src/lib/alphavantage";

// Test a few international tickers with known suffix mappings
const TESTS = [
  { ticker: "SHA.DE", sector: "Automotive / Industrial" },    // Germany → .DEX
  { ticker: "IQE.L", sector: "Semiconductors (Epiwafers)" },  // UK → .LON
  { ticker: "005930.KS", sector: "Semiconductors / Electronics" }, // Korea → .KS
  { ticker: "000660.KS", sector: "Semiconductors (Memory)" },      // Korea → .KS
];

async function main() {
  console.log("Testing Alpha Vantage OVERVIEW endpoint...\n");

  for (const { ticker, sector } of TESTS) {
    console.log(`=== ${ticker} (sector: ${sector}) ===`);
    try {
      const result = await fetchStockMetrics(ticker, sector);
      console.log(`  marketCap: ${result.marketCap}`);
      console.log(`  pbRatio: ${result.pbRatio}`);
      console.log(`  peRatio: ${result.peRatio}`);
    } catch (e: any) {
      console.log(`  ERROR: ${e.message}`);
    }
    console.log();
    // Rate limit: 5 calls/min = 1 per 12s
    await new Promise((r) => setTimeout(r, 13_000));
  }

  console.log("Done.");
}

main();
