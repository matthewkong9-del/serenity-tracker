/**
 * One-shot DB cleanup script for semiconductor stock cross-check (July 2026).
 * Run: node scripts/cleanup-duplicates.js
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const MERGES = [
  { keep: "6976.T", del: ["6976"], name: "Taiyo Yuden" },
  { keep: "6981.T", del: ["6981"], name: "Murata Manufacturing" },
  { keep: "2327.TW", del: ["2327"], name: "Yageo" },
  { keep: "2492.TW", del: ["2492"], name: "Walsin Technology" },
  { keep: "000660.KS", del: ["000660", "000660 KS", "SKHY", "SKHYV"], name: "SK Hynix" },
  { keep: "005930.KS", del: ["005930", "005930 KS", "SMSN", "SAMSUNG"], name: "Samsung Electronics" },
  { keep: "5301.TW", del: ["FOCI"], name: "Foci Fiber Optic" },
  { keep: "285A.T", del: ["KIOXIA"], name: "Kioxia" },
  { keep: "6315.T", del: ["TOWA"], name: "Towa" },
  { keep: "6762.T", del: ["6762"], name: "TDK" },
  { keep: "6324.T", del: ["6324"], name: "Harmonic Drive" },
  { keep: "COHR", del: ["COHERENT"], name: "Coherent Corp." },
  { keep: "ANTH", del: ["ANTHROPIC"], name: "Anthropic" },
  { keep: "6857.T", del: ["ATEYY", "ADVANTEST"], name: "Advantest" },
  { keep: "SHA.DE", del: ["SHA", "SHA0"], name: "Schaeffler AG" },
  { keep: "ONTO", del: ["ONT"], name: "Onto Innovation (ticker fix)" },
  { keep: "6830.TW", del: ["MSSCORP"], name: "Msscorps (ticker fix)" },
  { keep: "2513.HK", del: ["ZHIPU"], name: "Zhipu AI (IPO ticker fix)" },
  { keep: "LPKF", del: ["LPK"], name: "LPKF Laser (ticker fix)" },
  { keep: "SIVE", del: ["SIVEF"], name: "Sivers Semiconductors (ticker fix)" },
  // Task 2: additional orphan merges
  { keep: "MTSI", del: ["MACOM"], name: "MACOM → MTSI" },
  { keep: "TSEM", del: ["TOWER"], name: "Tower Semi → TSEM" },
  { keep: "3105.TW", del: ["WIN"], name: "Win Semi → 3105.TW" },
  { keep: "LITE", del: ["LUMENTUM"], name: "Lumentum → LITE" },
  { keep: "4004.T", del: ["RESONAC", "4004"], name: "Resonac → 4004.T" },
  { keep: "2337.TW", del: ["MACRONIX", "2337"], name: "Macronix → 2337.TW" },
  { keep: "2344.TW", del: ["WINBOND", "2344"], name: "Winbond → 2344.TW" },
  { keep: "6146.T", del: ["DISCO"], name: "Disco → 6146.T" },
  { keep: "300308.SZ", del: ["INNOLIGHT"], name: "Innolight → 300308.SZ" },
  { keep: "CRWV", del: ["CRVW"], name: "CoreWeave typo fix (CRVW→CRWV)" },
  // Bare ticker → proper suffixed form (same company, same name)
  { keep: "6996.T", del: ["6996"], name: "Nichicon → 6996.T" },
  { keep: "6997.T", del: ["6997"], name: "Nippon Chemi-Con → 6997.T" },
  { keep: "6999.T", del: ["6999"], name: "KOA → 6999.T" },
  { keep: "6963.T", del: ["6963"], name: "Rohm → 6963.T" },
  { keep: "6268.T", del: ["6268"], name: "Nabtesco → 6268.T" },
  { keep: "5706.T", del: ["5706"], name: "Mitsui Mining → 5706.T" },
  { keep: "093370.KS", del: ["093370"], name: "Foosung → 093370.KS" },
  { keep: "010690.KS", del: ["010690"], name: "Hwashin → 010690.KS" },
  { keep: "012330.KS", del: ["012330"], name: "Hyundai Mobis → 012330.KS" },
  { keep: "307950.KS", del: ["307950"], name: "Hyundai Autoever → 307950.KS" },
  { keep: "373220.KS", del: ["373220"], name: "LG Energy → 373220.KS" },
  { keep: "2356.TW", del: ["INVENTEC"], name: "Inventec → 2356.TW" },
  { keep: "300476.SZ", del: ["300476"], name: "Victory Giant → 300476.SZ" },
  { keep: "4958.TW", del: ["4958"], name: "Zhen Ding → 4958.TW" },
  { keep: "2313.TW", del: ["2313"], name: "Compeq → 2313.TW" },
  { keep: "6787.TW", del: ["6787"], name: "Meiko → 6787.TW" },
  { keep: "2368.TW", del: ["2368"], name: "GCE → 2368.TW" },
  { keep: "2383.TW", del: ["2383"], name: "Elite Material → 2383.TW" },
  { keep: "600183.SS", del: ["600183"], name: "Shengyi → 600183.SS" },
  { keep: "6274.TW", del: ["6274"], name: "TUC → 6274.TW" },
  { keep: "6213.TW", del: ["6213"], name: "ITEQ → 6213.TW" },
  { keep: "1303.TW", del: ["1303"], name: "Nan Ya → 1303.TW" },
  { keep: "688017.SS", del: ["688017"], name: "LeaderDrive → 688017.SS" },
  { keep: "300394.SZ", del: ["300394"], name: "TFC Optical → 300394.SZ" },
  { keep: "278470.KS", del: ["278470"], name: "APR → 278470.KS" },
];

const RENAMES = [
  { from: "E&R", to: "8027.TWO", name: "E&R Engineering (ticker fix)" },
  { from: "NCE POWER", to: "605111.SS", name: "Wuxi NCE Power (ticker fix)" },
  { from: "PUYA SEMI", to: "688766.SS", name: "Puya Semiconductor (ticker fix)" },
  { from: "FORD", to: "F", name: "Ford Motor (ticker fix)" },
  { from: "SILEX", to: "SILEX.ST", name: "Silex Microsystems (exchange suffix)" },
  { from: "HYUNDAI", to: "005380.KS", name: "Hyundai Motor (ticker fix)" },
  { from: "2408 TW", to: "2408.TW", name: "Nanya Technology" },
  { from: "3008 TW", to: "3008.TW", name: "Largan Precision" },
];

const NAME_FIXES = [
  { ticker: "DRAM", name: "Roundhill Memory ETF", sector: "ETF" },
  { ticker: "KORU", name: "Direxion Daily MSCI South Korea Bull 3X ETF", sector: "ETF" },
  { ticker: "SOXL", name: "Direxion Daily Semiconductor Bull 3X ETF", sector: "ETF" },
  // Task 1: fill names after renames (use new tickers)
  { ticker: "8027.TWO", name: "E&R Engineering Corporation", sector: "Semiconductor Equipment" },
  { ticker: "605111.SS", name: "Wuxi NCE Power Co., Ltd.", sector: "Semiconductors (Power/SiC)" },
  { ticker: "688766.SS", name: "Puya Semiconductor (Shanghai) Co., Ltd.", sector: "Semiconductors (Memory)" },
  { ticker: "SILEX.ST", name: "Silex Microsystems AB", sector: "Semiconductors (MEMS Foundry)" },
];

const JUNK_TICKERS = [
  "2316 TW",  // malformed ticker with wrong name (labeled KYEC, but 2316 is WUS)
  "A-LINK",   // Task 1: unresolvable, not a real semiconductor company
  "2802",     // Task 2: resolves to HK covered-call ETF, not a chip company
];

async function mergePair({ keep, del, name }) {
  let target = await prisma.stock.findUnique({ where: { ticker: keep } });

  for (const delTicker of del) {
    const source = await prisma.stock.findUnique({ where: { ticker: delTicker } });
    if (!source) {
      console.log(`  [SKIP] Source '${delTicker}' not found for ${name}`);
      continue;
    }

    if (!target) {
      console.log(`  [RENAME] Target '${keep}' missing. Renaming '${delTicker}' → '${keep}' for ${name}`);
      await prisma.stock.update({ where: { ticker: delTicker }, data: { ticker: keep } });
      target = await prisma.stock.findUnique({ where: { ticker: keep } });
      continue;
    }

    // Re-read target to handle renames from prior iterations
    target = await prisma.stock.findUnique({ where: { ticker: keep } });
    if (!target) { console.log(`  [ERROR] Target '${keep}' disappeared`); continue; }

    let n = 0;
    const fid = await prisma.file.updateMany({ where: { stockId: source.id }, data: { stockId: target.id } });
    n += fid.count;
    const eid = await prisma.note.updateMany({ where: { stockId: source.id }, data: { stockId: target.id } });
    n += eid.count;
    const cid = await prisma.claim.updateMany({ where: { stockId: source.id }, data: { stockId: target.id } });
    n += cid.count;
    const rid = await prisma.relationship.updateMany({ where: { stockId: source.id }, data: { stockId: target.id } });
    n += rid.count;

    // Move decision if target has none
    const srcDec = await prisma.decision.findUnique({ where: { stockId: source.id } });
    if (srcDec) {
      const tgtDec = await prisma.decision.findUnique({ where: { stockId: target.id } });
      if (!tgtDec) {
        await prisma.decision.update({ where: { stockId: source.id }, data: { stockId: target.id } });
        n++;
      }
    }

    // Merge notes: append source notes to target if target has none or source has more
    if (source.generalNotes) {
      if (!target.generalNotes) {
        await prisma.stock.update({ where: { id: target.id }, data: { generalNotes: source.generalNotes } });
      } else if (source.generalNotes.length > target.generalNotes.length) {
        await prisma.stock.update({ where: { id: target.id }, data: { generalNotes: target.generalNotes + "\n" + source.generalNotes } });
      }
    }

    if (source.sector && !target.sector) {
      await prisma.stock.update({ where: { id: target.id }, data: { sector: source.sector } });
    }

    await prisma.stock.delete({ where: { id: source.id } });
    console.log(`  [OK] Merged '${delTicker}' → '${keep}' (${name}): ${n} relations`);
  }
}

async function main() {
  console.log("=== Phase 1: Merge duplicate ticker pairs ===\n");
  for (const m of MERGES) {
    console.log(`${m.name}:`);
    await mergePair(m);
    console.log();
  }

  console.log("=== Phase 2: Fix malformed tickers ===\n");
  for (const r of RENAMES) {
    const stock = await prisma.stock.findUnique({ where: { ticker: r.from } });
    if (!stock) { console.log(`  [SKIP] '${r.from}' not found (${r.name})`); continue; }
    const exists = await prisma.stock.findUnique({ where: { ticker: r.to } });
    if (exists) { console.log(`  [SKIP] '${r.to}' already exists, can't rename '${r.from}' (${r.name})`); continue; }
    await prisma.stock.update({ where: { ticker: r.from }, data: { ticker: r.to } });
    console.log(`  [OK] Renamed '${r.from}' → '${r.to}' (${r.name})`);
  }

  console.log("\n=== Manual review flags ===\n");
  for (const ticker of ["A-LINK"]) {
    const s = await prisma.stock.findUnique({ where: { ticker } });
    if (s) console.log(`  [FLAG] '${ticker}': name="${s.name || "(empty)"}", sector="${s.sector || "(empty)"}" — manual review`);
    else console.log(`  [OK] '${ticker}' not in DB`);
  }

  console.log("\n=== Phase 3: Fill empty names ===\n");
  for (const f of NAME_FIXES) {
    const s = await prisma.stock.findUnique({ where: { ticker: f.ticker } });
    if (!s) { console.log(`  [SKIP] '${f.ticker}' not found`); continue; }
    const data = { name: f.name };
    if (f.sector) data.sector = f.sector;
    await prisma.stock.update({ where: { ticker: f.ticker }, data });
    console.log(`  [OK] Fixed '${f.ticker}': "${s.name || "(empty)"}" → "${f.name}"`);
  }

  console.log("\n=== Phase 4: Delete junk entries ===\n");
  for (const ticker of JUNK_TICKERS) {
    const s = await prisma.stock.findUnique({ where: { ticker } });
    if (!s) { console.log(`  [SKIP] Junk '${ticker}' not found`); continue; }
    await prisma.stock.delete({ where: { ticker } });
    console.log(`  [OK] Deleted junk '${ticker}' ("${s.name || "(no name)"}")`);
  }

  // Summary
  console.log("\n=== Post-cleanup summary ===\n");
  const total = await prisma.stock.count();
  const emptyNames = await prisma.stock.count({ where: { OR: [{ name: null }, { name: "" }] } });
  const malformed = await prisma.stock.findMany({ where: { ticker: { contains: " " } }, select: { ticker: true, name: true } });
  console.log(`Total stocks: ${total}`);
  console.log(`Empty names: ${emptyNames}`);
  console.log(`Malformed tickers (contain space): ${malformed.length}`);
  for (const m of malformed) console.log(`  ${m.ticker}: ${m.name || "(no name)"}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
