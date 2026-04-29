import { extractToolPayload } from "../../plugin-sdk/tool-payload.js";

export type PostcheckVerdict = "accept" | "retry" | "reroute" | "refuse" | "hard_fail";

export type ToolPostcheckIssue = {
  code: string;
  detail: string;
  severity: "info" | "error";
};

export type ToolPostcheckResult = {
  verdict: PostcheckVerdict;
  reason: string;
  issues: ToolPostcheckIssue[];
  normalizedToolName: string;
  artifacts: Record<string, unknown>;
  payload: unknown;
};

type ToolPostcheckRuleContext = {
  toolName: string;
  args: Record<string, unknown>;
  payload: unknown;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function readFirstString(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function issue(
  code: string,
  detail: string,
  severity: ToolPostcheckIssue["severity"] = "error",
): ToolPostcheckIssue {
  return { code, detail, severity };
}

function truncate(value: unknown, limit = 240): string {
  const text = String(value ?? "").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 3)}...`;
}

function classifyError(toolName: string, error: string): PostcheckVerdict {
  const lowered = String(error || "").trim().toLowerCase();
  if (!lowered) {
    return "hard_fail";
  }
  if (lowered.startsWith("reroute:")) {
    return "reroute";
  }
  if (lowered.startsWith("refused:")) {
    return "refuse";
  }
  if (lowered.includes("timeout") || lowered.includes("timed out")) {
    return "retry";
  }
  if (
    lowered.includes("winerror 10013") ||
    lowered.includes("socket access permissions")
  ) {
    return "retry";
  }
  if (
    lowered.includes("connection") ||
    lowered.includes("temporar") ||
    lowered.includes("rate limit") ||
    lowered.includes("429") ||
    lowered.includes("502") ||
    lowered.includes("503") ||
    lowered.includes("504")
  ) {
    return "retry";
  }
  if (toolName === "web_fetch" && ["404", "403", "401"].some((token) => lowered.includes(token))) {
    return "retry";
  }
  return "hard_fail";
}

function isFailurePayload(payload: unknown): payload is Record<string, unknown> {
  const record = toRecord(payload);
  if (record.ok === false) {
    return true;
  }
  const status = record.status;
  return status === "error" || status === "failed";
}

function normalizeSearchResultSet(ctx: ToolPostcheckRuleContext): {
  artifacts: Record<string, unknown>;
  issues: ToolPostcheckIssue[];
} {
  const payload = toRecord(ctx.payload);
  const results = Array.isArray(payload.results) ? payload.results : [];
  const issues: ToolPostcheckIssue[] = [];
  const normalized = results.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push(issue("web_search.result_shape", `result ${index} is not an object`));
      return [];
    }
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url) {
      issues.push(issue("web_search.result_url_missing", `result ${index} missing url`));
    }
    return [
      {
        url,
        title: typeof row.title === "string" ? row.title.trim() : "",
        snippet: typeof row.snippet === "string" ? row.snippet.trim() : "",
        rank: index + 1,
        domain: typeof row.domain === "string" ? row.domain : "",
      },
    ];
  });

  if (normalized.length === 0) {
    issues.push(issue("web_search.empty", "web_search returned no results"));
  }

  return {
    artifacts: {
      search_result_set: {
        query:
          (typeof payload.query === "string" && payload.query) ||
          readFirstString(ctx.args, ["query", "q"]),
        provider: typeof payload.provider === "string" ? payload.provider : "",
        result_count: normalized.length,
        results: normalized.slice(0, 10),
      },
    },
    issues,
  };
}

function normalizeFetchedDocument(ctx: ToolPostcheckRuleContext): {
  artifacts: Record<string, unknown>;
  issues: ToolPostcheckIssue[];
} {
  const payload = toRecord(ctx.payload);
  const text = readFirstString(payload, ["text", "body", "extracted_text", "content"]);
  const title = readFirstString(payload, ["title"]);
  const contentType = readFirstString(payload, ["contentType", "content_type"]);
  const issues: ToolPostcheckIssue[] = [];

  if (!text) {
    issues.push(issue("web_fetch.empty_body", "web_fetch returned empty body"));
  }

  return {
    artifacts: {
      fetched_document: {
        url: readFirstString(payload, ["url", "finalUrl"]) || readFirstString(ctx.args, ["url"]),
        final_url: readFirstString(payload, ["finalUrl"]),
        status: payload.status,
        title,
        content_type: contentType,
        extract_mode: readFirstString(payload, ["extractMode"]),
        extractor: readFirstString(payload, ["extractor"]),
        body_chars: text.length,
        contains_numbers: /\d/.test(text),
        truncated: Boolean(payload.truncated),
      },
    },
    issues,
  };
}

function normalizeExecutionReport(ctx: ToolPostcheckRuleContext): {
  artifacts: Record<string, unknown>;
  issues: ToolPostcheckIssue[];
} {
  const payload = toRecord(ctx.payload);
  const stdout = readFirstString(payload, ["stdout", "output", "text"]);
  const stderr = readFirstString(payload, ["stderr", "error"]);
  const labels = stdout.match(/([a-z_][a-z0-9_]{2,})\s*[:=]\s*-?\d+(?:\.\d+)?/gi) ?? [];

  return {
    artifacts: {
      execution_report: {
        returncode: payload.returncode ?? payload.exitCode ?? null,
        stdout_chars: stdout.length,
        stderr_chars: stderr.length,
        labelled_metrics: Array.from(
          new Set(
            labels.map((label) => {
              const match = /^([a-z_][a-z0-9_]*)/i.exec(label);
              return match ? match[1]!.toLowerCase() : label.toLowerCase();
            }),
          ),
        ),
      },
    },
    issues: [],
  };
}

function normalizeStoreReport(ctx: ToolPostcheckRuleContext): {
  artifacts: Record<string, unknown>;
  issues: ToolPostcheckIssue[];
} {
  const payload = toRecord(ctx.payload);
  const issues: ToolPostcheckIssue[] = [];
  const id = payload.id ?? toRecord(payload.result).id ?? null;
  if (id === null || id === "") {
    issues.push(issue("knowledge_store.id_missing", "knowledge_store succeeded without returned id"));
  }
  return {
    artifacts: {
      store_report: {
        id,
        has_provenance_urls: Array.isArray(ctx.args.provenance_urls) && ctx.args.provenance_urls.length > 0,
        confidence_score: ctx.args.confidence_score ?? ctx.args.confidence,
        high_impact: Boolean(ctx.args.high_impact),
        text_chars: readFirstString(ctx.args, ["text", "content", "body", "data"]).length,
      },
    },
    issues,
  };
}

const SUCCESS_NORMALIZERS: Record<
  string,
  (ctx: ToolPostcheckRuleContext) => { artifacts: Record<string, unknown>; issues: ToolPostcheckIssue[] }
> = {
  web_search: normalizeSearchResultSet,
  web_fetch: normalizeFetchedDocument,
  exec: normalizeExecutionReport,
  knowledge_store: normalizeStoreReport,
};

export function runToolPostcheckRules(params: {
  toolName: string;
  args: unknown;
  result: unknown;
}): ToolPostcheckResult {
  const normalizedToolName = String(params.toolName || "").trim().toLowerCase();
  const args = toRecord(params.args);
  const payload = extractToolPayload(
    params.result && typeof params.result === "object"
      ? (params.result as { details?: unknown; content?: unknown })
      : undefined,
  ) ?? params.result;

  if (!normalizedToolName) {
    return {
      verdict: "hard_fail",
      reason: "tool name missing",
      issues: [issue("tool.name_missing", "tool name missing")],
      normalizedToolName: "tool",
      artifacts: {},
      payload,
    };
  }

  if (isFailurePayload(payload)) {
    const record = toRecord(payload);
    const error = truncate(record.error ?? record.message ?? "tool execution failed");
    const verdict = classifyError(normalizedToolName, error);
    return {
      verdict,
      reason: error || "tool execution failed",
      issues: error ? [issue("tool.error", error, "info")] : [],
      normalizedToolName,
      artifacts: {},
      payload,
    };
  }

  const normalizer = SUCCESS_NORMALIZERS[normalizedToolName];
  const normalized = normalizer
    ? normalizer({ toolName: normalizedToolName, args, payload })
    : { artifacts: {}, issues: [] as ToolPostcheckIssue[] };
  const hasErrors = normalized.issues.some((entry) => entry.severity === "error");

  return {
    verdict: hasErrors ? "hard_fail" : "accept",
    reason: hasErrors ? "postcheck artifact normalization failed" : "accepted",
    issues: normalized.issues,
    normalizedToolName,
    artifacts: normalized.artifacts,
    payload,
  };
}
