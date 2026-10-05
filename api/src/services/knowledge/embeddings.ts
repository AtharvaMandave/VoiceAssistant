// ─── Embedding Generation Service ───────────────────────────────────────────
// Generates vector embeddings for knowledge chunks and search queries.
// Supports OpenAI text-embedding-3-small and a deterministic local semantic vectorizer.
// ─────────────────────────────────────────────────────────────────────────────

const EMBEDDING_DIMENSION = 256;

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "for", "with", "is", "are", "was",
  "were", "at", "by", "all", "in", "on", "we", "our", "you", "your", "it", "this",
  "that", "from", "as", "be", "have", "has", "had", "can", "will"
]);

/**
 * Computes a 32-bit FNV-1a hash of a string.
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic Semantic Vectorizer (Offline / Local Dev Mode):
 * Tokenizes text into words and subword character n-grams, maps them to a fixed
 * dimensional space using multi-hash projections, and applies L2 normalization.
 * Two texts with overlapping keywords and concepts will produce high cosine similarity.
 */
export function generateLocalSemanticEmbedding(text: string, dimension = EMBEDDING_DIMENSION): number[] {
  const vector = new Float64Array(dimension);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const rawWords = normalized.split(/\s+/).filter((w) => w.length > 1);

  if (rawWords.length === 0) {
    // Return zero vector if text is empty
    return Array.from(vector);
  }

  // Filter out high-frequency stop words to avoid artificial collision overlap
  const contentWords = rawWords.filter((w) => !STOP_WORDS.has(w));
  const wordsToUse = contentWords.length > 0 ? contentWords : rawWords;

  // Count term frequencies
  const tfMap = new Map<string, number>();
  for (const word of wordsToUse) {
    tfMap.set(word, (tfMap.get(word) || 0) + 1.0);

    // Extract character trigrams for subword morphological capture (e.g. refund -> ref, fun, und)
    if (word.length >= 4) {
      for (let i = 0; i <= word.length - 3; i++) {
        const trigram = word.slice(i, i + 3);
        tfMap.set(trigram, (tfMap.get(trigram) || 0) + 0.15);
      }
    }
  }

  // Hash each feature into vector dimensions with dual sign hashing
  for (const [term, freq] of tfMap.entries()) {
    const weight = 1 + Math.log(1 + freq);
    const h1 = fnv1a(term);
    const h2 = fnv1a(term + "_sign");

    const index = h1 % dimension;
    const sign = (h2 & 1) === 0 ? 1 : -1;

    vector[index] += sign * weight;
  }

  // L2 Normalization so dot product equals cosine similarity
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dimension; i++) {
      vector[i] /= norm;
    }
  }

  return Array.from(vector);
}

/**
 * Generates an embedding for a single text string.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const [result] = await generateEmbeddings([text]);
  return result;
}

/**
 * Generates embeddings for a batch of text strings.
 * Falls back to local semantic vectorizer if OpenAI is not configured or fails.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey.startsWith("sk-")) {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: texts.map((t) => t.slice(0, 8000)), // OpenAI token bound
        }),
      });

      if (response.ok) {
        const json = (await response.json()) as { data: Array<{ embedding: number[] }> };
        if (json.data && json.data.length === texts.length) {
          return json.data.map((d) => d.embedding);
        }
      } else {
        console.warn(`[Embeddings] OpenAI API error: ${response.status}. Falling back to local vectorizer.`);
      }
    } catch (err) {
      console.warn("[Embeddings] OpenAI embedding request failed. Falling back to local vectorizer.", err);
    }
  }

  // Fallback to local deterministic semantic vectorizer
  return texts.map((text) => generateLocalSemanticEmbedding(text));
}

/**
 * Calculates cosine similarity between two unit vectors.
 * Returns a value between 0.0 (unrelated) and 1.0 (identical).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  const score = dotProduct / denominator;
  // Clamp between 0.0 and 1.0 for normalized similarity score
  return Math.max(0, Math.min(1, score));
}
