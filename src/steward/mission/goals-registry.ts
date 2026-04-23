import { getDb } from "../db/db-bootstrap.js";

export type OpportunityCategory =
  | "trading"
  | "saas"
  | "roblox"
  | "affiliate"
  | "defi"
  | "arbitrage"
  | "api_service"
  | "token"
  | "agent_product"
  | "power_market";

export type OpportunityCategoryRecord = {
  tag: OpportunityCategory;
  label: string;
};

const CATEGORY_COUNTS_KEY = "research:category_counts";
const CATEGORY_WINDOW_START_KEY = "research:category_window_start";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export const OPPORTUNITY_CATEGORIES: OpportunityCategoryRecord[] = [
  { tag: "trading", label: "Crypto/forex trading strategy with measurable historical edge" },
  { tag: "saas", label: "Software-as-product sold through a marketplace or direct checkout" },
  { tag: "roblox", label: "Roblox game development and monetisation" },
  { tag: "affiliate", label: "Affiliate/referral programme with verifiable commission rates" },
  { tag: "defi", label: "DeFi yield, staking, lending, or liquidity provision" },
  { tag: "arbitrage", label: "Cross-exchange or cross-market price arbitrage" },
  { tag: "api_service", label: "Automated API-based service or data product" },
  { tag: "token", label: "ERC-20/BEP-20 token deployment with controls" },
  { tag: "agent_product", label: "Autonomous AI agent as a product" },
  { tag: "power_market", label: "Power market, Polymarket, or prediction market strategy" },
];

export const RESEARCH_PHASES = ["pick", "validate", "commit", "prove"] as const;

function readKv(key: string): string | null {
  const row = getDb().prepare(`SELECT v FROM steward_kv WHERE k = ?`).get(key) as
    | { v: string }
    | undefined;
  return row?.v ?? null;
}

function writeKv(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO steward_kv (k, v)
       VALUES (?, ?)
       ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
    )
    .run(key, value);
}

function parseCounts(): Record<string, number> {
  try {
    const parsed = JSON.parse(readKv(CATEGORY_COUNTS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

export function recordCategorySelection(category: OpportunityCategory, now = Date.now()): void {
  const windowStart = Number(readKv(CATEGORY_WINDOW_START_KEY) ?? 0);
  const startsNewWindow = !windowStart || now - windowStart > WINDOW_MS;
  const counts = startsNewWindow ? {} : parseCounts();
  if (startsNewWindow) {
    writeKv(CATEGORY_WINDOW_START_KEY, String(now));
  }
  counts[category] = Number(counts[category] ?? 0) + 1;
  writeKv(CATEGORY_COUNTS_KEY, JSON.stringify(counts));
}

export function requiredUnderrepresentedCategory(now = Date.now()): OpportunityCategory | null {
  const windowStart = Number(readKv(CATEGORY_WINDOW_START_KEY) ?? 0);
  if (!windowStart || now - windowStart > WINDOW_MS) {
    return null;
  }
  const counts = parseCounts();
  const total = Object.values(counts).reduce((sum, count) => sum + Number(count ?? 0), 0);
  if (total < 5) {
    return null;
  }
  const threshold = Math.max(1, Math.floor(total * 0.1));
  const underrepresented = OPPORTUNITY_CATEGORIES
    .map((category) => ({ tag: category.tag, count: Number(counts[category.tag] ?? 0) }))
    .filter((item) => item.count < threshold)
    .sort((left, right) => left.count - right.count);
  return underrepresented[0]?.tag ?? null;
}

export function buildResearchTaskTemplate(params: {
  phase: (typeof RESEARCH_PHASES)[number];
  requiredCategory?: OpportunityCategory | null;
}): { title: string; details: string } {
  const categoryDirective = params.requiredCategory
    ? `Required category: ${params.requiredCategory}.`
    : `Choose one category: ${OPPORTUNITY_CATEGORIES.map((category) => category.tag).join(", ")}.`;
  return {
    title: `Research ${params.phase}: steward-vetted opportunity`,
    details:
      "Mission order: truth first, operator welfare, continuity, then revenue as instrument only.\n" +
      `${categoryDirective}\n` +
      "Use verifiable sources, concrete metrics, provenance URLs, and do not repeat recent opportunity families.",
  };
}

export function listOpportunityCategories(): OpportunityCategoryRecord[] {
  return [...OPPORTUNITY_CATEGORIES];
}
