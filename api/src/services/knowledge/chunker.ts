// ─── Structure-Aware Recursive Chunker ─────────────────────────────────────────
// Splits raw text into structure-aware, semantic chunks with overlap and metadata.
// ─────────────────────────────────────────────────────────────────────────────

export interface ChunkOptions {
  chunkSize?: number; // Target chunk character length (default: 500)
  chunkOverlap?: number; // Character overlap between consecutive chunks (default: 60)
  minChunkSize?: number; // Minimum acceptable chunk length (default: 50)
}

export interface TextChunk {
  chunkIndex: number;
  text: string;
  tokenCount: number;
  section?: string;
}

/**
 * Normalizes and cleans raw text input.
 */
export function cleanText(input: string): string {
  if (!input) return "";
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove ASCII control characters
    .replace(/\n{3,}/g, "\n\n") // Collapse excessive blank lines
    .trim();
}

/**
 * Estimates token count from character count (~4 chars per token for English).
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

/**
 * Extracts section title from markdown heading if present.
 */
function extractHeading(text: string): string | undefined {
  const headingMatch = text.match(/^#{1,4}\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }
  return undefined;
}

/**
 * Splits text into chunks using recursive structural delimiters:
 * 1. Markdown headings (###, ##, #)
 * 2. Paragraph breaks (\n\n)
 * 3. Line breaks (\n)
 * 4. Sentence endings (. , ! , ? )
 * 5. Word boundaries ( )
 */
export function chunkText(rawText: string, options: ChunkOptions = {}): TextChunk[] {
  const cleaned = cleanText(rawText);
  if (!cleaned) return [];

  const chunkSize = options.chunkSize ?? 500;
  const chunkOverlap = options.chunkOverlap ?? 60;
  const minChunkSize = options.minChunkSize ?? 50;

  // If text is already smaller than or equal to chunkSize, return a single chunk
  if (cleaned.length <= chunkSize) {
    return [
      {
        chunkIndex: 0,
        text: cleaned,
        tokenCount: estimateTokens(cleaned),
        section: extractHeading(cleaned),
      },
    ];
  }

  const chunks: TextChunk[] = [];
  let currentSection: string | undefined = undefined;

  // Split primarily by double newlines or markdown headings
  const primaryBlocks = cleaned.split(/\n\n+/);
  let currentBuffer = "";

  for (const block of primaryBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    // Check if this block introduces a new heading
    const blockHeading = extractHeading(trimmedBlock);
    if (blockHeading) {
      currentSection = blockHeading;
    }

    // If adding this block exceeds chunkSize
    if (currentBuffer.length > 0 && currentBuffer.length + trimmedBlock.length + 2 > chunkSize) {
      // Flush currentBuffer as a chunk
      chunks.push({
        chunkIndex: chunks.length,
        text: currentBuffer.trim(),
        tokenCount: estimateTokens(currentBuffer),
        section: currentSection,
      });

      // Maintain overlap by retaining the trailing portion of currentBuffer
      if (chunkOverlap > 0 && currentBuffer.length > chunkOverlap) {
        const overlapSlice = currentBuffer.slice(-chunkOverlap).trim();
        currentBuffer = overlapSlice + "\n\n" + trimmedBlock;
      } else {
        currentBuffer = trimmedBlock;
      }
    } else {
      if (currentBuffer.length > 0) {
        currentBuffer += "\n\n" + trimmedBlock;
      } else {
        currentBuffer = trimmedBlock;
      }
    }

    // If currentBuffer itself is significantly larger than chunkSize (giant block without paragraphs)
    while (currentBuffer.length > chunkSize) {
      // Find a sentence or word break near chunkSize
      let breakIndex = -1;
      const searchWindow = currentBuffer.slice(0, chunkSize);

      // Try sentence breaks
      const sentenceMatch = searchWindow.match(/(?:[.?!])\s+(?=[A-Z0-9])/g);
      if (sentenceMatch) {
        breakIndex = searchWindow.lastIndexOf(sentenceMatch[sentenceMatch.length - 1]) + 1;
      }

      // Try line breaks
      if (breakIndex <= 0) {
        breakIndex = searchWindow.lastIndexOf("\n");
      }

      // Try space breaks
      if (breakIndex <= 0) {
        breakIndex = searchWindow.lastIndexOf(" ");
      }

      // Hard break if no delimiter found
      if (breakIndex <= 0) {
        breakIndex = chunkSize;
      }

      const chunkPiece = currentBuffer.slice(0, breakIndex).trim();
      if (chunkPiece.length >= minChunkSize) {
        chunks.push({
          chunkIndex: chunks.length,
          text: chunkPiece,
          tokenCount: estimateTokens(chunkPiece),
          section: currentSection,
        });
      }

      // Retain remainder with overlap
      const remainderStart = Math.max(0, breakIndex - chunkOverlap);
      currentBuffer = currentBuffer.slice(remainderStart).trim();
      if (currentBuffer.length <= chunkSize) {
        break;
      }
    }
  }

  // Flush any remaining buffer
  if (currentBuffer.trim().length >= minChunkSize) {
    chunks.push({
      chunkIndex: chunks.length,
      text: currentBuffer.trim(),
      tokenCount: estimateTokens(currentBuffer),
      section: currentSection,
    });
  } else if (currentBuffer.trim().length > 0 && chunks.length > 0) {
    // Append small remainder to the last chunk
    const lastChunk = chunks[chunks.length - 1];
    lastChunk.text += "\n\n" + currentBuffer.trim();
    lastChunk.tokenCount = estimateTokens(lastChunk.text);
  } else if (currentBuffer.trim().length > 0) {
    chunks.push({
      chunkIndex: 0,
      text: currentBuffer.trim(),
      tokenCount: estimateTokens(currentBuffer),
      section: currentSection,
    });
  }

  return chunks;
}
