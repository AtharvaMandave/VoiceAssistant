// ─── Forgot Password Page ───────────────────────────────────────────────────
// Professional password reset flow. Sends a Firebase password reset email
// and shows a success confirmation with clear next steps.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { isFirebaseAuth } from "../lib/firebase";

function ForgotPasswordPage() {
  const { sendPasswordReset, authError, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const hasFirebase = isFirebaseAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    clearError();

    if (!email.trim()) {
      setFormError("Please enter your email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }

    try {
      setIsSubmitting(true);
      await sendPasswordReset(email);
      setEmailSent(true);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const displayError = formError || authError;

  // ─── Success View ─────────────────────────────────────────────────────
  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-[#0A0A0C] px-4">
        <div className="relative z-10 w-full max-w-[420px]">
          <div className="fintech-card p-8 sm:p-10 space-y-6 text-center">
            {/* Success Icon */}
            <div className="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-[#3B82F6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
            <p className="text-[13px] text-neutral-500 leading-relaxed">
              If an account exists for <strong className="text-[#0A0A0C]">{email}</strong>,
              we've sent password reset instructions. The link expires in 1 hour.
            </p>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => { setEmailSent(false); setEmail(""); }}
                className="w-full py-2.5 text-[13px] font-medium text-neutral-600 hover:text-[#0A0A0C] border border-black/[0.06] rounded-xl hover:bg-neutral-50 transition-all"
              >
                Try a different email
              </button>
              <Link
                to="/login"
                className="block w-full btn-pill-blue py-3 text-[13px] font-semibold text-center"
              >
                Back to Sign In
              </Link>
            </div>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50/50 border border-blue-100/50">
              <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="text-[11px] text-blue-600 leading-relaxed text-left">
                <strong>Security notice:</strong> For your protection, we always show this success message — even if no account exists for the email entered.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Not Configured ───────────────────────────────────────────────────
  if (!hasFirebase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-[#0A0A0C] px-4">
        <div className="relative z-10 w-full max-w-[420px]">
          <div className="fintech-card p-8 sm:p-10 space-y-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Not Available</h1>
            <p className="text-[13px] text-neutral-500 leading-relaxed">
              Password reset requires Firebase Auth. Dev mode uses instant authentication without passwords.
            </p>
            <Link to="/login" className="inline-block btn-pill-blue px-6 py-2.5 text-[13px] font-semibold">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ─── Reset Form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] text-[#0A0A0C] relative overflow-hidden px-4">
      <div className="absolute -top-16 -left-16 w-52 h-52 glossy-3d-blob-blue opacity-50 animate-float pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-48 h-48 glossy-3d-blob-pink opacity-40 animate-float-slow pointer-events-none" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="fintech-card p-8 sm:p-10 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <Link to="/" className="inline-flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-[#0A0A0C] flex items-center justify-center text-white font-semibold text-base shadow-md">
                V
              </div>
            </Link>
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight">
              Reset your password
            </h1>
            <p className="text-[13px] text-neutral-500 leading-relaxed">
              Enter the email associated with your account and we'll send you a link to reset your password.
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="reset-email" className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                Email address
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <input
                  id="reset-email"
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full btn-pill-blue py-3 text-[13px] font-semibold shadow-pill-blue hover:shadow-pill-blue-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                "Send reset link"
              )}
            </button>
          </form>

          {/* Back to Login */}
          <div className="text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[12px] text-neutral-500 hover:text-[#0A0A0C] font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
