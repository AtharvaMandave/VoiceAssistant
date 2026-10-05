// ─── Webhook Model ───────────────────────────────────────────────────────────
// Manages external webhook URLs and events for outbound event dispatching.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Types } from "mongoose";
import type { WebhookEvent } from "@voiceflow/shared";

export interface IWebhookDocument extends Document {
  organizationId: Types.ObjectId;
  createdBy: Types.ObjectId;
  url: string;
  description?: string;
  events: WebhookEvent[];
  secretHash: string;
  secretMasked: string;
  status: "active" | "inactive";
  lastDeliveryAt?: Date;
  lastDeliveryStatus?: number;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema = new Schema<IWebhookDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    events: {
      type: [String],
      required: true,
      validate: [(val: string[]) => val.length > 0, "At least one event required"],
    },
    secretHash: {
      type: String,
      required: true,
    },
    secretMasked: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
    lastDeliveryAt: {
      type: Date,
      default: null,
    },
    lastDeliveryStatus: {
      type: Number,
      default: null,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        ret.organizationId = ret.organizationId.toString();
        ret.createdBy = ret.createdBy?.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.secretHash;
        return ret;
      },
    },
  }
);

WebhookSchema.index({ organizationId: 1, status: 1 });

export const WebhookModel = mongoose.model<IWebhookDocument>("Webhook", WebhookSchema);
