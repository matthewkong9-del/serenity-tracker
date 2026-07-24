const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const stocks = [
  // US / Western-Listed
  { ticker: "SIVE", name: "Sivers Semiconductors AB", sector: "Photonics / Optical Components" },
  { ticker: "AAOI", name: "Applied Optoelectronics, Inc.", sector: "Photonics / Optical Components" },
  { ticker: "LITE", name: "Lumentum Holdings Inc.", sector: "Photonics / Optical Components" },
  { ticker: "COHR", name: "Coherent Corp.", sector: "Photonics / Optical Components" },
  { ticker: "POET", name: "POET Technologies Inc.", sector: "Photonics / Optical Components" },
  { ticker: "CIEN", name: "Ciena Corporation", sector: "Photonics / Optical Components" },
  { ticker: "AEVA", name: "Aeva Technologies, Inc.", sector: "Photonics / Optical Components", notes: "FMCW LiDAR for autonomous driving and industrial. Task 2 orphan review." },
  { ticker: "LAZR", name: "Luminar Technologies, Inc.", sector: "Photonics / Optical Components", notes: "LiDAR for autonomous vehicles. Task 2 orphan review." },
  { ticker: "OUST", name: "Ouster, Inc.", sector: "Photonics / Optical Components", notes: "Digital LiDAR sensors. Task 2 orphan review." },
  { ticker: "AXTI", name: "AXT, Inc.", sector: "Semiconductors (Substrates)" },
  { ticker: "IQE", name: "IQE plc", sector: "Semiconductors (Epiwafers)" },
  { ticker: "SOI", name: "Soitec SA", sector: "Semiconductors (Substrates)" },
  { ticker: "TSEM", name: "Tower Semiconductor Ltd.", sector: "Semiconductors (Foundry)" },
  { ticker: "GFS", name: "GlobalFoundries Inc.", sector: "Semiconductors (Foundry)" },
  { ticker: "XFAB", name: "X-FAB Silicon Foundries SE", sector: "Semiconductors (Foundry)" },
  { ticker: "WOLF", name: "Wolfspeed, Inc.", sector: "Semiconductors (Power/SiC)" },
  { ticker: "STM", name: "STMicroelectronics N.V.", sector: "Semiconductors (Power/SiC)" },
  { ticker: "ON", name: "ON Semiconductor Corporation", sector: "Semiconductors (Power/SiC)" },
  { ticker: "IFX.DE", name: "Infineon Technologies AG", sector: "Semiconductors (Power/SiC)" },
  { ticker: "NVTS", name: "Navitas Semiconductor Corporation", sector: "Semiconductors (Power/SiC)" },
  { ticker: "MTSI", name: "MACOM Technology Solutions Holdings", sector: "Semiconductors" },
  { ticker: "MRVL", name: "Marvell Technology, Inc.", sector: "Semiconductors" },
  { ticker: "ARM", name: "Arm Holdings plc", sector: "Semiconductors (IP)" },
  { ticker: "AVGO", name: "Broadcom Inc.", sector: "Semiconductors" },
  { ticker: "AMD", name: "Advanced Micro Devices, Inc.", sector: "Semiconductors" },
  { ticker: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductors" },
  { ticker: "NXPI", name: "NXP Semiconductors N.V.", sector: "Semiconductors" },
  { ticker: "INTC", name: "Intel Corporation", sector: "Semiconductors" },
  { ticker: "MU", name: "Micron Technology, Inc.", sector: "Semiconductors (Memory)" },
  { ticker: "SNDK", name: "SanDisk Corporation", sector: "Semiconductors (Memory)" },
  { ticker: "SIMO", name: "Silicon Motion Technology Corp.", sector: "Semiconductors (Memory controllers)" },
  { ticker: "ALAB", name: "Astera Labs, Inc.", sector: "Semiconductors (Connectivity)" },
  { ticker: "CRDO", name: "Credo Technology Group Holding Ltd", sector: "Semiconductors (Connectivity)" },
  { ticker: "CBRS", name: "Cerebras Systems Inc.", sector: "AI Infrastructure / Semiconductors" },
  { ticker: "ACMR", name: "ACM Research, Inc.", sector: "Semiconductor Equipment" },
  { ticker: "VECO", name: "Veeco Instruments Inc.", sector: "Semiconductor Equipment" },
  { ticker: "AMAT", name: "Applied Materials, Inc.", sector: "Semiconductor Equipment" },
  { ticker: "KLAC", name: "KLA Corporation", sector: "Semiconductor Equipment" },
  { ticker: "LRCX", name: "Lam Research Corporation", sector: "Semiconductor Equipment" },
  { ticker: "ONTO", name: "Onto Innovation Inc.", sector: "Semiconductor Equipment" },
  { ticker: "ACLS", name: "Axcelis Technologies, Inc.", sector: "Semiconductor Equipment" },
  { ticker: "UCTT", name: "Ultra Clean Holdings, Inc.", sector: "Semiconductor Equipment" },
  { ticker: "FORM", name: "FormFactor, Inc.", sector: "Semiconductor Equipment" },
  { ticker: "KLIC", name: "Kulicke and Soffa Industries, Inc.", sector: "Semiconductor Equipment" },
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
  { ticker: "SHAZ", name: "SharonAI Holdings", sector: "AI Infrastructure / Data Center", notes: "AI/GPU cloud computing and data-center operator. Raised $1.6B for Nvidia-based 'AI factory'. Partnered with VAST Data." },
  { ticker: "WYFI", name: "WhiteFiber, Inc.", sector: "AI Infrastructure / Data Center" },
  { ticker: "CIFR", name: "Cipher Mining Inc.", sector: "Data Center / Bitcoin Mining" },
  { ticker: "WULF", name: "TeraWulf Inc.", sector: "Data Center / Bitcoin Mining" },
  { ticker: "CLSK", name: "CleanSpark, Inc.", sector: "Bitcoin Mining" },
  { ticker: "BITF", name: "Bitfarms Ltd.", sector: "Bitcoin Mining" },
  { ticker: "SLNH", name: "Soluna Holdings, Inc.", sector: "Data Center / Bitcoin Mining" },
  { ticker: "VRT", name: "Vertiv Holdings Co", sector: "Data Center Infrastructure" },
  { ticker: "SMCI", name: "Super Micro Computer, Inc.", sector: "AI Infrastructure / Data Center" },
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
  { ticker: "ANET", name: "Arista Networks, Inc.", sector: "Networking" },
  { ticker: "ACN", name: "Accenture plc", sector: "IT Services" },
  { ticker: "SHOP", name: "Shopify Inc.", sector: "E-commerce / Software" },
  { ticker: "TTD", name: "The Trade Desk, Inc.", sector: "Adtech / Software" },
  { ticker: "SNAP", name: "Snap Inc.", sector: "Social Media" },
  { ticker: "RDDT", name: "Reddit, Inc.", sector: "Social Media" },
  { ticker: "ANTH", name: "Anthropic", sector: "Artificial Intelligence" },
  { ticker: "AOSL", name: "Alpha and Omega Semiconductor Limited", sector: "Semiconductors" },
  // ETFs
  { ticker: "EWY", name: "iShares MSCI South Korea ETF", sector: "ETF" },
  { ticker: "XLU", name: "Utilities Select Sector SPDR Fund", sector: "ETF" },
  // Japan
  { ticker: "8035.T", name: "Tokyo Electron Limited", sector: "Semiconductor Equipment" },
  { ticker: "6857.T", name: "Advantest Corporation", sector: "Semiconductor Equipment" },
  { ticker: "7735.T", name: "Screen Holdings Co., Ltd.", sector: "Semiconductor Equipment" },
  { ticker: "6920.T", name: "Lasertec Corporation", sector: "Semiconductor Equipment" },
  { ticker: "6315.T", name: "Towa Corporation", sector: "Semiconductor Equipment" },
  { ticker: "6324.T", name: "Harmonic Drive Systems Inc.", sector: "Precision Motion Control / Robotics" },
  { ticker: "4062.T", name: "Ibiden Co., Ltd.", sector: "IC Packaging Substrates" },
  { ticker: "6967.T", name: "Shinko Electric Industries Co., Ltd.", sector: "IC Packaging Substrates" },
  { ticker: "5801.T", name: "Furukawa Electric Co., Ltd.", sector: "Wire/Cable & Optical" },
  { ticker: "5802.T", name: "Sumitomo Electric Industries, Ltd.", sector: "Wire/Cable & Optical" },
  { ticker: "6503.T", name: "Mitsubishi Electric Corporation", sector: "Electronics / Industrial" },
  { ticker: "6981.T", name: "Murata Manufacturing Co., Ltd.", sector: "Electronic Components (MLCC)" },
  { ticker: "6976.T", name: "Taiyo Yuden Co., Ltd.", sector: "Electronic Components (MLCC)" },
  { ticker: "6762.T", name: "TDK Corporation", sector: "Electronic Components" },
  { ticker: "6971.T", name: "Kyocera Corporation", sector: "Electronics / Industrial" },
  { ticker: "4078.T", name: "Sakai Chemical Industry Co., Ltd.", sector: "Specialty Chemicals" },
  { ticker: "285A.T", name: "Kioxia Holdings Corporation", sector: "Semiconductors (NAND)" },
  { ticker: "6146.T", name: "Disco Corporation", sector: "Semiconductor Equipment", notes: "Dicing saws and grinding wheels for wafer processing. Task 2 orphan review." },
  { ticker: "4004.T", name: "Resonac Holdings Corporation", sector: "Semiconductor Materials", notes: "Merged from LLM-extracted 'RESONAC' and '4004'. Task 2 orphan review." },
  { ticker: "5706.T", name: "Mitsui Mining & Smelting Co., Ltd.", sector: "PCB Materials", notes: "Electrolytic copper foil for AI-server PCB substrates. Task 2 orphan review." },
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
  { ticker: "6239.TW", name: "Powertech Technology Inc.", sector: "Semiconductor Packaging & Testing" },
  { ticker: "2449.TW", name: "King Yuan Electronics Co., Ltd.", sector: "Semiconductor Packaging & Testing" },
  { ticker: "3037.TW", name: "Unimicron Technology Corp.", sector: "IC Packaging Substrates" },
  { ticker: "3189.TW", name: "Kinsus Interconnect Technology Corp.", sector: "IC Packaging Substrates" },
  { ticker: "3105.TW", name: "Win Semiconductors Corp.", sector: "Compound Semiconductor Foundry" },
  { ticker: "5351.TW", name: "Etron Technology, Inc.", sector: "Memory ICs" },
  { ticker: "8299.TW", name: "Phison Electronics Corp.", sector: "NAND Controllers" },
  { ticker: "6830.TW", name: "Msscorps Co., Ltd.", sector: "Semiconductors", notes: "Taiwan semiconductor failure-analysis/materials-testing (SEM/TEM/FIB). Previously tracked as 'MSSCORP'." },
  { ticker: "2337.TW", name: "Macronix International Co., Ltd.", sector: "Semiconductors (Memory)", notes: "NOR Flash / NAND. Merged from LLM-extracted 'MACRONIX' and '2337'. Task 2 orphan review." },
  { ticker: "2344.TW", name: "Winbond Electronics Corporation", sector: "Semiconductors (Memory)", notes: "DRAM / NOR Flash. Merged from LLM-extracted 'WINBOND' and '2344'. Task 2 orphan review." },
  { ticker: "2356.TW", name: "Inventec Corporation", sector: "AI Infrastructure / Data Center", notes: "AI server ODM (NVIDIA GB200 racks etc.). Task 2 orphan review." },
  { ticker: "2327.TW", name: "Yageo Corporation", sector: "Passive Components" },
  { ticker: "2492.TW", name: "Walsin Technology Corporation", sector: "Passive Components" },
  // Korea
  { ticker: "093370.KS", name: "Foosung Co., Ltd.", sector: "Specialty Chemicals (WF6/Tungsten)" },
  { ticker: "138080.KQ", name: "OE Solutions Co., Ltd.", sector: "Photonics / Optical Components" },
  { ticker: "000660.KS", name: "SK Hynix Inc.", sector: "Semiconductors (Memory)" },
  { ticker: "005930.KS", name: "Samsung Electronics Co., Ltd.", sector: "Semiconductors / Electronics" },
  { ticker: "009150.KS", name: "Samsung Electro-Mechanics Co., Ltd.", sector: "Electronic Components" },
  { ticker: "011070.KS", name: "LG Innotek Co., Ltd.", sector: "Electronic Components" },
  { ticker: "103590.KS", name: "Iljin Electric Co., Ltd.", sector: "Electrical Equipment" },
  { ticker: "402340.KS", name: "SK Square Co., Ltd.", sector: "Holding Company" },
  // Europe / Israel
  { ticker: "ASM.AS", name: "ASM International N.V.", sector: "Semiconductor Equipment" },
  { ticker: "BESI.AS", name: "BE Semiconductor Industries N.V.", sector: "Semiconductor Equipment" },
  { ticker: "ATS.VI", name: "AT&S Austria Technologie & Systemtechnik AG", sector: "IC Packaging Substrates" },
  { ticker: "SU.PA", name: "Schneider Electric SE", sector: "Electrical Equipment" },
  { ticker: "ETN", name: "Eaton Corporation plc", sector: "Electrical Equipment" },
  { ticker: "SIE.DE", name: "Siemens AG", sector: "Industrial Conglomerate" },
  { ticker: "SHA.DE", name: "Schaeffler AG", sector: "Automotive / Industrial", notes: "Merged from LLM-extracted 'SHA' (Industrial Robotics) and 'SHA0' (Automotive)." },
  { ticker: "PRTC", name: "Priortech Ltd.", sector: "Holding Company" },
  // Hong Kong
  { ticker: "0877.HK", name: "O-Net Technology (Group) Limited", sector: "Optical Components" },
  { ticker: "2513.HK", name: "Knowledge Atlas Technology (Zhipu AI)", sector: "Semiconductors / AI", notes: "IPO'd Jan 8, 2026 on HKEX; previously tracked as private 'ZHIPU'" },

  // China (A-Share)
  { ticker: "CXMT", name: "ChangXin Memory Technologies (CXMT)", sector: "Semiconductors (Memory)", notes: "IPO July 27, 2026 on Shanghai STAR Market at ¥8.66/share (~$85B valuation, $8.6B raised). Asia's largest IPO of 2026." },
  { ticker: "605111.SS", name: "Wuxi NCE Power Co., Ltd.", sector: "Semiconductors (Power/SiC)", notes: "MOSFET/IGBT/SiC/GaN power semis for EVs, AI servers. Task 1 mystery ticker fix (was 'NCE POWER')." },
  { ticker: "688766.SS", name: "Puya Semiconductor (Shanghai) Co., Ltd.", sector: "Semiconductors (Memory)", notes: "NOR Flash, EEPROM, MCUs. STAR Market 2021. Task 1 mystery ticker fix (was 'PUYA SEMI')." },
  { ticker: "300308.SZ", name: "Zhongji Innolight Co., Ltd.", sector: "Photonics / Optical Components", notes: "Optical transceivers (800G/1.6T for AI datacom). Merged from LLM-extracted 'INNOLIGHT'. Task 2 orphan review." },

  // Taiwan (Taipei Exchange / OTC)
  { ticker: "8027.TWO", name: "E&R Engineering Corporation", sector: "Semiconductor Equipment", notes: "Laser marking/scribing, plasma cleaning, FOPLP/FCBGA tooling for OSATs. Task 1 mystery ticker fix (was 'E&R')." },

  // Nordic
  { ticker: "SILEX.ST", name: "Silex Microsystems AB", sector: "Semiconductors (MEMS Foundry)", notes: "Pure-play MEMS foundry. Nasdaq Stockholm IPO May 2026. Task 2 ticker fix (was bare 'SILEX')." },

  // Private / Pre-IPO Watchlist
  { ticker: "OPENAI", name: "OpenAI", sector: "Private / Pre-IPO", notes: "Confidentially filed S-1 May 2026; restructured as 'OpenAI Group PBC' Oct 2025. Public listing target slipped from Q4 2026 toward 2027 per Reuters (June 2026)." },
  { ticker: "DEEPSEEK", name: "DeepSeek", sector: "Private / Pre-IPO", notes: "Began IPO preparations mid-2026 (Bloomberg). Likely targeting mainland China listing, filing possibly 2026, debut 2027. Raised ~$7.4B at $50B+ valuation." },
  { ticker: "SAMBANOVA", name: "SambaNova Systems", sector: "Private / Pre-IPO", notes: "Raised $1B at $11B valuation July 8, 2026. CEO says IPO 'strongly considered' for 2027, most likely U.S." },
  { ticker: "GROQ", name: "Groq, Inc.", sector: "Private / Pre-IPO", notes: "~$6-13B valuation. Raised $650M June 2026. Nvidia struck deal Feb 2026 licensing/acquiring core inference-chip IP (some frame as quasi-acquisition). Groq continues independently on cloud/LPU business." },
  { ticker: "TENSTORRENT", name: "Tenstorrent, Inc.", sector: "Private / Pre-IPO", notes: "~$3.2B valuation (Dec 2025), $1.18B raised total. Jim Keller CEO. Denied July 2026 reports of Qualcomm acquisition." },
  { ticker: "DMATRIX", name: "d-Matrix Corporation", sector: "Private / Pre-IPO", notes: "AI inference-chip focus. Pre-IPO." },
  { ticker: "LIGHTMATTER", name: "Lightmatter, Inc.", sector: "Private / Pre-IPO", notes: "$4.4B valuation (Oct 2024 Series D). Photonic interconnects. No S-1 filed as of mid-2026 despite low-quality aggregator claims." },
  { ticker: "AYAR", name: "Ayar Labs", sector: "Private / Pre-IPO", notes: "Photonic interconnects. Part of well-funded photonic-startup cohort (with Lightmatter, Xscape, Salience) that collectively raised $1B+." },
  { ticker: "XSCAPE", name: "Xscape Photonics", sector: "Private / Pre-IPO", notes: "Photonic interconnects. Pre-IPO." },
  { ticker: "SALIENCE", name: "Salience Labs", sector: "Private / Pre-IPO", notes: "Photonic interconnects. Pre-IPO." },
  { ticker: "LUCIDEAN", name: "Lucidean", sector: "Private / Pre-IPO", notes: "Photonic interconnects. Pre-IPO." },
  { ticker: "CRUSOE", name: "Crusoe Energy Systems", sector: "Private / Pre-IPO", notes: "AI infrastructure (low-carbon data centers). Pre-IPO." },
  { ticker: "MINIMAX", name: "MiniMax", sector: "Private / Pre-IPO", notes: "Chinese AI company. Pre-IPO; in same cohort as Zhipu." },
  { ticker: "REBELLIONS", name: "Rebellions Inc.", sector: "Private / Pre-IPO", notes: "Korean inference-chip startup. Targeting 2027 KOSPI IPO." },
];

async function main() {
  let created = 0;
  let updated = 0;

  for (const { ticker, name, sector, notes } of stocks) {
    const existing = await prisma.stock.findUnique({ where: { ticker } });
    if (existing) {
      await prisma.stock.update({
        where: { ticker },
        data: { name, sector, generalNotes: notes?.trim() || existing.generalNotes },
      });
      updated++;
    } else {
      await prisma.stock.create({
        data: { ticker, name, sector, generalNotes: notes?.trim() || null },
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
