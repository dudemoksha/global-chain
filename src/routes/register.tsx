import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Mark } from "@/components/site/mark";
import { supabase } from "@/integrations/supabase/client";
import { PASSWORD_RULE, validatePassword } from "@/lib/password";


export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Request access · Global-Chain" },
      {
        name: "description",
        content:
          "Submit your organisation for admin review to join the Global-Chain supply-chain intelligence network.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegisterPage,
});

type FormState = {
  legalName: string;
  hqCountry: string;
  industry: string;
  tierRole: "buyer" | "supplier" | "both" | "";
  fullName: string;
  workEmail: string;
  jobTitle: string;
  password: string;
  note: string;
};

const empty: FormState = {
  legalName: "",
  hqCountry: "",
  industry: "",
  tierRole: "",
  fullName: "",
  workEmail: "",
  jobTitle: "",
  password: "",
  note: "",
};

const steps = [
  { n: "01", h: "Organisation" },
  { n: "02", h: "Point of contact" },
  { n: "03", h: "Review & submit" },
] as const;

function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(empty);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pwError = useMemo(
    () => (form.password ? validatePassword(form.password) : null),
    [form.password],
  );

  const canNext = useMemo(() => {
    if (step === 0)
      return form.legalName && form.hqCountry && form.industry && form.tierRole;
    if (step === 1)
      return (
        form.fullName &&
        form.workEmail &&
        form.jobTitle &&
        !validatePassword(form.password)
      );
    return true;
  }, [step, form]);


  const set =
    <K extends keyof FormState>(k: K) =>
    (v: FormState[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setErr(null);
    const pwErr = validatePassword(form.password);
    if (pwErr) {
      setErr(pwErr);
      return;
    }
    setBusy(true);

      email: form.workEmail,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: form.fullName,
          job_title: form.jobTitle,
          legal_name: form.legalName,
          hq_country: form.hqCountry,
          industry: form.industry,
          tier_role: form.tierRole,
          note: form.note,
        },
      },
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setSubmitted(true);
    // If email confirmation is disabled the session is already active — forward
    // to the dashboard, which handles the pending-approval screen itself.
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1200);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-6">
          <Link to="/">
            <Mark />
          </Link>
          <Link
            to="/login"
            className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Already enrolled? Sign in →
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1080px] gap-12 px-6 py-16 md:grid-cols-[260px_1fr]">
        <aside>
          <div className="mono-label">§ Enrolment</div>
          <h1 className="mt-3 font-display text-[28px] font-medium leading-[1.15] tracking-tight">
            Request organisational access.
          </h1>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Three short sections. Approval is human-reviewed; expect a response
            within two business days.
          </p>

          <ol className="mt-10 space-y-4 border-l border-border pl-5">
            {steps.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <li key={s.n} className="relative">
                  <span
                    className={`absolute -left-[26px] top-1.5 inline-flex h-2 w-2 rounded-full ${
                      active
                        ? "bg-primary ring-4 ring-[oklch(0.95_0.02_232)]"
                        : done
                        ? "bg-foreground"
                        : "border border-border-strong bg-background"
                    }`}
                  />
                  <div className="font-mono text-[10.5px] tracking-widest text-muted-foreground">
                    {s.n}
                  </div>
                  <div
                    className={`text-[13.5px] ${
                      active ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.h}
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="rounded-md border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-6 py-3">
            <span className="mono-label">
              Step {steps[step].n} · {steps[step].h}
            </span>
            <span className="mono-label">Draft</span>
          </header>

          {submitted ? (
            <SubmittedPanel org={form.legalName} email={form.workEmail} />
          ) : (
            <div className="p-6">
              {step === 0 && (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field
                    className="sm:col-span-2"
                    label="Legal organisation name"
                    value={form.legalName}
                    onChange={set("legalName")}
                    placeholder="Acme Robotics International Ltd."
                  />
                  <Field
                    label="HQ country"
                    value={form.hqCountry}
                    onChange={set("hqCountry")}
                    placeholder="Germany"
                  />
                  <Field
                    label="Industry"
                    value={form.industry}
                    onChange={set("industry")}
                    placeholder="Industrial manufacturing"
                  />
                  <div className="sm:col-span-2">
                    <div className="mono-label mb-2">Role in the network</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["buyer", "supplier", "both"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => set("tierRole")(r)}
                          className={`rounded-md border px-3 py-3 text-left text-[13px] transition-colors ${
                            form.tierRole === r
                              ? "border-foreground bg-surface"
                              : "border-border hover:border-border-strong"
                          }`}
                        >
                          <div className="font-medium capitalize">{r}</div>
                          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                            {r === "buyer" && "You purchase from suppliers"}
                            {r === "supplier" && "You supply other organisations"}
                            {r === "both" && "Buyer and supplier"}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field
                    label="Full name"
                    value={form.fullName}
                    onChange={set("fullName")}
                    placeholder="Ines Marchetti"
                  />
                  <Field
                    label="Job title"
                    value={form.jobTitle}
                    onChange={set("jobTitle")}
                    placeholder="Head of Continuity"
                  />
                  <Field
                    className="sm:col-span-2"
                    label="Work email"
                    type="email"
                    value={form.workEmail}
                    onChange={set("workEmail")}
                    placeholder="ines@acme.co"
                  />
                  <Field
                    className="sm:col-span-2"
                    label="Password (min. 8 characters)"
                    type="password"
                    value={form.password}
                    onChange={set("password")}
                    placeholder="••••••••"
                  />
                  <div className="sm:col-span-2">
                    <div className="mono-label mb-1.5">
                      Brief note (optional)
                    </div>
                    <textarea
                      rows={4}
                      value={form.note}
                      onChange={(e) => set("note")(e.target.value)}
                      placeholder="Anything the trust desk should know — priorities, existing tooling, timelines."
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <p className="text-[13px] text-muted-foreground">
                    Review the details below. On submission your account is
                    created and your organisation enters the trust-desk queue.
                  </p>
                  <dl className="mt-6 divide-y divide-border border-y border-border">
                    {[
                      ["Organisation", form.legalName],
                      ["HQ country", form.hqCountry],
                      ["Industry", form.industry],
                      ["Role", form.tierRole],
                      ["Contact", `${form.fullName} · ${form.jobTitle}`],
                      ["Email", form.workEmail],
                      ["Note", form.note || "—"],
                    ].map(([k, v]) => (
                      <div
                        key={k as string}
                        className="grid grid-cols-[160px_1fr] gap-4 py-3"
                      >
                        <dt className="mono-label">{k}</dt>
                        <dd className="text-[13.5px]">{v as string}</dd>
                      </div>
                    ))}
                  </dl>
                  {err && (
                    <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
                      {err}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!submitted && (
            <footer className="flex items-center justify-between border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0 || busy}
                className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                ← Back
              </button>
              {step < 2 ? (
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={() => setStep((s) => Math.min(2, s + 1))}
                  className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? "Submitting…" : "Create account & submit →"}
                </button>
              )}
            </footer>
          )}
        </section>
      </div>
    </div>
  );
}

function SubmittedPanel({ org, email }: { org: string; email: string }) {
  return (
    <div className="p-8 animate-rise">
      <div className="mono-label !text-primary">§ Received</div>
      <h2 className="mt-3 font-display text-[26px] font-medium tracking-tight">
        Your account is created and your request is in the queue.
      </h2>
      <p className="mt-3 max-w-md text-[13.5px] text-muted-foreground">
        The trust desk will review {org || "your organisation"} within two
        business days. A decision will be sent to{" "}
        <span className="text-foreground">{email || "your work email"}</span>.
        You'll be taken to a status page shortly.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          ["Status", "Awaiting review"],
          ["Queue", "Trust desk"],
          ["Est. response", "≤ 48h"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border p-3">
            <div className="mono-label">{k}</div>
            <div className="mt-1 font-display text-[16px] font-medium">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90"
        >
          Continue →
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <div className="mono-label mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
      />
    </label>
  );
}
