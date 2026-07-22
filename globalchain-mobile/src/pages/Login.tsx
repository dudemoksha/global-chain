import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { Eye, EyeOff } from 'lucide-react';
import { requestPasswordReset } from '../lib/server-fns';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Forgot Password state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetErr, setResetErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErr(error.message);
        return;
      }
      navigate('/dashboard');
    } catch (e: any) {
      setErr(e.message || 'An error occurred during sign in.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetErr(null);
    setResetBusy(true);
    try {
      await requestPasswordReset({ email: resetEmail });
      setResetSuccess(true);
    } catch (err: any) {
      setResetErr(err.message || 'Failed to request password reset.');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between p-6">
      {/* Top Section */}
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-6 w-6 bg-foreground rounded flex items-center justify-center text-background font-display font-bold text-sm">
            G
          </div>
          <span className="font-display font-medium text-lg tracking-tight">Global-Chain</span>
        </div>

        <div>
          <div className="mono-label">§ Access</div>
          <h1 className="mt-2 font-display text-[26px] font-medium tracking-tight">
            Operator sign-in
          </h1>
          <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
            Sign in with your credentials. Sessions are persistent on this device.
          </p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div>
            <div className="mono-label mb-1.5">Work email</div>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@acme.co"
              autoComplete="email"
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
            />
          </div>

          <div>
            <div className="mono-label mb-1.5">Password</div>
            <div className="relative">
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 pr-10 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="text-[12px] text-muted-foreground hover:text-foreground font-medium underline"
            >
              Forgot password?
            </button>
          </div>

          {err && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-foreground text-background py-3 rounded-md text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {busy ? 'Signing in…' : 'Continue →'}
          </button>
        </form>

        <div className="mt-8 rounded-md border border-border p-4 text-[13px]">
          <div className="mono-label">No account yet?</div>
          <p className="mt-2 text-muted-foreground leading-relaxed">
            Enrolment requires admin approval. Typically approved in under 48 hours.
          </p>
          <button
            onClick={() => navigate('/register')}
            className="mt-3 text-[13px] font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            Request access →
          </button>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 className="font-display text-[20px] font-medium tracking-tight">Forgot Password</h2>
            <p className="mt-2 text-[13px] text-muted-foreground leading-relaxed">
              Enter your work email address. We will submit a password reset request to the administrators.
            </p>

            {resetSuccess ? (
              <div className="mt-4 rounded-md border border-green-500/20 bg-green-500/5 p-4 text-[13px] text-foreground">
                <p className="font-semibold text-green-500">✔ Request submitted</p>
                <p className="mt-1 text-muted-foreground leading-relaxed">
                  Your request was sent. Once approved, the admin will set a temporary password for you to sign in.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetModal(false);
                    setResetSuccess(false);
                    setResetEmail('');
                  }}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-foreground py-2 text-[13.5px] font-medium text-background hover:opacity-90"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="mt-4 space-y-4">
                <div>
                  <div className="mono-label mb-1.5">Work email</div>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="operator@acme.co"
                    className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
                  />
                </div>

                {resetErr && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
                    {resetErr}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetModal(false);
                      setResetErr(null);
                    }}
                    className="flex-1 rounded-md border border-border py-2 text-[13px] font-medium text-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetBusy}
                    className="flex-1 rounded-md bg-foreground py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-60"
                  >
                    {resetBusy ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="text-center pt-8 border-t border-border flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
        <span>Secure channel · TLS 1.3</span>
        <span>Mobile App v1.0</span>
      </div>
    </div>
  );
};
