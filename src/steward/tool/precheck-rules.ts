export type PrecheckVerdict = "accept" | "hard_fail" | "retry" | "reroute" | "refuse";

export type ToolPrecheckIssue = {
  code: string;
  detail: string;
};

export type ToolPrecheckResult = {
  verdict: PrecheckVerdict;
  reason: string;
  issues: ToolPrecheckIssue[];
  normalizedToolName: string;
  rerouteToolName?: string;
};

type RuleContext = {
  toolName: string;
  args: Record<string, unknown>;
};

type ToolPrecheckRule = (ctx: RuleContext) => ToolPrecheckResult | null;

const URL_LITERAL_RE = /https?:\/\//i;
const NETWORK_ACQUISITION_RE =
  /\b(requests|urllib|urllib2|http\.client|socket|curl|wget|invoke-webrequest|invoke-restmethod|new-object\s+net\.webclient|from\s+bs4|import\s+bs4)\b/i;

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

function hardFail(toolName: string, code: string, detail: string): ToolPrecheckResult {
  return {
    verdict: "hard_fail",
    reason: detail,
    issues: [{ code, detail }],
    normalizedToolName: toolName,
  };
}

function reroute(
  toolName: string,
  rerouteToolName: string,
  code: string,
  detail: string,
): ToolPrecheckResult {
  return {
    verdict: "reroute",
    reason: detail,
    issues: [{ code, detail }],
    normalizedToolName: toolName,
    rerouteToolName,
  };
}

const webSearchRule: ToolPrecheckRule = ({ toolName, args }) => {
  if (toolName !== "web_search") {
    return null;
  }
  if (!readFirstString(args, ["query", "q"])) {
    return hardFail(toolName, "web_search.query_missing", "web_search requires a non-empty query");
  }
  return null;
};

const webFetchRule: ToolPrecheckRule = ({ toolName, args }) => {
  if (toolName !== "web_fetch") {
    return null;
  }
  const url = readFirstString(args, ["url"]);
  if (!url) {
    return hardFail(toolName, "web_fetch.url_missing", "web_fetch requires a non-empty url");
  }
  if (!/^https?:\/\//i.test(url)) {
    return hardFail(
      toolName,
      "web_fetch.url_invalid",
      "web_fetch requires an absolute http:// or https:// url",
    );
  }
  return null;
};

const execRule: ToolPrecheckRule = ({ toolName, args }) => {
  if (toolName !== "exec") {
    return null;
  }
  const command = readFirstString(args, ["command", "cmd", "script", "code"]);
  if (!command) {
    return hardFail(toolName, "exec.command_missing", "exec requires a non-empty command");
  }
  if (NETWORK_ACQUISITION_RE.test(command)) {
    return reroute(
      toolName,
      "web_fetch",
      "exec.network_acquisition",
      "exec attempts remote acquisition/parsing; use web_fetch or web_search first, then compute locally",
    );
  }
  if (URL_LITERAL_RE.test(command)) {
    return reroute(
      toolName,
      "web_fetch",
      "exec.url_literal",
      "exec includes remote URL literals; fetch through web tools before running local compute",
    );
  }
  return null;
};

const fileReadWriteRule: ToolPrecheckRule = ({ toolName, args }) => {
  if (!["read", "write", "edit"].includes(toolName)) {
    return null;
  }
  const path = readFirstString(args, ["path", "filePath", "file"]);
  if (!path) {
    return hardFail(toolName, `${toolName}.path_missing`, `${toolName} requires a non-empty path`);
  }
  return null;
};

const applyPatchRule: ToolPrecheckRule = ({ toolName, args }) => {
  if (toolName !== "apply_patch") {
    return null;
  }
  const patch = readFirstString(args, ["patch", "content", "text", "input"]);
  if (!patch) {
    return hardFail(
      toolName,
      "apply_patch.patch_missing",
      "apply_patch requires a non-empty patch payload",
    );
  }
  return null;
};

const RULES: ToolPrecheckRule[] = [
  webSearchRule,
  webFetchRule,
  execRule,
  fileReadWriteRule,
  applyPatchRule,
];

export function runToolPrecheckRules(
  toolName: string,
  rawArgs: unknown,
): ToolPrecheckResult {
  const normalizedToolName = String(toolName || "").trim().toLowerCase();
  const args = toRecord(rawArgs);

  if (!normalizedToolName) {
    return hardFail("tool", "tool.name_missing", "tool name missing");
  }

  for (const rule of RULES) {
    const result = rule({ toolName: normalizedToolName, args });
    if (result) {
      return result;
    }
  }

  return {
    verdict: "accept",
    reason: "accepted",
    issues: [],
    normalizedToolName,
  };
}

