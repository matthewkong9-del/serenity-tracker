/**
 * Debug test: see what Alpha Vantage actually returns.
 * Run: npx tsx scripts/test-av-debug.ts
 */

const AV_KEY = "4CID9Z52WSSJ8L4U";

async function testSymbol(symbol: string, label: string) {
  console.log(`\n=== ${label}: ${symbol} ===`);
  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`
    );
    console.log(`  HTTP ${res.status}`);
    const text = await res.text();
    console.log(`  Response: ${text.slice(0, 300)}`);
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }
}

async function main() {
  // Test different symbol formats for Samsung (Korea)
  await testSymbol("005930.KS", "Samsung .KS");
  await new Promise(r => setTimeout(r, 13_000));

  await testSymbol("005930", "Samsung bare");
  await new Promise(r => setTimeout(r, 13_000));

  // Test German format variations
  await testSymbol("SHA.DEX", "Schaeffler .DEX (Alpha Vantage format)");
  await new Promise(r => setTimeout(r, 13_000));

  await testSymbol("SHA.DE", "Schaeffler .DE");
  await new Promise(r => setTimeout(r, 13_000));

  // Test US stock for comparison (should work)
  await testSymbol("NVDA", "NVDA (US — should work)");

  console.log("\nDone.");
}

main();
