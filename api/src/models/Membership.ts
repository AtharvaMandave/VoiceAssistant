// ─── Membership Model ───────────────────────────────────────────────────────
// Connects Users to Organizations with role-based access control.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Schema, Document, Types } from "mongoose";
import type { Role } from "@voiceflow/shared";

export interface IMembershipDocument extends Document {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembershipDocument>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "developer", "support", "viewer"],
      required: true,
      default: "viewer",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id.toString();
        ret.organizationId = ret.organizationId.toString();
        ret.userId = ret.userId.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Ensure user can have at most one membership per organization
MembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export const MembershipModel = mongoose.model<IMembershipDocument>(
  "Membership",
  MembershipSchema
);
