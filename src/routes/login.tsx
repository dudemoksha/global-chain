import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Mark } from "@/components/site/mark";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · Global-Chain" },
      { name: "description", content: "Operator sign-in for Global-Chain." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/login" });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // If already signed in, forward.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) navigate({ to: redirect ?? "/dashboard", replace: true });
    })();
  }, [navigate, redirect]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    navigate({ to: redirect ?? "/dashboard", replace: true });
  }

  async function onGoogle() {
    setErr(null);
    setGoogleBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setErr(result.error.message ?? "Google sign-in failed");
      setGoogleBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: redirect ?? "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between border-r border-border bg-surface p-10 lg:flex">
        <Link to="/">
          <Mark />
        </Link>

        <div className="max-w-md">
          <div className="mono-label">Operators' Bulletin · Vol 04</div>
          <blockquote className="mt-6 font-display text-[28px] font-medium leading-[1.2] tracking-tight text-foreground">
            &ldquo;We caught a tier-three failure eleven days before it would
            have reached the assembly line. That's the whole thesis.&rdquo;
          </blockquote>
          <div className="mt-6 border-t border-border pt-4">
            <div className="text-[13px] font-medium">Ines Marchetti</div>
            <div className="text-[12px] text-muted-foreground">
              Head of Continuity · Meridian Aerospace
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="mono-label">Secure channel · TLS 1.3</p>
          <p className="mono-label">Region · EU-West-1</p>
        </div>

        <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" aria-hidden />
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-rise">
          <Link to="/" className="lg:hidden">
            <Mark />
          </Link>
          <div className="mt-8 lg:mt-0">
            <div className="mono-label">§ Access</div>
            <h1 className="mt-3 font-display text-[30px] font-medium tracking-tight">
              Operator sign-in
            </h1>
            <p className="mt-2 text-[13.5px] text-muted-foreground">
              Sign in with your issued credentials. Sessions are keyed to your
              organisation's namespace.
            </p>
          </div>

          <button
            type="button"
            onClick={onGoogle}
            disabled={googleBusy}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50"
          >
            <GoogleIcon />
            {googleBusy ? "Opening Google…" : "Continue with Google"}
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="mono-label">or with email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-5" onSubmit={onSubmit}>
            <Field
              label="Work email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={setEmail}
              placeholder="operator@acme.co"
            />
            <Field
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={setPassword}
            />

            {err && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Continue"}
              <span aria-hidden>→</span>
            </button>
          </form>

          <div className="mt-8 rounded-md border border-border p-4 text-[13px]">
            <div className="mono-label">No account yet?</div>
            <p className="mt-2 text-muted-foreground">
              Enrolment is admin-reviewed and typically takes under 48 hours.
            </p>
            <Link
              to="/register"
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:text-primary"
            >
              Request access →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <div className="mono-label mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
      />
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.1-10.1 7.1-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l-7.9-6.1C1 16.7 0 20.2 0 24s1 7.3 2.6 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 12-2.2 16-5.9l-7.6-5.9c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
