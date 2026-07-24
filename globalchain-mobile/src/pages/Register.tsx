import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { registerUser } from '../lib/server-fns';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Form State
  const [legalName, setLegalName] = useState('');
  const [hqCountry, setHqCountry] = useState('');
  const [industry, setIndustry] = useState('');
  const [tierRole, setTierRole] = useState<'buyer' | 'supplier' | 'both' | ''>('');
  
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');

  const validatePassword = (pw: string) => {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    return null;
  };

  const handleNext = () => {
    if (step === 0) {
      if (legalName && hqCountry && industry && tierRole) {
        setStep(1);
      } else {
        setErr('Please fill in all organization fields.');
      }
    } else if (step === 1) {
      const pwErr = validatePassword(password);
      if (fullName && workEmail && jobTitle && !pwErr) {
        setStep(2);
        setErr(null);
      } else if (pwErr) {
        setErr(pwErr);
      } else {
        setErr('Please fill in all contact fields.');
      }
    }
  };

  const handleBack = () => {
    setStep((prev) => Math.max(0, prev - 1));
    setErr(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 2) {
      handleNext();
      return;
    }

    setErr(null);
    setBusy(true);

    try {
      await registerUser({
        data: {
          email: workEmail,
          password: password,
          fullName: fullName,
          jobTitle: jobTitle,
          legalName: legalName,
          hqCountry: hqCountry,
          industry: industry,
          tierRole: tierRole,
          note: note,
        }
      });

      // Attempt to sign in immediately (user will log in if approved, otherwise show registration submitted message)
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: workEmail,
        password: password,
      });

      if (!signInErr) {
        navigate('/dashboard');
      } else {
        setErr('Registration request submitted! Please sign in once approved.');
        setTimeout(() => navigate('/login'), 2500);
      }
    } catch (e: any) {
      setErr(e.message || 'An error occurred during registration.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between p-6">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-foreground rounded flex items-center justify-center text-background font-display font-bold text-sm">
              G
            </div>
            <span className="font-display font-medium text-lg tracking-tight">Global-Chain</span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            Sign in →
          </button>
        </div>

        {/* Access Title */}
        <div>
          <div className="mono-label">§ Enrolment · Step {step + 1} of 3</div>
          <h1 className="mt-2 font-display text-[26px] font-medium tracking-tight">
            Request access
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
            {step === 0 && 'Enter your organization details to map your nodes.'}
            {step === 1 && 'Provide primary contact credentials.'}
            {step === 2 && 'Review request notes for verification.'}
          </p>
        </div>

        {/* Form */}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <div className="mono-label mb-1.5">Registered Legal Name</div>
                <input
                  type="text"
                  required
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Acme Corp Ltd"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
                />
              </div>

              <div>
                <div className="mono-label mb-1.5">HQ Country</div>
                <input
                  type="text"
                  required
                  value={hqCountry}
                  onChange={(e) => setHqCountry(e.target.value)}
                  placeholder="Germany"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
                />
              </div>

              <div>
                <div className="mono-label mb-1.5">Industry Sector</div>
                <input
                  type="text"
                  required
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="Semiconductors"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
                />
              </div>

              <div>
                <div className="mono-label mb-1.5">Supply Chain Role</div>
                <select
                  required
                  value={tierRole}
                  onChange={(e: any) => setTierRole(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
                >
                  <option value="">Select role...</option>
                  <option value="buyer">Procuring Entity (Buyer)</option>
                  <option value="supplier">Material Supplier</option>
                  <option value="both">Both (Procure & Supply)</option>
                </select>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <div className="mono-label mb-1.5">Full Name</div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
                />
              </div>

              <div>
                <div className="mono-label mb-1.5">Work Email</div>
                <input
                  type="email"
                  required
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value)}
                  placeholder="jane.doe@acme.co"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
                />
              </div>

              <div>
                <div className="mono-label mb-1.5">Job Title</div>
                <input
                  type="text"
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Supply Chain Analyst"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
                />
              </div>

              <div>
                <div className="mono-label mb-1.5">Password</div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="mono-label mb-1.5">Enrolment Verification Notes</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Tell our administrators about your company verify links or active clients..."
                  rows={4}
                  className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-foreground transition-colors resize-none"
                />
              </div>

              <div className="bg-surface rounded-md border border-border p-4 text-[12.5px] leading-relaxed text-muted-foreground">
                <div className="font-semibold text-foreground mb-1">Verify details before submission:</div>
                <p>• Company: <span className="text-foreground font-medium">{legalName}</span> ({hqCountry})</p>
                <p>• Contact: <span className="text-foreground font-medium">{fullName}</span> · {jobTitle}</p>
                <p>• Email: <span className="text-foreground font-medium">{workEmail}</span></p>
              </div>
            </div>
          )}

          {err && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
              {err}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            {step > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="flex-1 border border-border text-foreground py-3 rounded-md text-[13px] font-medium hover:bg-surface transition-colors"
              >
                Back
              </button>
            )}
            <button
              type="submit"
              disabled={busy}
              className="flex-1 bg-foreground text-background py-3 rounded-md text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {step < 2 ? 'Next' : busy ? 'Submitting…' : 'Submit Access Request'}
            </button>
          </div>
        </form>
      </div>

      <div className="text-center pt-8 border-t border-border text-[10px] uppercase tracking-wider text-muted-foreground">
        Secure Enrolment · TLS 1.3
      </div>
    </div>
  );
};
