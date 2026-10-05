// ─── Agent Model ────────────────────────────────────────────────────────────
// Stores voice agent configurations, prompt instructions, and widget setup.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Types } from "mongoose";
import type {
  AgentStatus,
  AgentVoiceConfig,
  AgentWidgetConfig,
  AgentLLMConfig,
  AgentTemplate,
} from "@voiceflow/shared";

export interface IAgentDocument extends Document {
  organizationId: Types.ObjectId;
  name: string;
  description: string;
  template: AgentTemplate;
  status: AgentStatus;
  systemPrompt: string;
  businessProfile?: string;
  voice: AgentVoiceConfig;
  widget: AgentWidgetConfig;
  llmConfig: AgentLLMConfig;
  languages: string[];
  toolIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const AgentSchema = new Schema<IAgentDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    template: {
      type: String,
      enum: ["support", "sales", "appointment", "custom"],
      default: "support",
    },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "archived"],
      default: "draft",
      index: true,
    },
    systemPrompt: {
      type: String,
      required: true,
      default:
        "You are a helpful and polite voice AI assistant. Answer customer questions clearly and concisely. If you do not know the answer, politely let the customer know.",
    },
    businessProfile: {
      type: String,
      default: "",
    },
    voice: {
      engine: { type: String, enum: ["kokoro", "chatterbox", "custom"], default: "kokoro" },
      voiceId: { type: String, default: "af_heart" },
      speed: { type: Number, default: 1.0 },
      pitch: { type: Number, default: 0 },
      language: { type: String, default: "en-US" },
    },
    widget: {
      primaryColor: { type: String, default: "#6366f1" },
      position: { type: String, enum: ["bottom-right", "bottom-left"], default: "bottom-right" },
      title: { type: String, default: "AI Assistant" },
      welcomeMessage: { type: String, default: "Hello! How can I help you today?" },
      allowedDomains: { type: [String], default: [] },
    },
    llmConfig: {
      provider: { type: String, enum: ["openai", "anthropic", "groq", "local"], default: "groq" },
      model: { type: String, default: "llama-3.3-70b-versatile" },
      temperature: { type: Number, default: 0.4 },
      maxTokens: { type: Number, default: 512 },
    },
    languages: {
      type: [String],
      default: ["en-US"],
    },
    toolIds: {
      type: [Schema.Types.ObjectId],
      ref: "Tool",
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        ret.organizationId = ret.organizationId.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

AgentSchema.index({ organizationId: 1, status: 1 });
AgentSchema.index({ organizationId: 1, createdAt: -1 });

export const AgentModel = mongoose.model<IAgentDocument>("Agent", AgentSchema);
