// ─── Firebase Admin Setup ───────────────────────────────────────────────────
// Provides server-side Firebase ID token verification with fallback for
// local development without cloud dependencies.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "./env.js";

export interface DecodedToken {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

let firebaseApp: App | null = null;

export async function initializeFirebase(): Promise<void> {
  if (firebaseApp) return;

  if (!env.FIREBASE_PROJECT_ID && !env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.log("[Auth] Firebase credentials not provided. Dev Auth mode is ACTIVE.");
    return;
  }

  try {
    const certConfig: any = {
      projectId: env.FIREBASE_PROJECT_ID,
    };

    if (env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        // dotenv may include surrounding quotes — strip them
        let raw = env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
        if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
          raw = raw.slice(1, -1);
        }
        const parsedKey = JSON.parse(raw);
        certConfig.credential = cert(parsedKey);
      } catch (parseErr: any) {
        console.warn(
          `[Auth] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY as JSON: ${parseErr.message}`
        );
        console.warn("[Auth] Using application default credentials.");
      }
    }

    firebaseApp = initializeApp(certConfig);
    console.log("[Auth] Firebase Admin initialized successfully.");
  } catch (err) {
    console.warn("[Auth] Could not initialize firebase-admin. Falling back to Dev Auth mode.", err);
  }
}

/**
 * Verify a Firebase ID token or dev token.
 */
export async function verifyToken(token: string): Promise<DecodedToken> {
  // Check for local dev bypass
  if (
    token.startsWith("dev-") ||
    token === "dev-user" ||
    token === "dev-token" ||
    (!firebaseApp && env.DEV_AUTH_BYPASS)
  ) {
    // Extract optional email/name from dev token if encoded, or use default
    const email = token.includes("@") ? token : "dev@voiceflow.ai";
    return {
      uid: "usr_dev_" + Buffer.from(email).toString("hex").slice(0, 12),
      email,
      name: "VoiceFlow Dev User",
      picture: "https://api.dicebear.com/7.x/bottts/svg?seed=voiceflow_dev",
    };
  }

  if (!firebaseApp) {
    throw new Error("Firebase Admin is not configured and Dev Auth bypass is disabled");
  }

  const decoded = await getAuth(firebaseApp).verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name || decoded.email?.split("@")[0] || "User",
    picture: decoded.picture,
  };
}
