import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mark } from "@/components/site/mark";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · Global-Chain" },
      {
        name: "description",
        content: "Operator sign-in for the Global-Chain supply-chain intelligence platform.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      {/* Left — editorial rail */}
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

      {/* Right — form */}
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
              Enter your issued credentials. Sessions are keyed to your
              organisation's namespace.
            </p>
          </div>

          {submitted ? (
            <div className="mt-8 rounded-md border border-border bg-surface p-5">
              <div className="mono-label !text-primary">Authenticating…</div>
              <p className="mt-2 text-[13px] text-muted-foreground">
                Backend is not yet connected in this build. Credentials were not
                submitted anywhere.
              </p>
            </div>
          ) : (
            <form
              className="mt-8 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
            >
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
                trailing={
                  <a
                    href="#"
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Forgot?
                  </a>
                }
              />

              <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[oklch(0.58_0.13_232)]"
                />
                Keep me signed in on this device
              </label>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
              >
                Continue
                <span aria-hidden>→</span>
              </button>
            </form>
          )}

          <div className="my-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="mono-label">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="rounded-md border border-border p-4 text-[13px]">
            <div className="mono-label">No account yet?</div>
            <p className="mt-2 text-muted-foreground">
              Enrolment is admin-reviewed and typically takes 2–3 business days.
            </p>
            <Link
              to="/register"
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:text-primary"
            >
              Request access →
            </Link>
          </div>

          <p className="mt-8 text-[11.5px] text-muted-foreground">
            By continuing you accept the{" "}
            <a href="#" className="underline underline-offset-2 hover:text-foreground">
              Terms
            </a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-2 hover:text-foreground">
              Data Handling policy
            </a>
            .
          </p>
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
  trailing,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="mono-label">{label}</span>
        {trailing}
      </div>
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
