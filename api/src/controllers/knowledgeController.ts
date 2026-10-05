// ─── Knowledge Controller ───────────────────────────────────────────────────
// Manages documents, ingestion, chunking, and vector search retrieval.
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { AgentModel } from "../models/Agent.js";
import { DocumentModel } from "../models/Document.js";
import { KnowledgeChunkModel } from "../models/KnowledgeChunk.js";
import { ingestDocument } from "../services/knowledge/ingestionService.js";
import { searchKnowledge } from "../services/knowledge/vectorSearch.js";
import { ApiError } from "../utils/ApiError.js";
import { sendSuccess, sendCreated } from "../utils/response.js";
import {
  CreateDocumentSchema,
  QueryKnowledgeSchema,
} from "@voiceflow/shared";

/**
 * GET /api/agents/:agentId/documents
 * List all knowledge documents uploaded for an agent.
 */
export async function listDocuments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { agentId } = req.params;

    const agent = await AgentModel.findOne({
      _id: agentId,
      organizationId,
      status: { $ne: "archived" },
    });

    if (!agent) {
      throw ApiError.notFound(`Agent "${agentId}" not found`);
    }

    const documents = await DocumentModel.find({
      organizationId,
      agentId,
    }).sort({ createdAt: -1 });

    sendSuccess(res, documents);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/agents/:agentId/documents
 * Upload / add a knowledge source (text, FAQ, URL, or file) and trigger vector ingestion.
 */
export async function createDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { agentId } = req.params;

    const validated = CreateDocumentSchema.parse(req.body);

    const agent = await AgentModel.findOne({
      _id: agentId,
      organizationId,
      status: { $ne: "archived" },
    });

    if (!agent) {
      throw ApiError.notFound(`Agent "${agentId}" not found`);
    }

    // 1. Create document entry
    const doc = await DocumentModel.create({
      organizationId,
      agentId: agent._id,
      title: validated.title,
      sourceType: validated.sourceType,
      status: "pending",
      chunkCount: 0,
      tokenCount: 0,
      metadata: {
        originalFilename: validated.fileName,
        fileSize: validated.fileSize,
        url: validated.url,
        faqCount: validated.faqItems?.length,
        ...validated.metadata,
      },
    });

    // 2. Trigger ingestion pipeline
    const indexedDoc = await ingestDocument({
      document: doc,
      rawContent: validated.content,
      faqItems: validated.faqItems,
      url: validated.url,
      fileData: validated.fileData,
      fileName: validated.fileName,
    });

    sendCreated(res, indexedDoc);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/agents/:agentId/documents/:docId
 * Retrieve a specific document and sample of its indexed chunks.
 */
export async function getDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { agentId, docId } = req.params;

    const doc = await DocumentModel.findOne({
      _id: docId,
      agentId,
      organizationId,
    });

    if (!doc) {
      throw ApiError.notFound(`Document "${docId}" not found`);
    }

    const chunks = await KnowledgeChunkModel.find({
      documentId: doc._id,
    })
      .sort({ chunkIndex: 1 })
      .limit(20);

    sendSuccess(res, {
      document: doc,
      chunks,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/agents/:agentId/documents/:docId
 * Delete document and cascade delete all associated knowledge chunks.
 */
export async function deleteDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { agentId, docId } = req.params;

    const doc = await DocumentModel.findOne({
      _id: docId,
      agentId,
      organizationId,
    });

    if (!doc) {
      throw ApiError.notFound(`Document "${docId}" not found`);
    }

    // Cascade delete chunks from vector store
    await KnowledgeChunkModel.deleteMany({
      documentId: doc._id,
    });

    await DocumentModel.deleteOne({ _id: doc._id });

    sendSuccess(res, {
      id: docId,
      deleted: true,
      message: `Document "${doc.title}" and its chunks deleted successfully`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/agents/:agentId/documents/:docId/reindex
 * Re-index an existing document.
 */
export async function reindexDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const { agentId, docId } = req.params;

    const doc = await DocumentModel.findOne({
      _id: docId,
      agentId,
      organizationId,
    });

    if (!doc) {
      throw ApiError.notFound(`Document "${docId}" not found`);
    }

    const reindexed = await ingestDocument({
      document: doc,
      rawContent: (doc.metadata?.content as string) || undefined,
      url: (doc.metadata?.url as string) || undefined,
    });

    sendSuccess(res, reindexed);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/agents/:agentId/knowledge/query
 * Interactive vector similarity search tester endpoint.
 */
export async function queryKnowledgeEndpoint(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organizationId!;
    const agentId = req.params.agentId as string;

    const validated = QueryKnowledgeSchema.parse(req.body);

    const agent = await AgentModel.findOne({
      _id: agentId,
      organizationId,
      status: { $ne: "archived" },
    });

    if (!agent) {
      throw ApiError.notFound(`Agent "${agentId}" not found`);
    }

    const result = await searchKnowledge({
      agentId: agent._id.toString(),
      organizationId,
      query: validated.query,
      topK: validated.topK,
      minScore: validated.minScore,
      documentId: validated.documentId,
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
