// ─── Usage Model ─────────────────────────────────────────────────────────────
// Tracks resource consumption by organization and date for quotas & billing.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUsageDocument extends Document {
  organizationId: Types.ObjectId;
  agentId?: Types.ObjectId;
  date: string; // YYYY-MM-DD
  voiceSeconds: number;
  sttSeconds: number;
  ttsSeconds: number;
  tokensInput: number;
  tokensOutput: number;
  aiResponses: number;
  toolExecutions: number;
  createdAt: Date;
  updatedAt: Date;
}

const UsageSchema = new Schema<IUsageDocument>(
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
      default: null,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    voiceSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    sttSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    ttsSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    tokensInput: {
      type: Number,
      default: 0,
      min: 0,
    },
    tokensOutput: {
      type: Number,
      default: 0,
      min: 0,
    },
    aiResponses: {
      type: Number,
      default: 0,
      min: 0,
    },
    toolExecutions: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        ret.organizationId = ret.organizationId.toString();
        if (ret.agentId) ret.agentId = ret.agentId.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

UsageSchema.index({ organizationId: 1, date: 1 });
UsageSchema.index({ organizationId: 1, agentId: 1, date: 1 }, { unique: true });

export const UsageModel = mongoose.model<IUsageDocument>("Usage", UsageSchema);
