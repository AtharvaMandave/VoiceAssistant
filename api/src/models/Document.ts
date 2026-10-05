// ─── Document Model ──────────────────────────────────────────────────────────
// Stores knowledge sources (text, files, FAQs, URLs) attached to an agent.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document as MongooseDocument, Types } from "mongoose";
import type { DocumentSourceType, DocumentStatus } from "@voiceflow/shared";

export interface IDocumentDocument extends MongooseDocument {
  organizationId: Types.ObjectId;
  agentId: Types.ObjectId;
  title: string;
  sourceType: DocumentSourceType;
  status: DocumentStatus;
  chunkCount: number;
  tokenCount: number;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocumentDocument>(
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
    title: {
      type: String,
      required: true,
      trim: true,
    },
    sourceType: {
      type: String,
      enum: ["file", "text", "url", "faq"],
      default: "text",
    },
    status: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
      index: true,
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    tokenCount: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        ret.organizationId = ret.organizationId.toString();
        ret.agentId = ret.agentId.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

DocumentSchema.index({ organizationId: 1, agentId: 1 });
DocumentSchema.index({ agentId: 1, createdAt: -1 });
DocumentSchema.index({ agentId: 1, status: 1 });

export const DocumentModel = mongoose.model<IDocumentDocument>(
  "Document",
  DocumentSchema
);
