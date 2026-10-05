// ─── Login Page ─────────────────────────────────────────────────────────────
// Professional authentication page with email/password, Google OAuth,
// and dev-login fallback. Premium fintech aesthetic with form validation.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { isFirebaseAuth } from "../lib/firebase";

// ─── Password Strength Checker ──────────────────────────────────────────────

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "Weak", color: "#EF4444" };
  if (score <= 4) return { score, label: "Fair", color: "#F59E0B" };
  return { score, label: "Strong", color: "#10B981" };
}

// ─── Component ──────────────────────────────────────────────────────────────

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    loginWithEmail,
    loginWithGoogle,
    devLogin,
    clearError,
    loading,
    authError,
    isAuthenticated,
  } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const hasFirebase = isFirebaseAuth();

  // Redirect if already authenticated
  const returnTo = (location.state as any)?.from || "/dashboard";
  useEffect(() => {
    if (isAuthenticated) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, navigate, returnTo]);

  // Clear errors on unmount
  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  // ─── Email Validation ─────────────────────────────────────────────────
  function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ─── Form Submission ──────────────────────────────────────────────────
  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Client-side validation
    if (!email.trim()) {
      setFormError("Please enter your email address.");
      return;
    }
    if (!validateEmail(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setFormError("Please enter your password.");
      return;
    }
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }

    try {
      setIsSubmitting(true);
      await loginWithEmail(email, password);
      navigate(returnTo, { replace: true });
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Google Login ─────────────────────────────────────────────────────
  async function handleGoogleLogin() {
    setFormError(null);
    try {
      setIsSubmitting(true);
      await loginWithGoogle();
      navigate(returnTo, { replace: true });
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Dev Login ────────────────────────────────────────────────────────
  async function handleDevLogin() {
    setFormError(null);
    try {
      setIsSubmitting(true);
      await devLogin();
      navigate(returnTo, { replace: true });
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const displayError = formError || authError;
  const pwStrength = password ? getPasswordStrength(password) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-[#0A0A0C] relative overflow-hidden px-4">
      {/* Soft 3D Abstract Floating Blobs */}
      <div className="absolute -top-16 -left-16 w-52 h-52 glossy-3d-blob-blue opacity-50 animate-float pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-48 h-48 glossy-3d-blob-pink opacity-40 animate-float-slow pointer-events-none" />
      <div className="absolute top-1/3 right-[10%] w-24 h-24 glossy-3d-sphere-white opacity-70 animate-float-reverse pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="fintech-card p-8 sm:p-10 space-y-6">
          {/* Logo & Headline */}
          <div className="text-center space-y-2">
            <Link to="/" className="inline-flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-[#0A0A0C] flex items-center justify-center text-white font-semibold text-base shadow-md">
                V
              </div>
            </Link>
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-[#0A0A0C]">
              Welcome back
            </h1>
            <p className="text-[13px] text-neutral-500">
              Sign in to your VoiceFlow account
            </p>
          </div>

          {/* Error Alert */}
          {displayError && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-red-700 leading-relaxed">{displayError}</p>
            </div>
          )}

          {/* Google OAuth Button */}
          {hasFirebase && (
            <>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-700 text-[13px] font-medium rounded-xl border border-black/[0.08] shadow-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-black/[0.06]" />
                <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-medium">or</span>
                <div className="flex-1 h-px bg-black/[0.06]" />
              </div>
            </>
          )}

          {/* Email/Password Form */}
          {hasFirebase && (
            <form onSubmit={handleEmailLogin} className="space-y-4" noValidate>
              {/* Email Field */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-email"
                  className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider"
                >
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                    </svg>
                  </div>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
                    placeholder="you@company.com"
                    autoComplete="email"
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 bg-[#F8F9FA] border border-black/[0.06] rounded-xl text-sm text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]/50 transition-all"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider"
                  >
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-[11px] text-[#3B82F6] hover:text-[#2563EB] font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFormError(null); }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-11 py-2.5 bg-[#F8F9FA] border border-black/[0.06] rounded-xl text-sm text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]/50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Password Strength Indicator */}
                {password && pwStrength && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="flex gap-0.5 flex-1">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                          key={i}
                          className="h-0.5 flex-1 rounded-full transition-colors duration-300"
                          style={{
                            backgroundColor: i <= pwStrength.score ? pwStrength.color : "#E5E7EB",
                          }}
                        />
                      ))}
                    </div>
                    <span
                      className="text-[10px] font-medium"
                      style={{ color: pwStrength.color }}
                    >
                      {pwStrength.label}
                    </span>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || loading}
                className="w-full btn-pill-blue py-3 text-[13px] font-semibold shadow-pill-blue hover:shadow-pill-blue-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          )}

          {/* Dev Login Section */}
          {!hasFirebase && (
            <div className="space-y-4">
              {/* Dev Mode Banner */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  <strong>Development Mode</strong> — Firebase is not configured. Using instant dev authentication.
                </p>
              </div>

              <button
                onClick={handleDevLogin}
                disabled={isSubmitting || loading}
                className="w-full btn-pill-blue py-3 text-[13px] font-semibold shadow-pill-blue hover:shadow-pill-blue-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                    Continue with Dev Login
                  </span>
                )}
              </button>

              {/* Security Info */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  { icon: "🔐", label: "Encrypted" },
                  { icon: "🛡️", label: "Sandboxed" },
                  { icon: "⚡", label: "Instant" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col items-center gap-1 py-2 rounded-lg bg-[#F8F9FA]"
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="text-[10px] text-neutral-400 font-medium">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sign Up Link */}
          <div className="text-center pt-2">
            {hasFirebase ? (
              <p className="text-[12px] text-neutral-500">
                Don't have an account?{" "}
                <Link
                  to="/register"
                  className="text-[#3B82F6] hover:text-[#2563EB] font-semibold transition-colors"
                >
                  Create one
                </Link>
              </p>
            ) : (
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Configure <code className="px-1 py-0.5 bg-neutral-100 rounded text-[10px] font-mono">VITE_FIREBASE_*</code> env vars to enable full authentication.
              </p>
            )}
          </div>

          {/* Terms */}
          <p className="text-center text-[10px] text-neutral-400 leading-relaxed">
            By continuing, you agree to our{" "}
            <a href="#" className="underline hover:text-neutral-600 transition-colors">Terms of Service</a>
            {" "}and{" "}
            <a href="#" className="underline hover:text-neutral-600 transition-colors">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
