// ─── Message Model ──────────────────────────────────────────────────────────
// Stores individual chat/voice transcript turns within a conversation.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Types } from "mongoose";
import type { MessageRole, ToolCallRecord, RetrievedChunkSnippet } from "@voiceflow/shared";

export interface IMessageDocument extends Document {
  conversationId: Types.ObjectId;
  role: MessageRole;
  content: string;
  tokens: number;
  latencyMs?: number;
  llmModel?: string;
  toolCalls?: ToolCallRecord[];
  retrievedChunks?: RetrievedChunkSnippet[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessageDocument>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["system", "user", "assistant", "tool"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    tokens: {
      type: Number,
      default: 0,
    },
    latencyMs: {
      type: Number,
    },
    llmModel: {
      type: String,
    },
    toolCalls: {
      type: Schema.Types.Mixed,
      default: [],
    },
    retrievedChunks: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        ret.conversationId = ret.conversationId.toString();
        ret.model = ret.llmModel;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

MessageSchema.index({ conversationId: 1, createdAt: 1 });

export const MessageModel = mongoose.model<IMessageDocument>(
  "Message",
  MessageSchema
);
