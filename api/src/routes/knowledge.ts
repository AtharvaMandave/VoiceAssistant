// ─── Knowledge & Documents Router ──────────────────────────────────────────
// Routes for document upload, ingestion, chunking, and vector search.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import {
  listDocuments,
  createDocument,
  getDocument,
  deleteDocument,
  reindexDocument,
  queryKnowledgeEndpoint,
} from "../controllers/knowledgeController.js";

export const documentsRouter = Router({ mergeParams: true });

// Mounted at: /api/agents/:agentId/documents
documentsRouter.get("/", listDocuments);
documentsRouter.post("/", createDocument);
documentsRouter.get("/:docId", getDocument);
documentsRouter.delete("/:docId", deleteDocument);
documentsRouter.post("/:docId/reindex", reindexDocument);

export const knowledgeRouter = Router({ mergeParams: true });

// Mounted at: /api/agents/:agentId/knowledge
knowledgeRouter.post("/query", queryKnowledgeEndpoint);
