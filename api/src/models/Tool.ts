// ─── Tool Model ─────────────────────────────────────────────────────────────
// Stores registered tool definitions per agent. Tools allow the voice agent
// to perform real business actions (order lookup, appointment booking, etc.)
// via the LLM function calling loop.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Types } from "mongoose";
import type { ToolParameterDef } from "@voiceflow/shared";

export interface IToolDocument extends Document {
  organizationId: Types.ObjectId;
  agentId: Types.ObjectId;
  name: string;
  displayName: string;
  description: string;
  parameters: ToolParameterDef[];
  enabled: boolean;
  riskLevel: "low" | "medium" | "high";
  isBuiltIn: boolean;
  executionCount: number;
  lastExecutedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ToolParameterSchema = new Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ["string", "number", "boolean", "array", "object"],
      required: true,
    },
    description: { type: String, required: true },
    required: { type: Boolean, default: true },
    enum: { type: [String], default: undefined },
    default: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

const ToolSchema = new Schema<IToolDocument>(
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
    name: {
      type: String,
      required: true,
      trim: true,
      match: /^[a-z_][a-z0-9_]*$/,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    parameters: {
      type: [ToolParameterSchema],
      default: [],
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },
    isBuiltIn: {
      type: Boolean,
      default: false,
    },
    executionCount: {
      type: Number,
      default: 0,
    },
    lastExecutedAt: {
      type: Date,
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

// Compound unique index: each tool name must be unique per agent
ToolSchema.index({ agentId: 1, name: 1 }, { unique: true });
ToolSchema.index({ organizationId: 1, agentId: 1 });
ToolSchema.index({ agentId: 1, enabled: 1 });

export const ToolModel = mongoose.model<IToolDocument>("Tool", ToolSchema);
