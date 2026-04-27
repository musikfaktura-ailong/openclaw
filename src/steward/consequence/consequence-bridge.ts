// Compatibility shim: the seam-owning bridge now lives in action-policy-bridge.ts.
// Keep this re-export temporarily so existing imports/tests outside the primary
// consequence seam can transition without breaking.
export {
  resolveBridgeDecision,
  shouldApprove,
  type ConsequenceBridgeDecision,
  type ConsequenceRecommendation,
} from "./action-policy-bridge.js";
