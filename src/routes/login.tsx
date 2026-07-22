import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Mark } from "@/components/site/mark";
import { supabase } from "@/integrations/supabase/client";

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

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <Field
              id="email"
              label="Work email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={setEmail}
              placeholder="operator@acme.co"
            />
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={setPassword}
            />

            {err && (
              <div id="login-error" className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
                {err}
              </div>
            )}

            <button
              id="login-button"
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
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
  autoComplete,
}: {
  id?: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && reveal ? "text" : type;
  return (
    <label className="block">
      <div className="mono-label mb-1.5">{label}</div>
      <div className="relative">
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className={`w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground ${
            isPassword ? "pr-14" : ""
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
            tabIndex={-1}
            aria-label={reveal ? "Hide password" : "Show password"}
          >
            {reveal ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </label>
  );
}

