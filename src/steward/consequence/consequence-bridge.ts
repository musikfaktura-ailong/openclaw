/**
 * @deprecated Use `./action-policy-bridge.js` directly. Remove this shim before
 * tranche-close after the remaining post-P-1 follow-up slices are merged.
 *
 * Compatibility shim: the seam-owning bridge now lives in
 * `action-policy-bridge.ts`. Keep this re-export only until downstream imports
 * have been fully migrated.
 */
export {
  resolveBridgeDecision,
  shouldApprove,
  type ConsequenceBridgeDecision,
  type ConsequenceRecommendation,
} from "./action-policy-bridge.js";
