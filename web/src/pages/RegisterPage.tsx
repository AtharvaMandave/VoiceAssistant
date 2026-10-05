// ─── Register Page ──────────────────────────────────────────────────────────
// Professional registration page with email/password, Google OAuth,
// password strength validation, and email verification.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { isFirebaseAuth } from "../lib/firebase";

// ─── Password Requirements ─────────────────────────────────────────────────

interface PasswordCheck {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_CHECKS: PasswordCheck[] = [
  { label: "At least 8 characters", test: (pw) => pw.length >= 8 },
  { label: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "One number", test: (pw) => /[0-9]/.test(pw) },
  { label: "One special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

// ─── Component ──────────────────────────────────────────────────────────────

function RegisterPage() {
  const navigate = useNavigate();
  const {
    registerWithEmail,
    loginWithGoogle,
    clearError,
    loading,
    authError,
    isAuthenticated,
  } = useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const hasFirebase = isFirebaseAuth();

  // Redirect if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  // ─── Validation ───────────────────────────────────────────────────────
  function validateForm(): string | null {
    if (!name.trim()) return "Please enter your full name.";
    if (name.trim().length < 2) return "Name must be at least 2 characters.";
    if (!email.trim()) return "Please enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address.";
    if (!password) return "Please create a password.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
    if (password !== confirmPassword) return "Passwords do not match.";
    if (!agreedToTerms) return "Please agree to the Terms of Service and Privacy Policy.";
    return null;
  }

  const passedChecks = PASSWORD_CHECKS.filter((c) => c.test(password)).length;
  const allChecksPassed = passedChecks === PASSWORD_CHECKS.length;

  // ─── Form Submission ──────────────────────────────────────────────────
  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      await registerWithEmail(email, password, name.trim());
      setRegistrationComplete(true);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Google Sign Up ───────────────────────────────────────────────────
  async function handleGoogleSignUp() {
    setFormError(null);
    try {
      setIsSubmitting(true);
      await loginWithGoogle();
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const displayError = formError || authError;

  // ─── Registration Success View ────────────────────────────────────────
  if (registrationComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-[#0A0A0C] px-4">
        <div className="relative z-10 w-full max-w-[420px]">
          <div className="fintech-card p-8 sm:p-10 space-y-6 text-center">
            {/* Success Icon */}
            <div className="w-16 h-16 mx-auto rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold tracking-tight">Check your inbox</h1>
            <p className="text-[13px] text-neutral-500 leading-relaxed">
              We've sent a verification email to <strong className="text-[#0A0A0C]">{email}</strong>. 
              Click the link to verify your account and start building voice agents.
            </p>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => navigate("/dashboard")}
                className="w-full btn-pill-blue py-3 text-[13px] font-semibold"
              >
                Continue to Dashboard
              </button>
              <button
                onClick={() => navigate("/login")}
                className="w-full py-2.5 text-[13px] font-medium text-neutral-500 hover:text-[#0A0A0C] transition-colors"
              >
                Back to Sign In
              </button>
            </div>

            <p className="text-[11px] text-neutral-400">
              Didn't receive the email? Check your spam folder or contact support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Not Configured View ──────────────────────────────────────────────
  if (!hasFirebase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-[#0A0A0C] px-4">
        <div className="relative z-10 w-full max-w-[420px]">
          <div className="fintech-card p-8 sm:p-10 space-y-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Development Mode</h1>
            <p className="text-[13px] text-neutral-500 leading-relaxed">
              Registration requires Firebase Auth configuration. Use the dev login to access the dashboard.
            </p>
            <Link to="/login" className="inline-block btn-pill-blue px-6 py-2.5 text-[13px] font-semibold">
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Registration Form ────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-[#0A0A0C] relative overflow-hidden px-4 py-8">
      {/* Floating blobs */}
      <div className="absolute -top-16 -right-16 w-52 h-52 glossy-3d-blob-blue opacity-50 animate-float pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 glossy-3d-blob-pink opacity-40 animate-float-slow pointer-events-none" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="fintech-card p-8 sm:p-10 space-y-5">
          {/* Header */}
          <div className="text-center space-y-2">
            <Link to="/" className="inline-flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-[#0A0A0C] flex items-center justify-center text-white font-semibold text-base shadow-md">
                V
              </div>
            </Link>
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight">
              Create your account
            </h1>
            <p className="text-[13px] text-neutral-500">
              Start building autonomous voice agents in minutes
            </p>
          </div>

          {/* Error */}
          {displayError && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-100">
              <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-xs text-red-700 leading-relaxed">{displayError}</p>
            </div>
          )}

          {/* Google Sign Up */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white hover:bg-neutral-50 active:bg-neutral-100 text-neutral-700 text-[13px] font-medium rounded-xl border border-black/[0.08] shadow-sm transition-all duration-150 disabled:opacity-50"
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign up with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-black/[0.06]" />
            <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-medium">or</span>
            <div className="flex-1 h-px bg-black/[0.06]" />
          </div>

          {/* Registration Form */}
          <form onSubmit={handleRegister} className="space-y-4" noValidate>
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="register-name" className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Full name
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <input
                  id="register-name"
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setFormError(null); }}
                  placeholder="Jane Smith"
                  autoComplete="name"
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 bg-[#F8F9FA] border border-black/[0.06] rounded-xl text-sm text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]/50 transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="register-email" className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Work email
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFormError(null); }}
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#F8F9FA] border border-black/[0.06] rounded-xl text-sm text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]/50 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="register-password" className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFormError(null); }}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
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

              {/* Password Requirements Checklist */}
              {password && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1.5">
                  {PASSWORD_CHECKS.map((check) => {
                    const passed = check.test(password);
                    return (
                      <div key={check.label} className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded-full flex items-center justify-center transition-colors ${passed ? "bg-green-500" : "bg-neutral-200"}`}>
                          {passed && (
                            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-[10px] ${passed ? "text-green-600" : "text-neutral-400"} transition-colors`}>
                          {check.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label htmlFor="register-confirm-password" className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Confirm password
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <input
                  id="register-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setFormError(null); }}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#F8F9FA] border border-black/[0.06] rounded-xl text-sm text-[#0A0A0C] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]/50 transition-all"
                />
                {confirmPassword && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {password === confirmPassword ? (
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Terms Checkbox */}
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-neutral-300 text-[#3B82F6] focus:ring-[#3B82F6]/30 transition-colors"
              />
              <span className="text-[11px] text-neutral-500 leading-relaxed group-hover:text-neutral-700 transition-colors">
                I agree to the{" "}
                <a href="#" className="text-[#3B82F6] underline hover:text-[#2563EB]">Terms of Service</a>
                {" "}and{" "}
                <a href="#" className="text-[#3B82F6] underline hover:text-[#2563EB]">Privacy Policy</a>
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || loading || !allChecksPassed || !agreedToTerms}
              className="w-full btn-pill-blue py-3 text-[13px] font-semibold shadow-pill-blue hover:shadow-pill-blue-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          {/* Sign In Link */}
          <p className="text-center text-[12px] text-neutral-500">
            Already have an account?{" "}
            <Link to="/login" className="text-[#3B82F6] hover:text-[#2563EB] font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
