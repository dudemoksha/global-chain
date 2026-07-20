import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { getMySupplyGraph, listMySuppliers } from "@/lib/suppliers.functions";
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
const graphQuery = queryOptions({
  queryKey: ["suppliers", "graph"],
  queryFn: () => getMySupplyGraph(),
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
      await Promise.all([
        context.queryClient.ensureQueryData(suppliersQuery).catch(() => []),
        context.queryClient.ensureQueryData(graphQuery).catch(() => []),
      ]);
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

function SimBody() {
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const { data: graph } = useSuspenseQuery(graphQuery);

  const countries = useMemo(() => {
    const set = new Set<string>();
    suppliers.forEach((s) => s.organizations?.country && set.add(s.organizations.country));
    graph.filter((g) => g.tier === 2).forEach((g) => g.supplier_country && set.add(g.supplier_country));
    return Array.from(set).sort();
  }, [suppliers, graph]);

  const [country, setCountry] = useState<string>(countries[0] ?? "");
  const [kind, setKind] = useState<SignalKind>("geopolitical");
  const [severity, setSeverity] = useState<Severity>("high");
  const [ran, setRan] = useState(false);

  // Build org list once.
  const orgs = useMemo(() => {
    const list: Array<{ id: string; name: string; country: string; tier: 1 | 2 }> = [];
    suppliers.forEach((s) => {
      if (s.organizations)
        list.push({
          id: s.organizations.id,
          name: s.organizations.display_name,
          country: s.organizations.country,
          tier: 1,
        });
    });
    graph
      .filter((g) => g.tier === 2)
      .forEach((g) =>
        list.push({
          id: g.supplier_org_id,
          name: g.supplier_name,
          country: g.supplier_country,
          tier: 2,
        }),
      );
    return list;
  }, [suppliers, graph]);

  const result = useMemo(() => {
    if (!ran || !country) return null;
    const impacted = orgs.filter((o) => o.country === country);
    const t1 = impacted.filter((o) => o.tier === 1);
    const t2 = impacted.filter((o) => o.tier === 2);
    const signals = generateSignals(
      orgs.map((o) => ({ id: o.id, name: o.name, country: o.country })),
      { country, kind, severity },
    );
    // Determine affected industry + category to drive cross-operator recommendations.
    const affected = suppliers.filter(
      (s) => s.organizations?.country === country,
    );
    const industry = affected.find((s) => s.organizations?.industry)?.organizations
      ?.industry ?? "";
    const category = affected.find((s) => s.category)?.category ?? "";
    return {
      impacted,
      t1,
      t2,
      signals: signals.filter(
        (s) => s.id.startsWith("sim-") || s.country === country,
      ),
      industry,
      category,
    };
  }, [ran, country, kind, severity, orgs, suppliers]);

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-10">
      <div className="mono-label">§ Simulation sandbox</div>
      <h1 className="mt-3 font-display text-[32px] font-medium tracking-tight">
        What-if. Nothing here is real.
      </h1>
      <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
        Model a disruption against a country, severity and category. Results are
        computed locally — nothing is written to your live signal history.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="rounded-md border border-border bg-card p-5">
          <div className="mono-label">Scenario</div>
          <div className="mt-4 space-y-4">
            <Field label="Country">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
              >
                {countries.length === 0 && <option value="">No countries in graph</option>}
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
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
            <button
              type="button"
              disabled={!country}
              onClick={() => setRan(true)}
              className="w-full rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              Run simulation
            </button>
            {ran && (
              <button
                type="button"
                onClick={() => setRan(false)}
                className="w-full rounded-md border border-border px-4 py-2 text-[12.5px] text-muted-foreground hover:bg-surface"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div>
          {!result ? (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-md border border-dashed border-border p-10 text-center">
              <p className="max-w-md text-[13px] text-muted-foreground">
                Configure a scenario and press <span className="text-foreground">Run simulation</span>. You'll see impacted nodes, projected signals and alternative suppliers.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                <Stat k="Impacted nodes" v={result.impacted.length.toString()} />
                <Stat k="Tier-1 hit" v={result.t1.length.toString()} emphasis={result.t1.length > 0} />
                <Stat k="Tier-2 hit" v={result.t2.length.toString()} />
              </div>

              <Section title="Projected signals">
                {result.signals.length === 0 ? (
                  <Empty msg="No signals generated for this scenario." />
                ) : (
                  <ul className="divide-y divide-border">
                    {result.signals.slice(0, 5).map((s) => (
                      <li key={s.id} className="py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: severityColor(s.severity) }}
                          />
                          <span className="text-[13.5px] font-medium">{s.headline}</span>
                        </div>
                        <p className="mt-1 pl-4 text-[12.5px] text-muted-foreground">
                          {s.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Impacted nodes">
                {result.impacted.length === 0 ? (
                  <Empty msg="No nodes in this country are in your graph." />
                ) : (
                  <ul className="divide-y divide-border">
                    {result.impacted.map((o) => (
                      <li key={o.id} className="flex items-center justify-between py-2.5 text-[13px]">
                        <span>{o.name}</span>
                        <span className="mono-label">Tier {o.tier}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <RecommendationsPanel
                title="Recommended alternatives"
                subtitle={`Cross-operator matches for ${result.industry || "affected industry"}, avoiding ${country}.`}
                industry={result.industry}
                category={result.category}
                avoidCountry={country}
                limit={6}
              />
              <div>
                <Link
                  to="/suppliers"
                  className="inline-flex text-[12.5px] font-medium text-primary hover:underline"
                >
                  Manage supplier directory →
                </Link>
              </div>
            </div>
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
    <div className={`rounded-md border p-4 ${emphasis ? "border-primary/40 bg-accent" : "border-border bg-card"}`}>
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
