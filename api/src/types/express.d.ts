import type { IUserDocument, IMembershipDocument } from "../models/index.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: IUserDocument;
      organizationId?: string;
      membership?: IMembershipDocument;
    }
  }
}
