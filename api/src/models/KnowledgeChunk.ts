// ─── KnowledgeChunk Model ───────────────────────────────────────────────────
// Stores individual text chunks and vector embeddings extracted from documents.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document as MongooseDocument, Types } from "mongoose";
import type { DocumentSourceType } from "@voiceflow/shared";

export interface IKnowledgeChunkDocument extends MongooseDocument {
  organizationId: Types.ObjectId;
  agentId: Types.ObjectId;
  documentId: Types.ObjectId;
  chunkIndex: number;
  text: string;
  embedding: number[];
  tokenCount: number;
  metadata: {
    title?: string;
    sourceType?: DocumentSourceType;
    section?: string;
    [key: string]: unknown;
  };
  createdAt: Date;
}

const KnowledgeChunkSchema = new Schema<IKnowledgeChunkDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      index: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
      default: [],
    },
    tokenCount: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        ret.organizationId = ret.organizationId.toString();
        ret.agentId = ret.agentId.toString();
        ret.documentId = ret.documentId.toString();
        delete ret._id;
        delete ret.__v;
        // Omit raw embedding array from JSON serialization to keep payloads lightweight
        delete ret.embedding;
        return ret;
      },
    },
  }
);

KnowledgeChunkSchema.index({ organizationId: 1, agentId: 1 });
KnowledgeChunkSchema.index({ agentId: 1, documentId: 1 });
KnowledgeChunkSchema.index({ documentId: 1 });

export const KnowledgeChunkModel = mongoose.model<IKnowledgeChunkDocument>(
  "KnowledgeChunk",
  KnowledgeChunkSchema
);
