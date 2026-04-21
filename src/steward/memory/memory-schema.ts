import type { TruthAuditMetadata } from "../truth/truth-types.js";
import type { StewardKnowledgeMemoryType, RelationshipMemoryType } from "./memory-types.js";

export type StewardKnowledgeRow = {
  id: number;
  sessionKey: string | null;
  memoryType: StewardKnowledgeMemoryType;
  text: string;
  metadataJson: string;
  embeddingBlob: Uint8Array;
  embeddingDims: number;
  embeddingModel: string;
  createdTs: number;
  updatedTs: number;
};

export type StewardMemoryRow = {
  id: number;
  sessionKey: string;
  knowledgeId: number;
  memoryType: RelationshipMemoryType;
  importance: number;
  salienceWeight: number;
  source: string;
  taskId: number | null;
  payloadJson: string;
  confidenceScore: number | null;
  lastVerifiedTs: number | null;
  createdTs: number;
  updatedTs: number;
};

export type StewardKnowledgeMetadata = Record<string, unknown> & {
  truth_audit?: TruthAuditMetadata;
};
