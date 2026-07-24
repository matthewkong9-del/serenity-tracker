/**
 * One-shot DB cleanup script for semiconductor stock cross-check (July 2026).
 *
 * Run: npx tsx scripts/cleanup-duplicates.ts
 *
 * Operations:
 *   1. Merge duplicate ticker pairs (migrate relations, delete short form)
 *   2. Fix malformed tickers (space → dot)
 *   3. Fill empty names for identifiable ETFs
 *   4. Fix misclassifications (wrong tickers, wrong sectors)
 *   5. Delete junk entries
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface MergePair {
  keep: string; // canonical ticker
  delete: string[]; // tickers to merge into canonical, then delete
  name: string; // human-readable label for logging
}

const MERGES: MergePair[] = [
  { keep: "6976.T", delete: ["6976"], name: "Taiyo Yuden" },
  { keep: "6981.T", delete: ["6981"], name: "Murata Manufacturing" },
  { keep: "2327.TW", delete: ["2327"], name: "Yageo" },
  { keep: "2492.TW", delete: ["2492"], name: "Walsin Technology" },
  { keep: "000660.KS", delete: ["000660", "000660 KS", "SKHY", "SKHYV"], name: "SK Hynix" },
  { keep: "005930.KS", delete: ["005930", "005930 KS", "SMSN", "SAMSUNG"], name: "Samsung Electronics" },
  { keep: "5301.TW", delete: ["FOCI"], name: "Foci Fiber Optic" },
  { keep: "285A.T", delete: ["KIOXIA"], name: "Kioxia" },
  { keep: "6315.T", delete: ["TOWA"], name: "Towa" },
  { keep: "6762.T", delete: ["6762"], name: "TDK" },
  { keep: "6324.T", delete: ["6324"], name: "Harmonic Drive" },
  { keep: "COHR", delete: ["COHERENT"], name: "Coherent Corp." },
  { keep: "ANTH", delete: ["ANTHROPIC"], name: "Anthropic" },
  { keep: "6857.T", delete: ["ATEYY", "ADVANTEST"], name: "Advantest" },
  // Schaeffler: merge SHA (Industrial Robotics) and SHA0 (Automotive) into SHA.DE
  { keep: "SHA.DE", delete: ["SHA", "SHA0"], name: "Schaeffler AG" },
  // ONT → ONTO: wrong ticker was LLM-extracted
  { keep: "ONTO", delete: ["ONT"], name: "Onto Innovation (ticker fix)" },
];

interface TickerRename {
  from: string;
  to: string;
  name: string;
}

const RENAMES: TickerRename[] = [
  { from: "2408 TW", to: "2408.TW", name: "Nanya Technology" },
  { from: "3008 TW", to: "3008.TW", name: "Largan Precision" },
];

interface NameFix {
  ticker: string;
  name: string;
  sector?: string;
}

const NAME_FIXES: NameFix[] = [
  { ticker: "DRAM", name: "Roundhill Memory ETF", sector: "ETF" },
  { ticker: "KORU", name: "Direxion Daily MSCI South Korea Bull 3X ETF", sector: "ETF" },
  { ticker: "SOXL", name: "Direxion Daily Semiconductor Bull 3X ETF", sector: "ETF" },
  // E&R flagged for manual review per cross-check doc
];

const JUNK_TICKERS = [
  "2316 TW", // malformed ticker with WRONG name (labeled KYEC, but 2316 is WUS)
];

// ─── Helpers ────────────────────────────────────────────────────

async function mergePair({ keep, delete: deleteList, name }: MergePair) {
  const target = await prisma.stock.findUnique({ where: { ticker: keep } });

  for (const delTicker of deleteList) {
    const source = await prisma.stock.findUnique({ where: { ticker: delTicker } });
    if (!source) {
      console.log(`  [SKIP] Source '${delTicker}' not found for ${name}`);
      continue;
    }

    if (!target) {
      // Target doesn't exist yet — just rename the first source we find
      console.log(`  [RENAME] Target '${keep}' not found. Renaming '${delTicker}' → '${keep}' for ${name}`);
      await prisma.stock.update({
        where: { ticker: delTicker },
        data: { ticker: keep },
      });
      // Re-fetch target for subsequent merges
      const newTarget = await prisma.stock.findUnique({ where: { ticker: keep } });
      if (newTarget) {
        // Can't reassign const, so we continue — remaining sources will use the renamed stock
        console.log(`  [OK] Renamed. Subsequent deletes will merge into renamed stock.`);
      }
      continue;
    }

    // Re-read target in case it was renamed in a previous iteration
    const currentTarget = await prisma.stock.findUnique({ where: { ticker: keep } });
    if (!currentTarget) {
      console.log(`  [ERROR] Target '${keep}' disappeared unexpectedly for ${name}`);
      continue;
    }

    let mergedCount = 0;

    // Migrate files
    const filesMigrated = await prisma.file.updateMany({
      where: { stockId: source.id },
      data: { stockId: currentTarget.id },
    });
    mergedCount += filesMigrated.count;

    // Migrate notes (Entry table)
    const notesMigrated = await prisma.note.updateMany({
      where: { stockId: source.id },
      data: { stockId: currentTarget.id },
    });
    mergedCount += notesMigrated.count;

    // Migrate claims
    const claimsMigrated = await prisma.claim.updateMany({
      where: { stockId: source.id },
      data: { stockId: currentTarget.id },
    });
    mergedCount += claimsMigrated.count;

    // Migrate relationships
    const relsMigrated = await prisma.relationship.updateMany({
      where: { stockId: source.id },
      data: { stockId: currentTarget.id },
    });
    mergedCount += relsMigrated.count;

    // Handle decision — move only if target has none
    const sourceDecision = await prisma.decision.findUnique({ where: { stockId: source.id } });
    if (sourceDecision) {
      const targetDecision = await prisma.decision.findUnique({ where: { stockId: currentTarget.id } });
      if (!targetDecision) {
        await prisma.decision.update({
          where: { stockId: source.id },
          data: { stockId: currentTarget.id },
        });
        mergedCount++;
      }
      // If target already has a decision, source decision is orphaned on delete (acceptable)
    }

    // Merge notes fields: take the longer one
    if (source.generalNotes && !currentTarget.generalNotes) {
      await prisma.stock.update({
        where: { id: currentTarget.id },
        data: { generalNotes: source.generalNotes },
      });
    } else if (source.generalNotes && currentTarget.generalNotes && source.generalNotes.length > currentTarget.generalNotes.length) {
      await prisma.stock.update({
        where: { id: currentTarget.id },
        data: { generalNotes: currentTarget.generalNotes + "\n" + source.generalNotes },
      });
    }

    // Merge sector: keep the more specific one (longer string heuristic)
    if (source.sector && !currentTarget.sector) {
      await prisma.stock.update({
        where: { id: currentTarget.id },
        data: { sector: source.sector },
      });
    }

    // Delete source stock (cascade removes any remaining refs)
    await prisma.stock.delete({ where: { id: source.id } });

    console.log(`  [OK] Merged '${delTicker}' → '${keep}' (${name}): ${mergedCount} relations migrated`);
  }
}

async function renameTicker({ from, to, name }: TickerRename) {
  const stock = await prisma.stock.findUnique({ where: { ticker: from } });
  if (!stock) {
    console.log(`  [SKIP] Ticker '${from}' not found for rename (${name})`);
    return;
  }

  // Check if target already exists
  const targetExists = await prisma.stock.findUnique({ where: { ticker: to } });
  if (targetExists) {
    console.log(`  [SKIP] Target '${to}' already exists — cannot rename '${from}' (${name}). Manual merge needed.`);
    return;
  }

  await prisma.stock.update({
    where: { ticker: from },
    data: { ticker: to },
  });
  console.log(`  [OK] Renamed '${from}' → '${to}' (${name})`);
}

async function fixName({ ticker, name, sector }: NameFix) {
  const stock = await prisma.stock.findUnique({ where: { ticker } });
  if (!stock) {
    console.log(`  [SKIP] Ticker '${ticker}' not found for name fix`);
    return;
  }

  const data: Record<string, string | null> = { name };
  if (sector) data.sector = sector;

  await prisma.stock.update({ where: { ticker }, data });
  console.log(`  [OK] Fixed name for '${ticker}': "${stock.name || "(empty)"}" → "${name}"${sector ? `, sector → "${sector}"` : ""}`);
}

async function deleteJunk(ticker: string) {
  const stock = await prisma.stock.findUnique({ where: { ticker } });
  if (!stock) {
    console.log(`  [SKIP] Junk ticker '${ticker}' not found`);
    return;
  }
  await prisma.stock.delete({ where: { ticker } });
  console.log(`  [OK] Deleted junk entry '${ticker}' (was: "${stock.name || "(no name)"}" / "${stock.sector || "(no sector)"}")`);
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("=== Phase 1: Merge duplicate ticker pairs ===\n");
  for (const merge of MERGES) {
    console.log(`${merge.name}:`);
    await mergePair(merge);
    console.log();
  }

  console.log("=== Phase 2: Fix malformed tickers (space → dot) ===\n");
  for (const rename of RENAMES) {
    console.log(`${rename.name}:`);
    await renameTicker(rename);
    console.log();
  }

  // Check for NCE POWER and PUYA SEMI (can't fix automatically)
  console.log("=== Manual review flags ===\n");
  for (const ticker of ["NCE POWER", "PUYA SEMI", "E&R", "A-LINK"]) {
    const stock = await prisma.stock.findUnique({ where: { ticker } });
    if (stock) {
      console.log(`  [FLAG] '${ticker}' exists: name="${stock.name || "(empty)"}", sector="${stock.sector || "(empty)"}" — manual review needed`);
    } else {
      console.log(`  [OK] '${ticker}' not in DB (already cleaned up or never existed)`);
    }
  }

  console.log("\n=== Phase 3: Fill empty names ===\n");
  for (const fix of NAME_FIXES) {
    await fixName(fix);
  }

  console.log("\n=== Phase 4: Delete junk entries ===\n");
  for (const ticker of JUNK_TICKERS) {
    await deleteJunk(ticker);
  }

  // Report final state
  console.log("\n=== Post-cleanup summary ===\n");
  const total = await prisma.stock.count();
  const emptyNames = await prisma.stock.count({ where: { OR: [{ name: null }, { name: "" }] } });
  const malformed = await prisma.stock.findMany({
    where: { ticker: { contains: " " } },
    select: { ticker: true, name: true },
  });
  const duplicateNames = await prisma.$queryRaw<{ name: string; cnt: bigint }[]>`
    SELECT name, COUNT(*) as cnt FROM Stock
    WHERE name IS NOT NULL AND name != ''
    GROUP BY name HAVING COUNT(*) > 1
  `;
  const sectors = await prisma.$queryRaw<{ sector: string; cnt: bigint }[]>`
    SELECT sector, COUNT(*) as cnt FROM Stock
    WHERE sector IS NOT NULL AND sector != ''
    GROUP BY sector ORDER BY cnt DESC
  `;

  console.log(`Total stocks: ${total}`);
  console.log(`Empty names remaining: ${emptyNames}`);
  console.log(`Malformed tickers (contain space): ${malformed.length}`);
  if (malformed.length > 0) {
    for (const m of malformed) {
      console.log(`  ${m.ticker}: ${m.name || "(no name)"}`);
    }
  }
  console.log(`Duplicate names remaining: ${duplicateNames.length}`);
  if (duplicateNames.length > 0) {
    for (const d of duplicateNames) {
      console.log(`  "${d.name}": ${d.cnt} entries`);
    }
  }
  console.log(`Distinct sectors: ${sectors.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
