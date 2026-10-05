// ─── Auth Guard Component ───────────────────────────────────────────────────
// Protects dashboard routes from unauthenticated access.
// Shows a premium loading state while checking auth status.
// Redirects to /login if user is not authenticated.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, loading, initializeAuth } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Show premium loading skeleton while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <div className="flex flex-col items-center gap-4">
          {/* Animated VoiceFlow logo */}
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-[#0A0A0C] flex items-center justify-center text-white font-bold text-lg shadow-lg">
              V
            </div>
            <div className="absolute inset-0 rounded-2xl bg-[#3B82F6]/20 animate-ping" />
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <p className="text-xs text-neutral-400 font-medium tracking-wide">
            Verifying session...
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated → redirect to login with return URL
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
