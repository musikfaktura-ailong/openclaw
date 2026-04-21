import { describe, expect, it } from "vitest";
import { buildCandidateSlate } from "./candidate-ranking.js";
import { auditClaimRecord } from "./truth-audit.js";
import { buildClaimRecord } from "./claim-record.js";

describe("steward truth audit", () => {
  it("rejects generic listicle candidates deterministically", () => {
    const slate = buildCandidateSlate({
      results: [
        {
          url: "https://example.com/best-ai-tools",
          title: "Top 10 AI Tools for 2026",
          snippet: "10 tools compared",
          content:
            "Top 10 AI tools for 2026. 10 min read. Best tools, platforms, and vendors for every team. This guide compares products broadly but does not ground one concrete opportunity or business metric for operator action. It is a buyer guide with rankings and generic recommendations rather than decision-grade evidence.",
          fetched: true,
          usable_for_claims: true,
          contains_numbers: true,
        },
      ],
      query: "ai agent opportunities",
      priorRecords: [],
      uncertaintyBefore: "Which direction is decision-useful?",
      nextTestBefore: "Find one evidence-backed product page",
      allowedCategories: ["agent_product", "saas", "api_service"],
    });
    expect(slate).toHaveLength(0);
  });

  it("flags stale family reuse when overlap is high", () => {
    const claim = buildClaimRecord({
      selectedOpportunity: "Acme Pricing API",
      category: "api_service",
      sourceUrl: "https://acme.dev/pricing",
      sourceTitle: "Acme Pricing API",
      sourceContent:
        "Acme Pricing API charges $299 per month. Customers use the API for revenue analytics and forecasting. The pricing page states enterprise buyers can start at $299 per month with annual contracts and commercial support.",
      keyMetric: "$299 per month",
      initialHypothesis: "Acme Pricing API could support a repeatable operator-useful offer.",
      uncertaintyBefore: "Does this differ from prior work?",
      uncertaintyAfter: "Does this differ from prior work?",
      nextTestBefore: "Check direct pricing evidence",
      nextTestAfter: "Check direct pricing evidence",
    });
    const audit = auditClaimRecord({
      priorRecords: [
        {
          selectedOpportunity: "Acme Revenue API",
          category: "api_service",
          sourceUrl: "https://acme.dev/revenue",
          keyMetric: "$199 per month",
          uncertaintyAfter: "Does this differ from prior work?",
          nextTestAfter: "Check direct pricing evidence",
        },
      ],
      current: claim,
      sourceContent:
        "Acme Pricing API charges $299 per month. Customers use the API for revenue analytics and forecasting. The pricing page states enterprise buyers can start at $299 per month with annual contracts and commercial support.",
      avoidFamilyReuse: true,
    });
    expect(audit.findings.some((finding) => finding.checkId === "family.reuse.high_overlap")).toBe(
      true,
    );
  });
});
