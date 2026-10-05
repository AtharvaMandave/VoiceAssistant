// ─── Firebase Client SDK ────────────────────────────────────────────────────
// Initializes Firebase Auth for the frontend. Supports email/password,
// Google OAuth, email verification, and password reset.
// Uses Vite environment variables for configuration.
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  type Auth,
  type User as FirebaseUser,
  type UserCredential,
} from "firebase/auth";

// ─── Firebase Configuration ─────────────────────────────────────────────────
// In development without Firebase config, we fall back to dev-auth mode.
// In production, all values must be provided via VITE_FIREBASE_* env vars.

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

// ─── Initialization ─────────────────────────────────────────────────────────

const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  googleProvider.addScope("email");
  googleProvider.addScope("profile");
  console.log("[Firebase] Client SDK initialized successfully.");
} else {
  console.log("[Firebase] No config provided. Dev Auth mode is ACTIVE.");
}

// ─── Auth Functions ─────────────────────────────────────────────────────────

/**
 * Check if Firebase Auth is available (vs dev-auth fallback)
 */
export function isFirebaseAuth(): boolean {
  return isFirebaseConfigured && auth !== null;
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<UserCredential> {
  if (!auth) throw new Error("Firebase Auth not initialized");
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Sign up with email, password, and display name
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<UserCredential> {
  if (!auth) throw new Error("Firebase Auth not initialized");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  // Set display name
  await updateProfile(credential.user, { displayName });
  // Send email verification
  await sendEmailVerification(credential.user);
  return credential;
}

/**
 * Sign in with Google OAuth popup
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  if (!auth || !googleProvider) throw new Error("Firebase Auth not initialized");
  return signInWithPopup(auth, googleProvider);
}

/**
 * Send a password reset email
 */
export async function resetPassword(email: string): Promise<void> {
  if (!auth) throw new Error("Firebase Auth not initialized");
  return sendPasswordResetEmail(auth, email);
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  if (!auth) return;
  return firebaseSignOut(auth);
}

/**
 * Get the current Firebase ID token (JWT) for API calls
 * Automatically refreshes if expired
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(
  callback: (user: FirebaseUser | null) => void
): () => void {
  if (!auth) {
    // In dev mode, don't subscribe — auth store handles dev login
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/**
 * Get the current Firebase user (synchronous check)
 */
export function getCurrentUser(): FirebaseUser | null {
  return auth?.currentUser ?? null;
}

// Re-export types
export type { FirebaseUser, UserCredential };
