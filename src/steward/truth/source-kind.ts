import { createHash } from "node:crypto";
import { URL } from "node:url";

const SEARCH_ENGINE_DOMAINS = ["duckduckgo.com", "google.com", "bing.com", "yahoo.com"];

const CATEGORY_RULES: Record<string, string[]> = {
  agent_product: ["ai agent", "assistant", "copilot", "automation"],
  saas: ["saas", "software", "platform", "pricing", "subscription"],
  api_service: ["api", "sdk", "developer", "endpoint", "integration", "workflow"],
};

function containsAny(text: string, needles: Iterable<string>): boolean {
  const lowered = String(text || "").toLowerCase();
  return [...needles].some((needle) => lowered.includes(String(needle || "").toLowerCase()));
}

export function cleanTitle(title: string): string {
  let text = String(title || "").trim();
  for (const separator of [" | ", " - ", " · ", " — "]) {
    if (text.includes(separator)) {
      text = text.split(separator, 1)[0]!.trim();
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

export function meaningfulTokens(text: string): string[] {
  const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "guide", "tools"]);
  const seen = new Set<string>();
  const output: string[] = [];
  for (const token of String(text || "").toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (stop.has(token)) {
      continue;
    }
    if (token.length < 4 && !/\d/.test(token)) {
      continue;
    }
    if (!seen.has(token)) {
      seen.add(token);
      output.push(token);
    }
  }
  return output;
}

export function domainFamilyTokens(url: string): string[] {
  let host = "";
  try {
    host = new URL(String(url || "")).hostname.toLowerCase();
  } catch {}
  return (host.match(/[a-z0-9]+/g) ?? []).filter(
    (part) => !["www", "com", "org", "net", "io", "app", "co"].includes(part),
  );
}

export function familySignatureTokens(params: {
  selectedOpportunity: string;
  category: string;
  sourceUrl: string;
  sourceTitle?: string;
}): string[] {
  return [
    ...new Set([
      ...meaningfulTokens(params.selectedOpportunity),
      ...meaningfulTokens(params.sourceTitle ?? ""),
      params.category.trim().toLowerCase(),
      ...domainFamilyTokens(params.sourceUrl),
    ].filter(Boolean)),
  ];
}

export function inferSelectedOpportunity(title: string, query: string): string {
  return cleanTitle(title) || cleanTitle(query) || "Specific opportunity candidate";
}

export function selectedOpportunityIsGeneric(title: string): boolean {
  const lowered = cleanTitle(title).toLowerCase();
  if (!lowered) {
    return true;
  }
  return [
    "top ",
    "best ",
    "companies",
    "platforms",
    "tools",
    "vendors",
    "guide",
    "use cases",
  ].some((needle) => lowered.includes(needle));
}

function metricCandidates(text: string): string[] {
  const matches = [
    ...String(text || "").matchAll(/\$?\d[\d,]*(?:\.\d+)?\s*(?:million|billion|m|k)?/gi),
    ...String(text || "").matchAll(/\d[\d,]*(?:\.\d+)?%\s*(?:\w+\s*){0,4}/gi),
    ...String(text || "").matchAll(/\d+(?:\.\d+)?x(?:\s+\w+){0,4}/gi),
  ];
  const output: string[] = [];
  for (const match of matches) {
    const metric = match[0]?.replace(/\s+/g, " ").trim() ?? "";
    if (metric && !output.includes(metric)) {
      output.push(metric);
    }
  }
  return output;
}

function metricContextWindow(text: string, metric: string): string {
  const source = String(text || "").toLowerCase();
  const target = String(metric || "").toLowerCase();
  const index = source.indexOf(target);
  if (index < 0) {
    return source.slice(0, 120);
  }
  return source.slice(Math.max(0, index - 60), Math.min(source.length, index + target.length + 60));
}

function metricScore(metric: string, text: string): number {
  const window = metricContextWindow(text, metric);
  let score = 0;
  if (metric.includes("$")) {
    score += 6;
  }
  if (metric.includes("%")) {
    score += 5;
  }
  if (metric.toLowerCase().includes("x")) {
    score += 4;
  }
  if (containsAny(window, ["revenue", "sales", "price", "profit", "arr", "mrr", "apy", "yield"])) {
    score += 4;
  }
  if (containsAny(window, ["min read", "minute read", "read time", "top ", "best ", "ranked"])) {
    score -= 10;
  }
  return score;
}

export function inferKeyMetric(content: string, snippet = ""): string {
  const text = `${snippet}\n${content}`;
  const metrics = metricCandidates(text);
  if (metrics.length === 0) {
    return "";
  }
  return metrics.toSorted((left, right) => metricScore(right, text) - metricScore(left, text))[0] ?? "";
}

export function inferCategory(text: string, allowedCategories: string[]): string {
  const lowered = String(text || "").toLowerCase();
  const ranked = allowedCategories
    .map((category) => ({
      category,
      score: (CATEGORY_RULES[category] ?? []).reduce(
        (sum, needle) => sum + (lowered.includes(needle) ? (needle.includes(" ") ? 2 : 1) : 0),
        0,
      ),
    }))
    .toSorted((left, right) => right.score - left.score || left.category.localeCompare(right.category));
  return ranked[0]?.category ?? allowedCategories[0] ?? "";
}

export function inferCategoryFromEvidence(title: string, content: string, allowedCategories: string[]): string {
  return inferCategory(`${title}\n${content}`, allowedCategories);
}

export function categoryMatchesEvidence(
  category: string,
  title: string,
  content: string,
  allowedCategories: string[],
): boolean {
  const chosen = String(category || "").trim().toLowerCase();
  if (!chosen) {
    return false;
  }
  const inferred = inferCategory(`${title}\n${content}`, allowedCategories);
  return inferred === chosen || inferred === "";
}

export function inferOpportunityKind(text: string): string {
  const lowered = String(text || "").toLowerCase();
  if (containsAny(lowered, ["api", "workflow", "automation"])) {
    return "automation_service";
  }
  if (containsAny(lowered, ["assistant", "agent", "copilot"])) {
    return "agent_product";
  }
  return "sell_software_tool";
}

export function classifySourceKind(url: string, title: string, content: string): string {
  const loweredUrl = String(url || "").toLowerCase();
  const loweredTitle = String(title || "").toLowerCase();
  const loweredContent = String(content || "").toLowerCase();
  if (SEARCH_ENGINE_DOMAINS.some((domain) => loweredUrl.includes(domain))) {
    return "search_engine_page";
  }
  if (containsAny(loweredUrl, ["/pricing", "/plans", "pricing.", "/plan/"])) {
    return "product_page";
  }
  if (
    containsAny(loweredUrl, ["docs.", "/docs", "/api", "developer"]) ||
    containsAny(`${loweredTitle}\n${loweredContent}`, ["api reference", "endpoint", "authentication", "sdk"])
  ) {
    return "api_docs";
  }
  if (containsAny(`${loweredUrl}\n${loweredTitle}`, ["guide", "tutorial", "how to"])) {
    return "tutorial";
  }
  if (containsAny(`${loweredUrl}\n${loweredContent}`, ["forum", "reddit", "discussion", "thread"])) {
    return "forum_post";
  }
  if (containsAny(`${loweredTitle}\n${loweredContent}`, ["benchmark", "performance report", "results"])) {
    return "benchmark_report";
  }
  return "product_page";
}

export function classifyMetricKind(metricValue: string, excerpt: string, content: string): string {
  const text = `${metricValue}\n${excerpt}\n${content}`.toLowerCase();
  const metric = String(metricValue || "").trim().toLowerCase();
  if (!metric) {
    return "unknown";
  }
  if (containsAny(metricContextWindow(text, metric), ["min read", "minute read", "read time"])) {
    return "read_time";
  }
  if (/^(?:19|20)\d{2}$/.test(metric)) {
    return "year";
  }
  if (metric.includes("%") || containsAny(text, ["apy", "yield", "conversion"])) {
    return containsAny(text, ["conversion", "ctr", "signup"]) ? "conversion_rate" : "apy";
  }
  if (metric.includes("x") || containsAny(text, ["return", "roi", "multiple"])) {
    return "return_multiple";
  }
  if (metric.includes("$") || containsAny(text, ["revenue", "arr", "mrr", "sales", "price"])) {
    return containsAny(text, ["price", "priced at", "per month"]) ? "price" : "revenue_estimate";
  }
  if (containsAny(text, ["users", "customers", "downloads"])) {
    return "user_count";
  }
  return "unknown";
}

export function metricIsTrivial(metricValue: string, metricKind: string): boolean {
  const metric = String(metricValue || "").trim().toLowerCase();
  const numbers = metric.match(/\d+(?:\.\d+)?/g) ?? [];
  if (numbers.length === 0) {
    return true;
  }
  if (["tutorial_step_count", "unknown", "year", "read_time", "list_count"].includes(metricKind)) {
    return true;
  }
  if (numbers.length === 1) {
    const value = Number(numbers[0]);
    if (Number.isFinite(value) && value <= 20 && !metric.includes("$") && !metric.includes("%") && !metric.includes("x")) {
      return true;
    }
  }
  return false;
}

export function buildExcerpt(sourceContent: string, selectedOpportunity: string, keyMetric: string): string {
  const text = String(sourceContent || "").replace(/\s+/g, " ").trim();
  const lowered = text.toLowerCase();
  for (const anchor of [selectedOpportunity, keyMetric]) {
    const target = String(anchor || "").trim().toLowerCase();
    if (!target) {
      continue;
    }
    const index = lowered.indexOf(target);
    if (index >= 0) {
      return text.slice(Math.max(0, index - 120), Math.min(text.length, index + target.length + 220)).trim();
    }
  }
  return text.slice(0, 420).trim();
}

export function buildExcerptHash(excerpt: string): string {
  return createHash("sha256").update(excerpt).digest("hex");
}
