/**
 * BD-6 artifact: Consequence → approval bridge mapping.
 *
 * Maps PEQS consequence recommendations to OpenClaw AcpApprovalClass
 * outcomes. This is the type contract WS-D must implement.
 *
 * PEQS recommendations (from consequence_simulator):
 *   ALLOW                   — consequence check passed; proceed
 *   WARN                    — risk detected but not blocking; surface to operator
 *   REROUTE                 — block this action; suggest safer alternative
 *   REFUSE                  — hard block; do not execute
 *   ALLOW_BY_OPERATOR_OVERRIDE — normally blocked but operator explicitly authorized
 *
 * OpenClaw AcpApprovalClass (from src/acp/approval-classifier.ts):
 *   readonly_scoped   — read-only, scoped to session/workspace
 *   readonly_search   — read-only search tools
 *   mutating          — file/state writes
 *   exec_capable      — shell/code execution
 *   control_plane     — session/agent control (owner-gated)
 *   interactive       — requires user interaction
 *   other             — owner-only tools that don't fit above
 *   unknown           — tool not recognized by ACP classifier
 */

import type { AcpApprovalClass } from "../../acp/approval-classifier.js";

export type ConsequenceRecommendation =
  | "ALLOW"
  | "WARN"
  | "REROUTE"
  | "REFUSE"
  | "ALLOW_BY_OPERATOR_OVERRIDE";

/**
 * The bridge decision output consumed by WS-D's consequence gate.
 */
export type ConsequenceBridgeDecision = {
  /** Whether to forward the ACP approval request (true) or deny it (false). */
  approve: boolean;
  /**
   * Whether operator escalation is required before execution proceeds.
   * true → gate is held open; an operator_approval event must arrive before
   * the tool call continues. WS-D emits a steward event and suspends.
   */
  requireOperatorEscalation: boolean;
  /**
   * Whether to persist a steward consequence event regardless of approve/deny.
   * Always true for exec_capable and control_plane classes.
   */
  persistConsequenceEvent: boolean;
  /**
   * Human-readable annotation surfaced in the ACP denial reason or warning.
   * Empty string when approve=true and no annotation is needed.
   */
  annotation: string;
  /**
   * True when the approval was granted by ALLOW_BY_OPERATOR_OVERRIDE.
   * WS-D must persist an override record to steward_proofs when this is true.
   */
  operatorOverride: boolean;
};

/**
 * BD-6 mapping table.
 *
 * Primary action is determined by the PEQS recommendation.
 * Escalation / persistence modifiers are applied based on AcpApprovalClass.
 *
 * Modifier rules (applied on top of primary action):
 *   readonly_scoped / readonly_search — no modifier
 *   mutating                          — persistConsequenceEvent=true on any approve
 *   exec_capable                      — persistConsequenceEvent=true;
 *                                       requireOperatorEscalation=true on WARN
 *   control_plane                     — requireOperatorEscalation=true on any approve;
 *                                       persistConsequenceEvent=true always
 *   interactive                       — no modifier
 *   other                             — requireOperatorEscalation=true on WARN or REROUTE
 *   unknown                           — treated as mutating + requireOperatorEscalation=true
 */
export function resolveBridgeDecision(
  recommendation: ConsequenceRecommendation,
  approvalClass: AcpApprovalClass,
  annotationText?: string,
): ConsequenceBridgeDecision {
  // ── primary action ────────────────────────────────────────────────────────
  const operatorOverride = recommendation === "ALLOW_BY_OPERATOR_OVERRIDE";
  const primaryApprove =
    recommendation === "ALLOW" ||
    recommendation === "WARN" ||
    operatorOverride;
  const annotation = annotationText ?? (primaryApprove ? "" : recommendation.toLowerCase());

  // base decision from primary action
  let approve               = primaryApprove;
  let requireOperatorEscalation = false;
  let persistConsequenceEvent   = false;

  // ── class modifier ────────────────────────────────────────────────────────
  switch (approvalClass) {
    case "readonly_scoped":
    case "readonly_search":
    case "interactive":
      // no modifier
      break;

    case "mutating":
      if (approve) {
        persistConsequenceEvent = true;
      }
      break;

    case "exec_capable":
      persistConsequenceEvent = true; // always log exec-class consequences
      if (approve && recommendation === "WARN") {
        requireOperatorEscalation = true;
      }
      break;

    case "control_plane":
      persistConsequenceEvent = true; // always log control-plane consequences
      if (approve) {
        requireOperatorEscalation = true; // operator must confirm any control-plane approval
      }
      break;

    case "other":
      if (recommendation === "WARN" || recommendation === "REROUTE") {
        requireOperatorEscalation = true;
      }
      break;

    case "unknown":
      // treat unknown tools as mutating + escalate
      if (approve) {
        persistConsequenceEvent   = true;
        requireOperatorEscalation = true;
      }
      break;

    default: {
      const _exhaustive: never = approvalClass;
      void _exhaustive;
    }
  }

  // operator override always persists a record
  if (operatorOverride) {
    persistConsequenceEvent = true;
  }

  return { approve, requireOperatorEscalation, persistConsequenceEvent, annotation, operatorOverride };
}

/**
 * Convenience: resolve the bridge decision and return only whether to approve.
 * Used in fast-path checks where full decision detail is not needed.
 */
export function shouldApprove(
  recommendation: ConsequenceRecommendation,
  approvalClass: AcpApprovalClass,
): boolean {
  return resolveBridgeDecision(recommendation, approvalClass).approve;
}
