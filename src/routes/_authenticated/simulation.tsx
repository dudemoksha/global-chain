import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { listMySuppliers } from "@/lib/suppliers.functions";
import {
  generateSignals,
  severityColor,
  type SignalKind,
  type Severity,
} from "@/lib/risk-signals";
import { RecommendationsPanel } from "@/components/site/recommendations-panel";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const suppliersQuery = queryOptions({
  queryKey: ["suppliers", "mine"],
  queryFn: () => listMySuppliers(),
});

export const Route = createFileRoute("/_authenticated/simulation")({
  head: () => ({
    meta: [
      { title: "Simulation · Global-Chain" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me.profile?.is_approved || me.isAdmin) {
      await context.queryClient.ensureQueryData(suppliersQuery).catch(() => []);
    }
    return null;
  },
  component: SimulationPage,
});

function SimulationPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  if (!me.profile) return null;
  if (!me.profile.is_approved && !me.isAdmin) {
    return (
      <AppShell isAdmin={me.isAdmin} email={me.profile.work_email}>
        <div className="mx-auto max-w-xl px-6 py-24">
          <div className="mono-label !text-primary">§ Under review</div>
          <h1 className="mt-3 font-display text-[28px] font-medium">
            Simulation unlocks once your organisation is approved.
          </h1>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile.work_email}>
      <SimBody />
    </AppShell>
  );
}

const KINDS: SignalKind[] = ["geopolitical", "climate", "logistics", "cyber", "regulatory"];
const SEVS: Severity[] = ["medium", "high", "critical"];

type Mode = "country" | "company";

function SimBody() {
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);

  const countries = useMemo(() => {
    const s = new Set<string>();
    suppliers.forEach((r) => r.organizations?.country && s.add(r.organizations.country));
    return Array.from(s).sort();
  }, [suppliers]);

  const [mode, setMode] = useState<Mode>("country");
  const [country, setCountry] = useState<string>(countries[0] ?? "");
  const [companyId, setCompanyId] = useState<string>(suppliers[0]?.organizations?.id ?? "");
  const [kind, setKind] = useState<SignalKind>("geopolitical");
  const [severity, setSeverity] = useState<Severity>("high");
  const [ran, setRan] = useState(false);

  const orgs = useMemo(
    () =>
      suppliers
        .filter((s) => s.organizations)
        .map((s) => ({
          id: s.organizations!.id,
          name: s.organizations!.display_name,
          country: s.organizations!.country,
          industry: s.organizations!.industry,
          product: s.product ?? "",
          category: s.category ?? "",
          criticality: s.criticality,
        })),
    [suppliers],
  );

  const result = useMemo(() => {
    if (!ran) return null;
    let impacted: typeof orgs = [];
    let scenarioCountry = "";
    if (mode === "country" && country) {
      scenarioCountry = country;
      impacted = orgs.filter((o) => o.country === country);
    } else if (mode === "company" && companyId) {
      const target = orgs.find((o) => o.id === companyId);
      if (target) {
        scenarioCountry = target.country;
        impacted = [target];
      }
    }
    const signals = generateSignals(
      orgs.map((o) => ({ id: o.id, name: o.name, country: o.country })),
      scenarioCountry ? { country: scenarioCountry, kind, severity } : null,
    ).filter((s) => s.id.startsWith("sim-") || s.country === scenarioCountry);

    return { impacted, scenarioCountry, signals };
  }, [ran, mode, country, companyId, kind, severity, orgs]);

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-10">
      <div className="mono-label">§ Simulation sandbox</div>
      <h1 className="mt-3 font-display text-[32px] font-medium tracking-tight">
        What-if. Nothing here is saved.
      </h1>
      <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
        Model a disruption against a country or a specific supplier. Results are
        computed on-the-fly — your live risk history, alerts and supplier
        records are never touched.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* LEFT: current suppliers */}
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-baseline justify-between border-b border-border px-5 py-3">
            <div className="mono-label">Your current suppliers</div>
            <span className="mono-label">{suppliers.length}</span>
          </div>
          {suppliers.length === 0 ? (
            <p className="p-5 text-[13px] text-muted-foreground">
              You haven't added suppliers yet. Add some in the Suppliers tab to
              run scenarios against them.
            </p>
          ) : (
            <ul className="max-h-[560px] divide-y divide-border overflow-auto">
              {suppliers.map((s) => {
                const hit =
                  result &&
                  ((mode === "country" && s.organizations?.country === result.scenarioCountry) ||
                    (mode === "company" && s.organizations?.id === companyId));
                return (
                  <li
                    key={s.id}
                    className={`px-5 py-3 text-[13px] ${
                      hit ? "bg-accent" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {s.organizations?.display_name ?? "—"}
                        </div>
                        <div className="mono-label mt-0.5">
                          {[s.organizations?.country, s.category || s.organizations?.industry]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {s.product && (
                          <div className="text-[12px] text-foreground">{s.product}</div>
                        )}
                        {hit && (
                          <div className="mono-label !text-primary mt-0.5">Impacted</div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* RIGHT: scenario builder + results */}
        <div className="space-y-6">
          <div className="rounded-md border border-border bg-card p-5">
            <div className="mono-label">Scenario</div>
            <div className="mt-4 grid gap-4">
              <Field label="Disruption type">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as SignalKind)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] capitalize"
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Target">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMode("country")}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-[12px] font-medium ${
                      mode === "country"
                        ? "border-primary bg-accent text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Location
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("company")}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-[12px] font-medium ${
                      mode === "company"
                        ? "border-primary bg-accent text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Company
                  </button>
                </div>
              </Field>

              {mode === "country" ? (
                <Field label="Country / region">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
                  >
                    {countries.length === 0 && (
                      <option value="">No supplier countries yet</option>
                    )}
                    {countries.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Supplier">
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
                  >
                    {orgs.length === 0 && <option value="">No suppliers yet</option>}
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.country ? ` — ${o.country}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Severity">
                <div className="flex gap-1.5">
                  {SEVS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeverity(s)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-[12px] font-medium capitalize ${
                        severity === s
                          ? "border-primary bg-accent text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    (mode === "country" && !country) ||
                    (mode === "company" && !companyId)
                  }
                  onClick={() => setRan(true)}
                  className="flex-1 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40"
                >
                  Run simulation
                </button>
                {ran && (
                  <button
                    type="button"
                    onClick={() => setRan(false)}
                    className="rounded-md border border-border px-4 py-2 text-[12.5px] text-muted-foreground hover:bg-surface"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Temporary only — nothing is written to your live data.
              </p>
            </div>
          </div>

          {result && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  k="Impacted suppliers"
                  v={result.impacted.length.toString()}
                  emphasis={result.impacted.length > 0}
                />
                <Stat k="Projected signals" v={result.signals.length.toString()} />
              </div>

              <Section title="Projected signals">
                {result.signals.length === 0 ? (
                  <Empty msg="No signals for this scenario." />
                ) : (
                  <ul className="divide-y divide-border">
                    {result.signals.slice(0, 5).map((s) => (
                      <li key={s.id} className="py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: severityColor(s.severity) }}
                          />
                          <span className="text-[13.5px] font-medium">
                            {s.headline}
                          </span>
                        </div>
                        <p className="mt-1 pl-4 text-[12.5px] text-muted-foreground">
                          {s.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {result.impacted.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-5 text-[13px] text-muted-foreground">
                  None of your current suppliers are exposed to this scenario.
                </div>
              ) : (
                <div className="space-y-4">
                  {result.impacted.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-md border border-border bg-card p-5"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-medium">{o.name}</div>
                          <div className="mono-label mt-0.5">
                            {[o.country, o.industry].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {o.product && (
                          <div className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {o.product}
                          </div>
                        )}
                      </div>
                      <div className="mt-4">
                        <RecommendationsPanel
                          title={`Alternatives for ${o.product || o.category || "this supply"}`}
                          subtitle={`Cross-operator matches${
                            o.country ? `, avoiding ${o.country}` : ""
                          }.`}
                          industry={o.industry}
                          category={o.product || o.category}
                          avoidCountry={o.country}
                          excludeOrgId={o.id}
                          limit={5}
                          compact
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mono-label mb-1.5">{label}</div>
      {children}
    </label>
  );
}
function Stat({ k, v, emphasis }: { k: string; v: string; emphasis?: boolean }) {
  return (
    <div
      className={`rounded-md border p-4 ${
        emphasis ? "border-primary/40 bg-accent" : "border-border bg-card"
      }`}
    >
      <div className="mono-label">{k}</div>
      <div className="mt-1 font-display text-[22px] font-medium">{v}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mono-label mb-2">{title}</div>
      {children}
    </div>
  );
}
function Empty({ msg }: { msg: string }) {
  return <p className="text-[13px] text-muted-foreground">{msg}</p>;
}
