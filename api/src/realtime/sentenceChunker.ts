// ─── Streaming Sentence Chunker ─────────────────────────────────────────────
// Buffers incoming LLM token deltas and emits complete sentences for pipelined
// TTS synthesis. Each sentence starts synthesizing immediately without waiting
// for the full LLM response.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sentence boundary detection for streaming text.
 * Accumulates tokens and emits when a sentence-ending punctuation is detected.
 */
export class SentenceChunker {
  private buffer = "";

  /**
   * Minimum characters before we consider emitting a sentence.
   * Prevents very short fragments like "I." from being sent to TTS individually.
   */
  private readonly minSentenceLength: number;

  constructor(minSentenceLength = 15) {
    this.minSentenceLength = minSentenceLength;
  }

  /**
   * Feed a token delta from the LLM stream. Returns any complete sentences
   * that are ready for TTS synthesis.
   */
  addToken(token: string): string[] {
    this.buffer += token;
    const emitted: string[] = [];

    // Check for sentence boundaries
    let searchFrom = 0;
    while (true) {
      const boundaryIndex = this.findSentenceBoundary(this.buffer, searchFrom);
      if (boundaryIndex === -1) break;

      const candidate = this.buffer.slice(0, boundaryIndex + 1).trim();
      if (candidate.length < this.minSentenceLength) {
        // Too short — search for next boundary further in the buffer
        searchFrom = boundaryIndex + 1;
        continue;
      }

      // Valid sentence of sufficient length
      emitted.push(candidate);
      this.buffer = this.buffer.slice(boundaryIndex + 1);
      searchFrom = 0;
    }

    return emitted;
  }

  /**
   * Flush any remaining buffered text as a final sentence.
   * Call this when the LLM stream ends.
   */
  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = "";
    return remaining.length > 0 ? remaining : null;
  }

  /**
   * Reset the chunker state.
   */
  reset(): void {
    this.buffer = "";
  }

  /**
   * Find the index of the next sentence boundary in the text.
   * Handles common cases: periods, exclamation marks, question marks,
   * newlines, and avoids false positives on abbreviations.
   */
  private findSentenceBoundary(text: string, startIndex = 0): number {
    // Sentence-ending patterns: ". ", "! ", "? ", ".\n", "!\n", "?\n"
    // We look for punctuation followed by whitespace or end-of-buffer
    const sentenceEnders = /[.!?]\s/g;
    sentenceEnders.lastIndex = startIndex;
    let match: RegExpExecArray | null;
    let lastBoundary = -1;

    while ((match = sentenceEnders.exec(text)) !== null) {
      const idx = match.index;

      // Skip common abbreviations (e.g., "Mr.", "Dr.", "U.S.")
      if (this.isAbbreviation(text, idx)) continue;

      // Skip decimal numbers (e.g., "3.14")
      if (this.isDecimalNumber(text, idx)) continue;

      lastBoundary = idx;
      break; // Return the first valid boundary
    }

    // Also check for newline-delimited sentences
    if (lastBoundary === -1) {
      const newlineIdx = text.indexOf("\n", startIndex);
      if (newlineIdx > 0 && text.slice(0, newlineIdx).trim().length >= this.minSentenceLength) {
        lastBoundary = newlineIdx;
      }
    }

    return lastBoundary;
  }

  /**
   * Check if a period at position idx is part of a common abbreviation.
   */
  private isAbbreviation(text: string, idx: number): boolean {
    const abbreviations = [
      "Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.",
      "vs.", "etc.", "i.e.", "e.g.", "U.S.", "U.K.",
    ];

    for (const abbr of abbreviations) {
      const start = idx - abbr.length + 1;
      if (start >= 0 && text.slice(start, idx + 1) === abbr) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a period at position idx is part of a decimal number (e.g., 3.14).
   */
  private isDecimalNumber(text: string, idx: number): boolean {
    if (text[idx] !== ".") return false;
    const before = idx > 0 ? text[idx - 1] : "";
    const after = idx < text.length - 1 ? text[idx + 1] : "";
    return /\d/.test(before) && /\d/.test(after);
  }
}
