/**
 * Research question templates — comprehensive checklist covering all aspects
 * of stock analysis. Seeded lazily per stock on first access.
 */

export interface TemplateQuestion {
  category: string;
  text: string;
  defaultPriority: number; // 1-10, higher = more important
}

export const TEMPLATE_QUESTIONS: TemplateQuestion[] = [
  // ── Moat ──
  {
    category: "moat",
    text: "What is the moat, and what specific evidence proves it's durable?",
    defaultPriority: 5,
  },
  {
    category: "moat",
    text: "Who could replicate or erode the moat within 5 years?",
    defaultPriority: 4,
  },

  // ── Supply chain ──
  {
    category: "supply_chain",
    text: "Map the supply chain: who depends on them, and who do they critically depend on?",
    defaultPriority: 5,
  },
  {
    category: "supply_chain",
    text: "Is any input or component single-sourced or capacity-constrained?",
    defaultPriority: 4,
  },

  // ── Customers ──
  {
    category: "customers",
    text: "Who are the top 3-5 customers and what percentage of revenue is each?",
    defaultPriority: 4,
  },
  {
    category: "customers",
    text: "How sticky are customer relationships? What is the switching cost?",
    defaultPriority: 4,
  },

  // ── Financials ──
  {
    category: "financials",
    text: "What are the last 3 years of revenue growth, gross margin, and free cash flow trends?",
    defaultPriority: 5,
  },
  {
    category: "financials",
    text: "What is the debt load, maturity schedule, and interest coverage?",
    defaultPriority: 4,
  },
  {
    category: "financials",
    text: "Are receivables and inventory trending in line with revenue?",
    defaultPriority: 3,
  },

  // ── Risk ──
  {
    category: "risk",
    text: "What is the bear case that smart skeptics believe?",
    defaultPriority: 5,
  },
  {
    category: "risk",
    text: "What single assumption, if wrong, collapses the entire thesis?",
    defaultPriority: 5,
  },

  // ── Catalysts ──
  {
    category: "catalyst",
    text: "What specific catalysts could move the stock in the next 12-24 months?",
    defaultPriority: 4,
  },

  // ── Management ──
  {
    category: "management",
    text: "Who runs the company and what is their track record / incentive alignment?",
    defaultPriority: 4,
  },

  // ── Manufacturing ──
  {
    category: "manufacturing",
    text: "Where is production located? What is utilization and expansion capacity?",
    defaultPriority: 3,
  },

  // ── IP ──
  {
    category: "ip",
    text: "What patents or IP are critical to the business, and when do they expire?",
    defaultPriority: 3,
  },

  // ── Regulatory ──
  {
    category: "regulatory",
    text: "What regulations apply, and what regulatory changes are pending?",
    defaultPriority: 3,
  },

  // ── Labor ──
  {
    category: "labor",
    text: "What is the labor situation — unions, shortages, wage pressure?",
    defaultPriority: 2,
  },

  // ── R&D ──
  {
    category: "rd",
    text: "What is in the R&D pipeline, and what is the most promising program?",
    defaultPriority: 3,
  },

  // ── CapEx ──
  {
    category: "capex",
    text: "What is the capex plan, and what specifically does it fund?",
    defaultPriority: 3,
  },

  // ── Insiders ──
  {
    category: "insiders",
    text: "Any notable insider buying or selling in the last 12 months?",
    defaultPriority: 3,
  },
];

/** Human-readable labels for each category */
export const CATEGORY_LABELS: Record<string, string> = {
  moat: "Moat",
  supply_chain: "Supply Chain",
  customers: "Customers",
  financials: "Financials",
  risk: "Risk",
  catalyst: "Catalysts",
  management: "Management",
  manufacturing: "Manufacturing",
  ip: "IP & Patents",
  regulatory: "Regulatory",
  labor: "Labor",
  rd: "R&D Pipeline",
  capex: "CapEx",
  insiders: "Insiders",
  valuation: "Valuation",
  general: "General",
};

/** Emoji icons for each category */
export const CATEGORY_ICONS: Record<string, string> = {
  moat: "🏰",
  supply_chain: "🔗",
  customers: "👥",
  financials: "📊",
  risk: "⚠️",
  catalyst: "🚀",
  management: "👤",
  manufacturing: "🏭",
  ip: "🔬",
  regulatory: "⚖️",
  labor: "👷",
  rd: "🧪",
  capex: "🏗️",
  insiders: "📈",
  valuation: "💰",
  general: "📝",
};
