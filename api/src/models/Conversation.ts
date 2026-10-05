// ─── Conversation Model ─────────────────────────────────────────────────────
// Stores multi-turn conversation sessions between users and voice agents.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Types } from "mongoose";
import type { ConversationChannel, ConversationStatus, ConversationSentiment } from "@voiceflow/shared";

export interface IConversationDocument extends Document {
  organizationId: Types.ObjectId;
  agentId: Types.ObjectId;
  channel: ConversationChannel;
  status: ConversationStatus;
  messageCount: number;
  totalTokens: number;
  sentiment?: ConversationSentiment;
  sentimentScore?: number;
  escalated?: boolean;
  escalationReason?: string;
  avgLatencyMs?: number;
  durationMs?: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversationDocument>(
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
    channel: {
      type: String,
      enum: ["playground", "widget", "api"],
      default: "playground",
    },
    status: {
      type: String,
      enum: ["active", "ended", "escalated"],
      default: "active",
    },
    messageCount: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
    sentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
      default: "neutral",
    },
    sentimentScore: {
      type: Number,
      default: 0,
    },
    escalated: {
      type: Boolean,
      default: false,
    },
    escalationReason: {
      type: String,
    },
    avgLatencyMs: {
      type: Number,
      default: 0,
    },
    durationMs: {
      type: Number,
      default: 0,
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

ConversationSchema.index({ organizationId: 1, agentId: 1 });
ConversationSchema.index({ agentId: 1, createdAt: -1 });
ConversationSchema.index({ organizationId: 1, createdAt: -1 });
ConversationSchema.index({ organizationId: 1, status: 1 });
ConversationSchema.index({ organizationId: 1, escalated: 1 });
ConversationSchema.index({ organizationId: 1, sentiment: 1 });

export const ConversationModel = mongoose.model<IConversationDocument>(
  "Conversation",
  ConversationSchema
);
