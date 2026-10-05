// ─── Auth Store ─────────────────────────────────────────────────────────────
// Client-side auth session state managed by Zustand.
// Supports both Firebase Auth (production) and dev-auth (local development).
// Handles session bootstrap, token refresh, and organization switching.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { apiClient } from "../lib/api";
import {
  isFirebaseAuth,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOut as firebaseSignOut,
  resetPassword as firebaseResetPassword,
  getIdToken,
  onAuthChange,
  type FirebaseUser,
} from "../lib/firebase";
import type {
  User,
  Organization,
  Role,
  UserOrgMembership,
} from "@voiceflow/shared";

// ─── Error Mapping ──────────────────────────────────────────────────────────
// Maps Firebase error codes to user-friendly messages

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Invalid email or password. Please try again.",
  "auth/user-not-found": "No account found with this email address.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 8 characters with uppercase, lowercase, and a number.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/popup-closed-by-user": "Sign-in popup was closed. Please try again.",
  "auth/popup-blocked": "Sign-in popup was blocked. Please allow popups for this site.",
  "auth/network-request-failed": "Network error. Please check your connection and try again.",
  "auth/user-disabled": "This account has been disabled. Contact support.",
  "auth/requires-recent-login": "For security, please sign in again before continuing.",
};

function getAuthErrorMessage(error: any): string {
  const code = error?.code || "";
  return AUTH_ERROR_MESSAGES[code] || error?.message || "Authentication failed. Please try again.";
}

// ─── Auth State Interface ───────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  activeOrganization: Organization | null;
  role: Role | null;
  memberships: UserOrgMembership[];
  loading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  authError: string | null;
  initialized: boolean;

  /** Initialize auth — subscribe to Firebase state or check dev token */
  initializeAuth: () => void;

  /** Sign in with email/password (Firebase) */
  loginWithEmail: (email: string, password: string) => Promise<void>;

  /** Register with email/password/name (Firebase) */
  registerWithEmail: (email: string, password: string, name: string) => Promise<void>;

  /** Sign in with Google OAuth (Firebase) */
  loginWithGoogle: () => Promise<void>;

  /** Send password reset email (Firebase) */
  sendPasswordReset: (email: string) => Promise<void>;

  /** Dev-mode one-click login (development only) */
  devLogin: () => Promise<void>;

  /** Clear auth state and sign out */
  logout: () => Promise<void>;

  /** Bootstrap API session with current token */
  bootstrapSession: (token: string) => Promise<void>;

  /** Switch active organization */
  switchOrganization: (orgId: string) => Promise<void>;

  /** Clear error state */
  clearError: () => void;

  /** Set loading state */
  setLoading: (loading: boolean) => void;
}

// ─── Store Implementation ───────────────────────────────────────────────────

let authUnsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  firebaseUser: null,
  activeOrganization: null,
  role: null,
  memberships: [],
  loading: true,
  isAuthenticated: false,
  token: null,
  authError: null,
  initialized: false,

  // ─── Initialize Auth ────────────────────────────────────────────────────
  initializeAuth: () => {
    if (get().initialized) return;
    set({ initialized: true });

    if (isFirebaseAuth()) {
      // Production: Subscribe to Firebase auth state changes
      authUnsubscribe = onAuthChange(async (firebaseUser) => {
        if (firebaseUser) {
          try {
            const token = await firebaseUser.getIdToken();
            set({ firebaseUser, token });
            await get().bootstrapSession(token);
          } catch (err) {
            console.error("[Auth] Firebase session bootstrap failed:", err);
            set({
              user: null,
              firebaseUser: null,
              isAuthenticated: false,
              loading: false,
              token: null,
            });
          }
        } else {
          set({
            user: null,
            firebaseUser: null,
            activeOrganization: null,
            role: null,
            memberships: [],
            isAuthenticated: false,
            loading: false,
            token: null,
          });
        }
      });
    } else {
      // Dev mode: Check for saved dev token
      const savedToken = localStorage.getItem("voiceflow_token");
      if (savedToken) {
        get().bootstrapSession(savedToken).catch(() => {
          localStorage.removeItem("voiceflow_token");
          set({ loading: false });
        });
      } else {
        set({ loading: false });
      }
    }
  },

  // ─── Email/Password Login ──────────────────────────────────────────────
  loginWithEmail: async (email: string, password: string) => {
    try {
      set({ loading: true, authError: null });

      if (!isFirebaseAuth()) {
        throw new Error("Firebase Auth is not configured. Use dev login in development.");
      }

      const credential = await signInWithEmail(email, password);
      const token = await credential.user.getIdToken();

      set({ firebaseUser: credential.user, token });
      await get().bootstrapSession(token);
    } catch (err: any) {
      const message = getAuthErrorMessage(err);
      set({ loading: false, authError: message });
      throw new Error(message);
    }
  },

  // ─── Email/Password Registration ──────────────────────────────────────
  registerWithEmail: async (email: string, password: string, name: string) => {
    try {
      set({ loading: true, authError: null });

      if (!isFirebaseAuth()) {
        throw new Error("Firebase Auth is not configured. Use dev login in development.");
      }

      const credential = await signUpWithEmail(email, password, name);
      const token = await credential.user.getIdToken();

      set({ firebaseUser: credential.user, token });
      await get().bootstrapSession(token);
    } catch (err: any) {
      const message = getAuthErrorMessage(err);
      set({ loading: false, authError: message });
      throw new Error(message);
    }
  },

  // ─── Google OAuth Login ────────────────────────────────────────────────
  loginWithGoogle: async () => {
    try {
      set({ loading: true, authError: null });

      if (!isFirebaseAuth()) {
        throw new Error("Firebase Auth is not configured. Use dev login in development.");
      }

      const credential = await signInWithGoogle();
      const token = await credential.user.getIdToken();

      set({ firebaseUser: credential.user, token });
      await get().bootstrapSession(token);
    } catch (err: any) {
      const message = getAuthErrorMessage(err);
      set({ loading: false, authError: message });
      throw new Error(message);
    }
  },

  // ─── Password Reset ───────────────────────────────────────────────────
  sendPasswordReset: async (email: string) => {
    try {
      set({ authError: null });

      if (!isFirebaseAuth()) {
        throw new Error("Firebase Auth is not configured in development mode.");
      }

      await firebaseResetPassword(email);
    } catch (err: any) {
      const message = getAuthErrorMessage(err);
      set({ authError: message });
      throw new Error(message);
    }
  },

  // ─── Dev Login (Development Only) ─────────────────────────────────────
  devLogin: async () => {
    try {
      set({ loading: true, authError: null });
      const token = "dev-user";
      localStorage.setItem("voiceflow_token", token);
      await get().bootstrapSession(token);
    } catch (err: any) {
      set({ loading: false, authError: err.message });
      localStorage.removeItem("voiceflow_token");
    }
  },

  // ─── Bootstrap API Session ────────────────────────────────────────────
  bootstrapSession: async (token: string) => {
    try {
      apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      localStorage.setItem("voiceflow_token", token);

      const res = await apiClient.post("/api/auth/session");
      const data = res.data.data;

      set({
        user: data.user,
        activeOrganization: data.activeOrganization,
        role: data.role,
        memberships: data.memberships,
        isAuthenticated: true,
        loading: false,
        token,
        authError: null,
      });
    } catch (err: any) {
      console.error("[Auth] Session bootstrap failed:", err);
      delete apiClient.defaults.headers.common["Authorization"];
      localStorage.removeItem("voiceflow_token");
      set({
        user: null,
        activeOrganization: null,
        role: null,
        memberships: [],
        isAuthenticated: false,
        loading: false,
        token: null,
      });
      throw err;
    }
  },

  // ─── Logout ───────────────────────────────────────────────────────────
  logout: async () => {
    try {
      // Sign out of Firebase if configured
      if (isFirebaseAuth()) {
        await firebaseSignOut();
      }
    } catch (err) {
      console.error("[Auth] Firebase sign-out error:", err);
    }

    // Clean up local state
    localStorage.removeItem("voiceflow_token");
    delete apiClient.defaults.headers.common["Authorization"];

    set({
      user: null,
      firebaseUser: null,
      activeOrganization: null,
      role: null,
      memberships: [],
      isAuthenticated: false,
      loading: false,
      token: null,
      authError: null,
    });
  },

  // ─── Organization Switching ───────────────────────────────────────────
  switchOrganization: async (orgId: string) => {
    try {
      const res = await apiClient.post("/api/organizations/switch", {
        organizationId: orgId,
      });
      const data = res.data.data;
      set({
        activeOrganization: data.organization,
        role: data.role,
      });
      apiClient.defaults.headers.common["x-organization-id"] = orgId;
    } catch (err) {
      console.error("[Auth] Organization switch failed:", err);
    }
  },

  clearError: () => set({ authError: null }),
  setLoading: (loading) => set({ loading }),
}));

// ─── Token Refresh Interceptor ──────────────────────────────────────────────
// Automatically refresh Firebase ID token on 401 responses (token expired).
// This runs BEFORE the response interceptor in api.ts handles 401 redirect.

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only retry once and only for 401s
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      isFirebaseAuth()
    ) {
      originalRequest._retry = true;

      try {
        const newToken = await getIdToken(true); // Force refresh
        if (newToken) {
          useAuthStore.setState({ token: newToken });
          apiClient.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
          originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
          localStorage.setItem("voiceflow_token", newToken);
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        console.error("[Auth] Token refresh failed:", refreshError);
      }
    }

    return Promise.reject(error);
  }
);
