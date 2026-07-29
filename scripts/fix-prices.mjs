import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Prices from Yahoo Finance (local currency)
const FIXES = [
  { dbTicker: 'SAMSUNG', price: 208500, currency: 'KRW' },
  { dbTicker: 'SK HYNIX', price: 1401000, currency: 'KRW' },
  { dbTicker: 'LPKF', price: 13.55, currency: 'EUR' },
  { dbTicker: '002463', price: 105.25, currency: 'CNY' },
  { dbTicker: 'HPS.A', price: 226.25, currency: 'CAD' },
];

// Approximate USD conversions (Aug 2026 rough rates)
const FX = {
  KRW: 0.00072,  // 1 KRW ≈ $0.00072
  EUR: 1.10,     // 1 EUR ≈ $1.10
  CNY: 0.14,     // 1 CNY ≈ $0.14
  CAD: 0.74,     // 1 CAD ≈ $0.74
};

for (const fix of FIXES) {
  const usdApprox = Math.round(fix.price * (FX[fix.currency] || 1) * 100) / 100;
  await prisma.stock.update({
    where: { ticker: fix.dbTicker },
    data: {
      currentPrice: fix.price,
      lastPriceUpdated: new Date(),
    },
  });
  console.log(`✅ ${fix.dbTicker}: ${fix.currency} ${fix.price.toLocaleString()} (~$${usdApprox} USD)`);
}

await prisma.$disconnect();
