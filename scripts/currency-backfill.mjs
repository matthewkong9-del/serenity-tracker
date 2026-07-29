/**
 * Backfill currency and priceUsd for all stocks with prices.
 * Uses the same exchange detection logic as the updated finnhub.ts module.
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function detectCurrency(ticker) {
  const s = ticker.toUpperCase();
  if (/\.(KS|KQ)$/i.test(s)) return "KRW";
  if (/\.(TW|TWO)$/i.test(s)) return "TWD";
  if (/\.T$/i.test(s)) return "JPY";
  if (/\.HK$/i.test(s)) return "HKD";
  if (/\.(SZ|SS)$/i.test(s)) return "CNY";
  if (/\.(DE|F|PA|MC|MI|SW|AS|BR|VI)$/i.test(s)) return "EUR";
  if (/\.(L|CS|OL|ST)$/i.test(s)) return "GBP";
  if (/\.(TO|V|CN|AT|NE)$/i.test(s)) return "CAD";
  if (/\.(AX|SI|NZ)$/i.test(s)) return "AUD";
  // Known overrides for text names
  const OVERRIDES = { SAMSUNG: "KRW", "SK HYNIX": "KRW", LPKF: "EUR" };
  if (OVERRIDES[ticker]) return OVERRIDES[ticker];
  return "USD";
}

const FX_TO_USD = {
  USD: 1.0, KRW: 0.00072, JPY: 0.0065, TWD: 0.032, CNY: 0.14,
  HKD: 0.128, EUR: 1.10, GBP: 1.27, CAD: 0.74, AUD: 0.67,
};

const stocks = await prisma.stock.findMany({
  where: { currentPrice: { not: null } },
  select: { id: true, ticker: true, currentPrice: true },
});

console.log(`Backfilling ${stocks.length} stocks...`);

for (const s of stocks) {
  const currency = detectCurrency(s.ticker);
  const rate = FX_TO_USD[currency] || 1.0;
  const priceUsd = s.currentPrice != null ? Math.round(s.currentPrice * rate * 100) / 100 : null;

  await prisma.stock.update({
    where: { id: s.id },
    data: { currency, priceUsd },
  });
}

// Verify
const dist = await prisma.stock.groupBy({
  by: ['currency'],
  where: { currentPrice: { not: null } },
  _count: true,
  _avg: { priceUsd: true },
});

console.log('\nCurrency distribution:');
for (const d of dist) {
  console.log(`  ${d.currency || 'USD'}: ${d._count} stocks, avg USD price: $${d._avg?.priceUsd?.toFixed(2)}`);
}

await prisma.$disconnect();
console.log('\nDone!');
