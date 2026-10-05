// ─── Knowledge Ingestion Pipeline ─────────────────────────────────────────────
// Ingests, normalizes, chunks, embeds, and indexes documents into the vector store.
// ─────────────────────────────────────────────────────────────────────────────

import type { IDocumentDocument } from "../../models/Document.js";
import { KnowledgeChunkModel } from "../../models/KnowledgeChunk.js";
import { chunkText } from "./chunker.js";
import { generateEmbeddings } from "./embeddings.js";
import type { FAQItem } from "@voiceflow/shared";

export interface IngestionInput {
  document: IDocumentDocument;
  rawContent?: string;
  faqItems?: FAQItem[];
  url?: string;
  fileData?: string;
  fileName?: string;
}

/**
 * Strips HTML markup and scripts from raw web page content.
 */
function extractHtmlText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts clean plain text based on document source type.
 */
export async function extractContentText(input: IngestionInput): Promise<string> {
  const { document, rawContent, faqItems, url, fileData } = input;

  // 1. FAQ Format
  if (document.sourceType === "faq" && faqItems && faqItems.length > 0) {
    return faqItems
      .map((item) => `### Q: ${item.question.trim()}\nA: ${item.answer.trim()}`)
      .join("\n\n");
  }

  // 2. Direct Text / Markdown
  if (rawContent && rawContent.trim()) {
    return rawContent.trim();
  }

  // 3. Web URL
  if (document.sourceType === "url" && url) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "VoiceFlow-AI-Bot/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} when fetching URL: ${url}`);
      }
      const html = await response.text();
      return extractHtmlText(html);
    } catch (err: any) {
      throw new Error(`Failed to retrieve content from URL "${url}": ${err.message}`);
    }
  }

  // 4. File Data (Base64 or UTF-8 text string)
  if (fileData) {
    let text = fileData;
    if (fileData.startsWith("data:") && fileData.includes(";base64,")) {
      const base64Data = fileData.split(";base64,")[1];
      text = Buffer.from(base64Data, "base64").toString("utf-8");
    }
    return text.trim();
  }

  // Fallback to metadata content if present
  if (document.metadata?.content && typeof document.metadata.content === "string") {
    return document.metadata.content.trim();
  }

  return "";
}

/**
 * Runs the complete ingestion and vector indexing pipeline for a document.
 */
export async function ingestDocument(input: IngestionInput): Promise<IDocumentDocument> {
  const { document } = input;

  try {
    // 1. Mark status as processing
    document.status = "processing";
    document.errorMessage = undefined;
    await document.save();

    // 2. Extract plain text content
    const textContent = await extractContentText(input);

    if (!textContent || textContent.trim().length === 0) {
      throw new Error("No readable text content found for this document");
    }

    // 3. Split text into structure-aware chunks
    const chunks = chunkText(textContent, {
      chunkSize: 500,
      chunkOverlap: 60,
      minChunkSize: 30,
    });

    if (chunks.length === 0) {
      throw new Error("Document content could not be chunked into valid sections");
    }

    // 4. Generate embeddings for all chunks in batch
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    // 5. Remove any previous chunks for this document (idempotent reindexing)
    await KnowledgeChunkModel.deleteMany({ documentId: document._id });

    // 6. Insert new vector chunks
    const chunkDocs = chunks.map((chunk, idx) => ({
      organizationId: document.organizationId,
      agentId: document.agentId,
      documentId: document._id,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      embedding: embeddings[idx] || [],
      tokenCount: chunk.tokenCount,
      metadata: {
        title: document.title,
        sourceType: document.sourceType,
        section: chunk.section,
        originalFilename: document.metadata?.originalFilename,
      },
    }));

    await KnowledgeChunkModel.insertMany(chunkDocs);

    // 7. Calculate totals and mark ready
    const totalTokens = chunks.reduce((acc, c) => acc + c.tokenCount, 0);
    document.status = "ready";
    document.chunkCount = chunks.length;
    document.tokenCount = totalTokens;
    await document.save();

    return document;
  } catch (err: any) {
    console.error(`[Ingestion] Failed for document ${document._id}:`, err);
    document.status = "failed";
    document.errorMessage = err.message || "Unknown error during ingestion";
    await document.save();
    return document;
  }
}
