// ─── Vector Search Service ───────────────────────────────────────────────────
// Performs vector similarity retrieval across agent knowledge chunks.
// ─────────────────────────────────────────────────────────────────────────────

import { KnowledgeChunkModel } from "../../models/KnowledgeChunk.js";
import { generateEmbedding, cosineSimilarity } from "./embeddings.js";
import type { RetrievedChunkSnippet, KnowledgeQueryResult } from "@voiceflow/shared";

export interface VectorSearchParams {
  agentId: string;
  organizationId?: string;
  query: string;
  topK?: number;
  minScore?: number;
  documentId?: string;
}

/**
 * Searches agent knowledge chunks using vector cosine similarity.
 */
export async function searchKnowledge(params: VectorSearchParams): Promise<KnowledgeQueryResult> {
  const startTime = Date.now();
  const topK = params.topK ?? 5;
  const minScore = params.minScore ?? 0.2;

  // 1. Generate embedding for search query
  const queryEmbedding = await generateEmbedding(params.query);

  // 2. Build query filter
  const filter: Record<string, unknown> = {
    agentId: params.agentId,
  };

  if (params.documentId) {
    filter.documentId = params.documentId;
  }

  // 3. Fetch candidate chunks for agent
  const chunks = await KnowledgeChunkModel.find(filter).lean();

  if (!chunks || chunks.length === 0) {
    return {
      query: params.query,
      agentId: params.agentId,
      chunks: [],
      latencyMs: Date.now() - startTime,
    };
  }

  // 4. Score each chunk using cosine similarity
  const scoredChunks: Array<{ chunk: any; score: number }> = [];

  for (const chunk of chunks) {
    if (!chunk.embedding || chunk.embedding.length === 0) continue;

    const score = cosineSimilarity(queryEmbedding, chunk.embedding);
    if (score >= minScore) {
      scoredChunks.push({ chunk, score });
    }
  }

  // 5. Rank by score descending and take top-K
  scoredChunks.sort((a, b) => b.score - a.score);
  const topMatches = scoredChunks.slice(0, topK);

  // 6. Format as RetrievedChunkSnippet
  const results: RetrievedChunkSnippet[] = topMatches.map(({ chunk, score }) => ({
    id: chunk._id.toString(),
    documentId: chunk.documentId.toString(),
    title: chunk.metadata?.title || "Knowledge Document",
    sourceType: (chunk.metadata?.sourceType as any) || "text",
    score: Math.round(score * 1000) / 1000,
    text: chunk.text,
    chunkIndex: chunk.chunkIndex,
  }));

  return {
    query: params.query,
    agentId: params.agentId,
    chunks: results,
    latencyMs: Date.now() - startTime,
  };
}
