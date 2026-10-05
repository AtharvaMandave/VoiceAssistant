// ─── Organization Model ─────────────────────────────────────────────────────
// Tenant entity representing a business account.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document } from "mongoose";
import type { OrgPlan, OrganizationSettings } from "@voiceflow/shared";

export interface IOrganizationDocument extends Document {
  name: string;
  slug: string;
  plan: OrgPlan;
  billingCustomerId?: string;
  settings: OrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganizationDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },
    billingCustomerId: {
      type: String,
    },
    settings: {
      defaultLanguage: { type: String, default: "en-US" },
      timezone: { type: String, default: "UTC" },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const OrganizationModel = mongoose.model<IOrganizationDocument>(
  "Organization",
  OrganizationSchema
);
