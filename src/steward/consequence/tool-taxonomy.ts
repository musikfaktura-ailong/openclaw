/**
 * BD-8 artifact: OpenClaw tool ID → steward consequence class mapping.
 *
 * Consequence classes (aligned with PEQS consequence_simulator):
 *
 *   fast_pass      Purely read-only tools. The consequence gate is never
 *                  entered. No check of any kind is performed.
 *
 *   always_allow   Internal-state-only writes. Gate is entered but returns
 *                  allow unconditionally after identity/session check.
 *
 *   truth_gated    Content-producing tools (file writes, patches). A
 *                  deterministic truth/grounding check runs — no LLM call.
 *                  Fails if content is ungrounded or contradicts known truth.
 *
 *   checked        Tools with external or hard-to-reverse effects. Full
 *                  LLM negation classification is required. Consequence
 *                  simulator evaluates reversibility, blast radius, and
 *                  stewardship alignment before returning allow/deny/escalate.
 *
 *   exec           Shell execution. Highest consequence class. Treated as
 *                  checked + mandatory approval annotation in the event log.
 *                  Every exec consequence is persisted regardless of outcome.
 *
 *   control_plane  Session/agent control tools. Structurally owner-gated.
 *                  Consequence check is performed then escalated to the
 *                  operator approval path before execution.
 *
 *   plugin         Tool is provided by a runtime plugin. Class is resolved
 *                  at plugin registration time via registerPluginToolClass().
 *                  Falls back to "checked" if not registered.
 *
 * Source files enumerated:
 *   src/agents/tool-catalog.ts      — 31 core tool IDs
 *   src/agents/tool-mutation.ts     — mutating vs. read-only classification
 *   src/agents/tool-policy.ts       — owner-only / control-plane flags
 *   src/agents/tool-policy-shared.ts — name aliases and group expansion
 *   src/acp/approval-classifier.ts  — execution-capable and safe-search sets
 */

export type ConsequenceClass =
  | "fast_pass"
  | "always_allow"
  | "truth_gated"
  | "checked"
  | "exec"
  | "control_plane"
  | "plugin";

/**
 * Static taxonomy. Keys are canonical OpenClaw tool IDs (lowercase, underscore).
 * Aliases (e.g. "bash" → "exec") are resolved before lookup via resolveToolId().
 */
export const TOOL_TAXONOMY: Readonly<Record<string, ConsequenceClass>> = {
  // ── read-only / fast-pass ──────────────────────────────────────────────────
  read:             "fast_pass",   // read file contents
  web_search:       "fast_pass",   // search the web; no side effects
  x_search:         "fast_pass",   // search X posts; no side effects
  web_fetch:        "fast_pass",   // fetch URL; read-only
  memory_search:    "fast_pass",   // semantic search over knowledge store
  memory_get:       "fast_pass",   // read memory files
  sessions_list:    "fast_pass",   // list visible sessions
  sessions_history: "fast_pass",   // read sanitized message history
  agents_list:      "fast_pass",   // list agents; no mutation
  image:            "fast_pass",   // image understanding; read-only
  // session_status is fast_pass by default; downgraded to "checked" when model param present
  session_status:   "fast_pass",

  // ── always-allow (internal state, low/reversible consequence) ─────────────
  update_plan:      "always_allow", // structured work plan; internal only
  sessions_yield:   "always_allow", // end-of-turn signal; no persistent side effect
  code_execution:   "always_allow", // sandboxed remote analysis; sandbox contains blast radius

  // ── truth-gated (content-producing; deterministic check, no LLM) ──────────
  write:            "truth_gated",  // create or overwrite file
  edit:             "truth_gated",  // make precise edits to file
  apply_patch:      "truth_gated",  // apply patch to file

  // ── checked (external or hard-to-reverse; LLM negation classification) ────
  message:          "checked",      // send external messages (Slack/email/etc.)
  subagents:        "checked",      // kill or steer sub-agents; mutating actions only
  browser:          "checked",      // browser automation; can submit forms, click, navigate
  canvas:           "checked",      // canvas mutations; visual output with external reach
  image_generate:   "checked",      // generative output; hallucination / truth risk
  music_generate:   "checked",      // generative output
  video_generate:   "checked",      // generative output
  tts:              "checked",      // generative audio output

  // ── exec (shell execution; highest consequence class) ─────────────────────
  exec:             "exec",         // run shell commands
  bash:             "exec",         // alias — resolved to exec before taxonomy lookup
  process:          "exec",         // inspect/control running exec sessions; mutating actions inherit exec class

  // ── control-plane (session/agent control; owner-gated + escalation) ───────
  sessions_send:    "control_plane", // send message to another session
  sessions_spawn:   "control_plane", // spawn sub-agent or ACP session
  cron:             "control_plane", // schedule persistent jobs; owner-only per tool-policy.ts
  gateway:          "control_plane", // gateway control; owner-only per tool-policy.ts
  nodes:            "control_plane", // device/node control; owner-only + exec-capable per tool-policy.ts
};

/**
 * Aliases that must be resolved before taxonomy lookup.
 * Source: src/agents/tool-policy-shared.ts
 */
export const TOOL_ID_ALIASES: Readonly<Record<string, string>> = {
  bash:          "exec",
  "apply-patch": "apply_patch",
  search:        "web_search",  // safe-search alias from approval-classifier.ts
  spawn:         "sessions_spawn",
  shell:         "exec",
};

/**
 * Resolve a raw tool name to its canonical tool ID before taxonomy lookup.
 */
export function resolveToolId(rawName: string): string {
  const lower = rawName.toLowerCase().replace(/-/g, "_");
  return TOOL_ID_ALIASES[lower] ?? lower;
}

/**
 * Registry for plugin-provided tools. Populated at plugin registration time.
 * Falls back to "checked" for unregistered plugins.
 */
const _pluginRegistry: Map<string, ConsequenceClass> = new Map();

export function registerPluginToolClass(toolId: string, cls: ConsequenceClass): void {
  _pluginRegistry.set(resolveToolId(toolId), cls);
}

/**
 * Read-only action names used to downgrade conditionally-mutating tools.
 * Source: src/agents/tool-mutation.ts
 */
const READ_ONLY_ACTIONS = new Set([
  "get", "list", "read", "status", "show", "fetch",
  "search", "query", "view", "poll", "log", "inspect", "check", "probe",
]);

/** Tools that are only mutating on certain actions; read-only actions → fast_pass. */
const CONDITIONALLY_MUTATING = new Set(["process", "cron", "canvas", "gateway", "nodes"]);

/**
 * Resolve the consequence class for a given tool ID.
 *
 * Special cases:
 *   - "session_status" with model param → downgraded to "checked"
 *   - conditionally-mutating tools with a read-only action → fast_pass
 *   - plugin-provided tools → resolved from plugin registry, fallback "checked"
 */
export function resolveConsequenceClass(
  rawToolId: string,
  opts?: {
    /** true when session_status is called with a model param */
    hasModelParam?: boolean;
    /** action string for conditionally-mutating tools */
    action?: string;
  },
): ConsequenceClass {
  const toolId = resolveToolId(rawToolId);

  if (toolId === "session_status" && opts?.hasModelParam) {
    return "checked";
  }

  if (opts?.action && READ_ONLY_ACTIONS.has(opts.action.toLowerCase()) && CONDITIONALLY_MUTATING.has(toolId)) {
    return "fast_pass";
  }

  const pluginClass = _pluginRegistry.get(toolId);
  if (pluginClass) {
    return pluginClass;
  }

  return TOOL_TAXONOMY[toolId] ?? "checked";
}
