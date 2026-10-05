// ─── ApiKey Model ────────────────────────────────────────────────────────────
// Stores hashed API keys for programmatic access with scoped permissions.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Types } from "mongoose";
import type { ApiKeyScope } from "@voiceflow/shared";

export interface IApiKeyDocument extends Document {
  organizationId: Types.ObjectId;
  createdBy: Types.ObjectId;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKeyDocument>(
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
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    keyPrefix: {
      type: String,
      required: true,
      trim: true,
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    scopes: {
      type: [String],
      required: true,
      default: ["*"],
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
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
        delete ret.keyHash; // NEVER expose hash in json serialization
        return ret;
      },
    },
  }
);

ApiKeySchema.index({ organizationId: 1, createdAt: -1 });

export const ApiKeyModel = mongoose.model<IApiKeyDocument>("ApiKey", ApiKeySchema);
