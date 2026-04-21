import crypto from "node:crypto";
import { fetchRemoteEmbeddingVectors } from "../../memory-host-sdk/host/embeddings-remote-fetch.js";

export const STEWARD_EMBED_DIM = 768;
export const STEWARD_EMBED_MODEL = "text-embedding-nomic-embed-text-v1.5";

export type StewardEmbedder = (text: string) => Promise<Float32Array>;

export type StewardEmbeddingResult = {
  embedding: Float32Array;
  dimensions: number;
  model: string;
  fallback: boolean;
};

function normalizeEmbedding(values: number[]): Float32Array {
  const normalized = Float32Array.from(values);
  let magnitude = 0;
  for (const value of normalized) {
    magnitude += value * value;
  }
  const norm = Math.sqrt(magnitude) || 1;
  for (let index = 0; index < normalized.length; index += 1) {
    normalized[index] = normalized[index]! / norm;
  }
  return normalized;
}

export function deterministicStewardEmbedding(
  text: string,
  dimensions = STEWARD_EMBED_DIM,
): Float32Array {
  const input = Buffer.from(text, "utf8");
  const bytesNeeded = dimensions * 4;
  const chunks: Buffer[] = [];
  let counter = 0;
  let total = 0;
  while (total < bytesNeeded) {
    const chunk = crypto
      .createHash("sha256")
      .update(input)
      .update(Buffer.from(String(counter), "utf8"))
      .digest();
    chunks.push(chunk);
    total += chunk.length;
    counter += 1;
  }
  const combined = Buffer.concat(chunks, total).subarray(0, bytesNeeded);
  const floats = new Float32Array(
    combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength),
  );
  return normalizeEmbedding(Array.from(floats));
}

function resolveEmbeddingUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/$/, "");
  return trimmed.endsWith("/v1/embeddings") ? trimmed : `${trimmed}/v1/embeddings`;
}

export async function embedWithStewardModel(params: {
  text: string;
  embedder?: StewardEmbedder;
  fetchImpl?: typeof fetch;
}): Promise<StewardEmbeddingResult> {
  if (params.embedder) {
    const embedding = await params.embedder(params.text);
    return {
      embedding,
      dimensions: embedding.length,
      model: "custom",
      fallback: false,
    };
  }

  const remoteUrl = process.env.STEWARD_EMBED_URL?.trim();
  if (remoteUrl) {
    const vectors = await fetchRemoteEmbeddingVectors({
      url: resolveEmbeddingUrl(remoteUrl),
      headers: { "content-type": "application/json" },
      fetchImpl: params.fetchImpl,
      body: {
        model: STEWARD_EMBED_MODEL,
        input: [params.text.slice(0, 8_000)],
      },
      errorPrefix: "steward embedding fetch failed",
    });
    const vector = vectors[0] ?? [];
    if (vector.length > 0) {
      const embedding = normalizeEmbedding(vector);
      return {
        embedding,
        dimensions: embedding.length,
        model: STEWARD_EMBED_MODEL,
        fallback: false,
      };
    }
  }

  const embedding = deterministicStewardEmbedding(params.text);
  return {
    embedding,
    dimensions: embedding.length,
    model: "sha256-deterministic",
    fallback: true,
  };
}

export function resolveStewardEmbedder(fetchImpl?: typeof fetch): StewardEmbedder {
  return async (text: string) => (await embedWithStewardModel({ text, fetchImpl })).embedding;
}
