const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const stocks = [
  // US / Western-Listed
  { ticker: "SIVE", name: "Sivers Semiconductors AB", sector: "Photonics / Optical Components" },
  { ticker: "AAOI", name: "Applied Optoelectronics, Inc.", sector: "Photonics / Optical Components" },
  { ticker: "LITE", name: "Lumentum Holdings Inc.", sector: "Photonics / Optical Components" },
  { ticker: "COHR", name: "Coherent Corp.", sector: "Photonics / Optical Components" },
  { ticker: "POET", name: "POET Technologies Inc.", sector: "Photonics / Optical Components" },
  { ticker: "AXTI", name: "AXT, Inc.", sector: "Semiconductors (Substrates)" },
  { ticker: "IQE", name: "IQE plc", sector: "Semiconductors (Epiwafers)" },
  { ticker: "SOI", name: "Soitec SA", sector: "Semiconductors (Substrates)" },
  { ticker: "TSEM", name: "Tower Semiconductor Ltd.", sector: "Semiconductors (Foundry)" },
  { ticker: "GFS", name: "GlobalFoundries Inc.", sector: "Semiconductors (Foundry)" },
  { ticker: "XFAB", name: "X-FAB Silicon Foundries SE", sector: "Semiconductors (Foundry)" },
  { ticker: "WOLF", name: "Wolfspeed, Inc.", sector: "Semiconductors (Power/SiC)" },
  { ticker: "MTSI", name: "MACOM Technology Solutions Holdings", sector: "Semiconductors" },
  { ticker: "MRVL", name: "Marvell Technology, Inc.", sector: "Semiconductors" },
  { ticker: "ARM", name: "Arm Holdings plc", sector: "Semiconductors (IP)" },
  { ticker: "AVGO", name: "Broadcom Inc.", sector: "Semiconductors" },
  { ticker: "AMD", name: "Advanced Micro Devices, Inc.", sector: "Semiconductors" },
  { ticker: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductors" },
  { ticker: "INTC", name: "Intel Corporation", sector: "Semiconductors" },
  { ticker: "MU", name: "Micron Technology, Inc.", sector: "Semiconductors (Memory)" },
  { ticker: "SNDK", name: "SanDisk Corporation", sector: "Semiconductors (Memory)" },
  { ticker: "SIMO", name: "Silicon Motion Technology Corp.", sector: "Semiconductors (Memory controllers)" },
  { ticker: "ALAB", name: "Astera Labs, Inc.", sector: "Semiconductors (Connectivity)" },
  { ticker: "CBRS", name: "Cerebras Systems Inc.", sector: "AI Infrastructure / Semiconductors" },
  { ticker: "ACMR", name: "ACM Research, Inc.", sector: "Semiconductor Equipment" },
  { ticker: "VECO", name: "Veeco Instruments Inc.", sector: "Semiconductor Equipment" },
  { ticker: "AEHR", name: "Aehr Test Systems", sector: "Semiconductor Equipment (Test/Burn-in)" },
  { ticker: "TER", name: "Teradyne, Inc.", sector: "Semiconductor Equipment (Test)" },
  { ticker: "CAMT", name: "Camtek Ltd.", sector: "Semiconductor Equipment" },
  { ticker: "LPKF", name: "LPKF Laser & Electronics SE", sector: "Laser / Semiconductor Equipment" },
  { ticker: "ALRIB", name: "Riber S.A.", sector: "Semiconductor Equipment (MBE)" },
  { ticker: "VSH", name: "Vishay Intertechnology, Inc.", sector: "Electronic Components" },
  { ticker: "NBIS", name: "Nebius Group N.V.", sector: "Cloud / AI Infrastructure" },
  { ticker: "CRWV", name: "CoreWeave, Inc.", sector: "Cloud / AI Infrastructure" },
  { ticker: "IREN", name: "IREN Limited", sector: "Data Center / AI Cloud" },
  { ticker: "APLD", name: "Applied Digital Corporation", sector: "Data Center / AI Infrastructure" },
  { ticker: "WYFI", name: "WhiteFiber, Inc.", sector: "AI Infrastructure / Data Center" },
  { ticker: "CIFR", name: "Cipher Mining Inc.", sector: "Data Center / Bitcoin Mining" },
  { ticker: "WULF", name: "TeraWulf Inc.", sector: "Data Center / Bitcoin Mining" },
  { ticker: "CLSK", name: "CleanSpark, Inc.", sector: "Bitcoin Mining" },
  { ticker: "BITF", name: "Bitfarms Ltd.", sector: "Bitcoin Mining" },
  { ticker: "SLNH", name: "Soluna Holdings, Inc.", sector: "Data Center / Bitcoin Mining" },
  { ticker: "VRT", name: "Vertiv Holdings Co", sector: "Data Center Infrastructure" },
  { ticker: "JBL", name: "Jabil Inc.", sector: "Electronics Manufacturing Services" },
  { ticker: "RPI", name: "Raspberry Pi Holdings plc", sector: "Computer Hardware" },
  { ticker: "HPS.A", name: "Hammond Power Solutions Inc.", sector: "Electrical Equipment" },
  { ticker: "RKLB", name: "Rocket Lab USA, Inc.", sector: "Aerospace" },
  { ticker: "SPCX", name: "SpaceX", sector: "Aerospace" },
  { ticker: "HOOD", name: "Robinhood Markets, Inc.", sector: "Financial Services" },
  { ticker: "TSM", name: "Taiwan Semiconductor Manufacturing Co.", sector: "Semiconductors (Foundry)" },
  { ticker: "ASML", name: "ASML Holding N.V.", sector: "Semiconductor Equipment" },
  { ticker: "GOOGL", name: "Alphabet Inc.", sector: "Internet / Technology" },
  { ticker: "MSFT", name: "Microsoft Corporation", sector: "Software / Cloud" },
  { ticker: "AMZN", name: "Amazon.com, Inc.", sector: "Internet / Cloud" },
  { ticker: "META", name: "Meta Platforms, Inc.", sector: "Internet / Technology" },
  { ticker: "ORCL", name: "Oracle Corporation", sector: "Software / Cloud" },
  { ticker: "AAPL", name: "Apple Inc.", sector: "Consumer Technology" },
  { ticker: "CSCO", name: "Cisco Systems, Inc.", sector: "Networking" },
  { ticker: "ACN", name: "Accenture plc", sector: "IT Services" },
  { ticker: "SHOP", name: "Shopify Inc.", sector: "E-commerce / Software" },
  { ticker: "TTD", name: "The Trade Desk, Inc.", sector: "Adtech / Software" },
  { ticker: "SNAP", name: "Snap Inc.", sector: "Social Media" },
  { ticker: "RDDT", name: "Reddit, Inc.", sector: "Social Media" },
  // ETFs
  { ticker: "EWY", name: "iShares MSCI South Korea ETF", sector: "ETF" },
  { ticker: "XLU", name: "Utilities Select Sector SPDR Fund", sector: "ETF" },
  // Japan
  { ticker: "6315.T", name: "Towa Corporation", sector: "Semiconductor Equipment" },
  { ticker: "6324.T", name: "Harmonic Drive Systems Inc.", sector: "Precision Motion Control / Robotics" },
  { ticker: "4062.T", name: "Ibiden Co., Ltd.", sector: "IC Packaging Substrates" },
  { ticker: "5801.T", name: "Furukawa Electric Co., Ltd.", sector: "Wire/Cable & Optical" },
  { ticker: "5802.T", name: "Sumitomo Electric Industries, Ltd.", sector: "Wire/Cable & Optical" },
  { ticker: "6503.T", name: "Mitsubishi Electric Corporation", sector: "Electronics / Industrial" },
  { ticker: "6981.T", name: "Murata Manufacturing Co., Ltd.", sector: "Electronic Components (MLCC)" },
  { ticker: "6976.T", name: "Taiyo Yuden Co., Ltd.", sector: "Electronic Components (MLCC)" },
  { ticker: "6762.T", name: "TDK Corporation", sector: "Electronic Components" },
  { ticker: "6971.T", name: "Kyocera Corporation", sector: "Electronics / Industrial" },
  { ticker: "4078.T", name: "Sakai Chemical Industry Co., Ltd.", sector: "Specialty Chemicals" },
  { ticker: "285A.T", name: "Kioxia Holdings Corporation", sector: "Semiconductors (NAND)" },
  // Taiwan
  { ticker: "2316.TW", name: "WUS Printed Circuit Co., Ltd.", sector: "PCB Manufacturing" },
  { ticker: "6669.TW", name: "Wiwynn Corporation", sector: "Server ODM" },
  { ticker: "3231.TW", name: "Wistron Corporation", sector: "Electronics ODM" },
  { ticker: "5483.TW", name: "Sino-American Silicon Products Inc.", sector: "Semiconductor Materials" },
  { ticker: "6488.TW", name: "GlobalWafers Co., Ltd.", sector: "Semiconductor Wafers" },
  { ticker: "2308.TW", name: "Delta Electronics, Inc.", sector: "Power Electronics" },
  { ticker: "7788.TW", name: "Song Chuan Precision Co., Ltd.", sector: "Relays / Electronic Components" },
  { ticker: "5301.TW", name: "Foci Fiber Optic Communications, Inc.", sector: "Optical Components" },
  { ticker: "3679.TW", name: "Xintec Inc.", sector: "Semiconductor Packaging" },
  { ticker: "3105.TW", name: "Win Semiconductors Corp.", sector: "Compound Semiconductor Foundry" },
  { ticker: "5351.TW", name: "Etron Technology, Inc.", sector: "Memory ICs" },
  { ticker: "8299.TW", name: "Phison Electronics Corp.", sector: "NAND Controllers" },
  { ticker: "2327.TW", name: "Yageo Corporation", sector: "Passive Components" },
  { ticker: "2492.TW", name: "Walsin Technology Corporation", sector: "Passive Components" },
  // Korea
  { ticker: "093370.KS", name: "Foosung Co., Ltd.", sector: "Specialty Chemicals (WF6/Tungsten)" },
  { ticker: "138080.KQ", name: "OE Solutions Co., Ltd.", sector: "Photonics / Optical Components" },
  { ticker: "000660.KS", name: "SK Hynix Inc.", sector: "Semiconductors (Memory)" },
  { ticker: "005930.KS", name: "Samsung Electronics Co., Ltd.", sector: "Semiconductors / Electronics" },
  { ticker: "009150.KS", name: "Samsung Electro-Mechanics Co., Ltd.", sector: "Electronic Components" },
  { ticker: "103590.KS", name: "Iljin Electric Co., Ltd.", sector: "Electrical Equipment" },
  { ticker: "402340.KS", name: "SK Square Co., Ltd.", sector: "Holding Company" },
  // Europe / Israel
  { ticker: "SU.PA", name: "Schneider Electric SE", sector: "Electrical Equipment" },
  { ticker: "ETN", name: "Eaton Corporation plc", sector: "Electrical Equipment" },
  { ticker: "SIE.DE", name: "Siemens AG", sector: "Industrial Conglomerate" },
  { ticker: "PRTC", name: "Priortech Ltd.", sector: "Holding Company" },
  // Hong Kong
  { ticker: "0877.HK", name: "O-Net Technology (Group) Limited", sector: "Optical Components" },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const { ticker, name, sector } of stocks) {
    const existing = await prisma.stock.findUnique({ where: { ticker } });
    if (existing) {
      await prisma.stock.update({
        where: { ticker },
        data: { name, sector },
      });
      updated++;
    } else {
      await prisma.stock.create({
        data: { ticker, name, sector },
      });
      created++;
    }
  }

  console.log(`Created: ${created}, Updated: ${updated}, Total: ${stocks.length}`);

  // Report stocks in DB that are NOT in the master list (junk from LLM extraction)
  const allInDb = await prisma.stock.findMany({ select: { ticker: true, name: true } });
  const masterTickers = new Set(stocks.map((s) => s.ticker));
  const orphans = allInDb.filter((s) => !masterTickers.has(s.ticker));
  if (orphans.length > 0) {
    console.log(`\n${orphans.length} stocks in DB not in master list (possible junk):`);
    for (const o of orphans) {
      console.log(`  ${o.ticker}: ${o.name || "(no name)"}`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
