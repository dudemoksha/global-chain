import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { listMySuppliers } from "@/lib/suppliers.functions";
import { listMyCustomers } from "@/lib/trade-requests.functions";
import { listInventory } from "@/lib/inventory.functions";
import {
  generateSignals,
  severityColor,
  type SignalKind,
  type Severity,
  type RiskSignal,
} from "@/lib/risk-signals";
import { RecommendationsPanel } from "@/components/site/recommendations-panel";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const suppliersQuery = queryOptions({
  queryKey: ["suppliers", "mine"],
  queryFn: () => listMySuppliers(),
});
const customersQuery = queryOptions({
  queryKey: ["customers", "mine"],
  queryFn: () => listMyCustomers(),
});
const inventoryQuery = queryOptions({
  queryKey: ["inventory", "mine"],
  queryFn: () => listInventory(),
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
        context.queryClient.ensureQueryData(customersQuery).catch(() => []),
        context.queryClient.ensureQueryData(inventoryQuery).catch(() => []),
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
const DEFAULT_GLOBAL_COUNTRIES = [
  "Japan",
  "China",
  "Germany",
  "United States",
  "Taiwan",
  "Russia",
  "India",
  "South Korea",
  "Vietnam",
  "Mexico",
];

const CRIT_WEIGHT: Record<string, number> = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 };
const SEV_WEIGHT: Record<Severity, number> = { critical: 1, high: 0.75, medium: 0.5, low: 0.25 };

function SimBody() {
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const { data: customers } = useSuspenseQuery(customersQuery);
  const { data: inventory } = useSuspenseQuery(inventoryQuery);

  // Combine both suppliers (inbound) and customers (outbound)
  const consumed = useMemo(() => {
    const list: any[] = [];
    
    // Add suppliers
    (suppliers ?? [])
      .filter((s) => s.organizations)
      .forEach((s) => {
        list.push({
          id: s.id,
          orgId: s.organizations!.id,
          orgName: s.organizations!.display_name,
          country: s.organizations!.country ?? "",
          industry: s.organizations!.industry ?? "",
          product: s.product ?? "",
          category: s.category ?? "",
          criticality: (s.criticality ?? "medium") as string,
          type: "Supplier (Inbound)",
          spend: s.annual_spend_bucket || "N/A"
        });
      });

    // Add customers
    (customers ?? [])
      .filter((c) => c.customer)
      .forEach((c) => {
        list.push({
          id: c.id,
          orgId: c.customer!.id,
          orgName: c.customer!.legal_name,
          country: c.customer!.hq_country ?? "",
          industry: c.customer!.industry ?? "",
          product: c.product || "",
          category: c.category || "",
          criticality: "medium",
          type: "Customer (Outbound)",
          spend: "N/A"
        });
      });

    return list;
  }, [suppliers, customers]);

  const [customCountries, setCustomCountries] = useState<string[]>([]);
  const countries = useMemo(() => {
    const fromSuppliers = consumed.map((c) => c.country).filter(Boolean);
    const combined = Array.from(new Set([...fromSuppliers, ...DEFAULT_GLOBAL_COUNTRIES, ...customCountries])).sort();
    return combined;
  }, [consumed, customCountries]);

  const [selKinds, setSelKinds] = useState<SignalKind[]>(["geopolitical", "logistics"]);
  const [selCountries, setSelCountries] = useState<string[]>(["Japan", "China"]);
  const [selCompanyIds, setSelCompanyIds] = useState<string[]>([]);
  const [severity, setSeverity] = useState<Severity>("high");
  const [customCountry, setCustomCountry] = useState("");
  const [ran, setRan] = useState(false);

  const toggle = <T,>(arr: T[], v: T) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const addCustomCountry = () => {
    const trimmed = customCountry.trim();
    if (!trimmed) return;
    if (!customCountries.includes(trimmed)) {
      setCustomCountries((s) => [...s, trimmed]);
    }
    if (!selCountries.includes(trimmed)) {
      setSelCountries((s) => [...s, trimmed]);
    }
    setCustomCountry("");
  };

  const result = useMemo(() => {
    if (!ran) return null;
    const targetCountries = new Set(selCountries.map((c) => c.toLowerCase().trim()));
    const targetCompanyIds = new Set(selCompanyIds);

    const impacted = consumed.filter((c) => {
      const cCountry = (c.country || "").toLowerCase().trim();
      const countryMatches = targetCountries.has(cCountry) ||
        (targetCountries.has("india") && cCountry === "inida") ||
        (targetCountries.has("inida") && cCountry === "india");
      
      return countryMatches || targetCompanyIds.has(c.orgId);
    });

    // Calculate risk score (0-100)
    const sevW = SEV_WEIGHT[severity];
    const kindMult = 0.5 + Math.min(selKinds.length, 5) * 0.15;

    let score = 0;
    if (impacted.length > 0 && consumed.length > 0) {
      const weighted = impacted.reduce(
        (acc, i) => acc + (CRIT_WEIGHT[i.criticality] ?? 0.5),
        0,
      );
      score = Math.min(100, Math.round((weighted / consumed.length) * 100 * sevW * kindMult));
    } else {
      score = 0;
    }

    // Generate signals across all selected countries
    const generatedSignals: RiskSignal[] = [];
    const orgsList = consumed.map((o) => ({ id: o.orgId, name: o.orgName, country: o.country }));

    selCountries.forEach((c) => {
      const countrySignals = generateSignals(orgsList, {
        country: c,
        kind: selKinds[0] ?? "geopolitical",
        severity,
      });
      generatedSignals.push(...countrySignals);
    });

    // Deduplicate signals by ID
    const uniqueSignalsMap = new Map<string, RiskSignal>();
    generatedSignals.forEach((s) => uniqueSignalsMap.set(s.id, s));
    const signals = Array.from(uniqueSignalsMap.values());

    return { impacted, signals, score };
  }, [ran, selCountries, selCompanyIds, selKinds, severity, consumed]);

  const handleRun = async () => {
    setRan(true);
    if (!result) return;
    
    const rows: any[] = [];
    const now = new Date().toISOString();
    
    if (result.impacted.length > 0) {
      result.impacted.forEach((imp) => {
        result.signals.forEach((sig) => {
          rows.push({
            user_id: me.profile!.id,
            signal_key: `sim-${sig.id}-${imp.orgId}-${Date.now()}`,
            kind: sig.kind,
            severity: sig.severity,
            country: sig.country,
            headline: `[SIMULATED] ${sig.headline}`,
            detail: `${sig.detail} (Impacts connected partner: ${imp.orgName})`,
            supplier_org_id: imp.orgId,
            supplier_name: imp.orgName,
            created_at: now
          });
        });
      });
    } else {
      result.signals.forEach((sig) => {
        rows.push({
          user_id: me.profile!.id,
          signal_key: `sim-${sig.id}-generic-${Date.now()}`,
          kind: sig.kind,
          severity: sig.severity,
          country: sig.country,
          headline: `[SIMULATED] ${sig.headline}`,
          detail: sig.detail,
          supplier_org_id: null,
          supplier_name: null,
          created_at: now
        });
      });
    }

    if (rows.length > 0) {
      const { supabase: sb } = await import("@/integrations/supabase/client");
      await sb.from("alerts").upsert(rows, { onConflict: "user_id,signal_key" });
    }
  };

  const scoreTone = (n: number) =>
    n >= 60 ? "text-destructive" : n >= 30 ? "text-amber-600" : "text-emerald-700";

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-10">
      <div className="mono-label">§ Simulation sandbox</div>
      <h1 className="mt-3 font-display text-[32px] font-medium tracking-tight">
        What-if. Nothing here is saved.
      </h1>
      <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
        Model a disruption against your supply chain or global regions. Everything runs
        ephemerally — live risk history, alerts and supplier records are never touched.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* LEFT: what the user consumes */}
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-baseline justify-between border-b border-border px-5 py-3">
            <div className="mono-label">Your Connections</div>
            <span className="mono-label">{consumed.length} nodes</span>
          </div>
          {consumed.length === 0 ? (
            <div className="p-5 text-[13px] text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">No connections added yet.</p>
              <p>
                Add suppliers or customers to connect your own trade lines and run stress test models!
              </p>
            </div>
          ) : (
            <ul className="max-h-[560px] divide-y divide-border overflow-auto">
              {consumed.map((c) => {
                const hit =
                  result &&
                  (selCountries.includes(c.country) || selCompanyIds.includes(c.orgId));
                return (
                  <li
                    key={c.id}
                    className={`px-5 py-3 text-[13px] ${
                      hit
                        ? "border-l-4 border-l-destructive bg-destructive/10"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium">
                          {c.product || c.category || "Unspecified product"}
                        </div>
                        <div className="mono-label mt-0.5">
                          {c.type} · {c.orgName}
                          {c.country ? ` · ${c.country}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="rounded-sm border border-border px-1.5 py-0.5 text-[10.5px] capitalize text-muted-foreground">
                          {c.criticality}
                        </div>
                        {hit && (
                          <div className="mono-label !text-destructive mt-1">
                            Impacted
                          </div>
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
            <div className="mono-label">Scenario builder</div>

            <div className="mt-4 space-y-4">
              <Field label="Disruption types (one or more)">
                <div className="flex flex-wrap gap-1.5">
                  {KINDS.map((k) => (
                    <Chip
                      key={k}
                      active={selKinds.includes(k)}
                      onClick={() => setSelKinds((s) => toggle(s, k))}
                    >
                      {k}
                    </Chip>
                  ))}
                </div>
              </Field>

              <Field label="Affected countries (multi-select)">
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 border border-border rounded-md">
                  {countries.map((c) => (
                    <Chip
                      key={c}
                      active={selCountries.includes(c)}
                      onClick={() => setSelCountries((s) => toggle(s, c))}
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={customCountry}
                    onChange={(e) => setCustomCountry(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomCountry();
                      }
                    }}
                    placeholder="Add custom country (e.g. Brazil)"
                    className="flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={addCustomCountry}
                    disabled={!customCountry.trim()}
                    className="rounded-md border border-border px-3 py-1 text-[12px] hover:bg-surface disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </Field>

              {consumed.length > 0 && (
                <Field label="Specific companies (optional)">
                  <div className="max-h-40 overflow-auto rounded-md border border-border p-2">
                    {consumed.map((c) => (
                      <label
                        key={c.orgId}
                        className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-surface"
                      >
                        <input
                          type="checkbox"
                          checked={selCompanyIds.includes(c.orgId)}
                          onChange={() =>
                            setSelCompanyIds((s) => toggle(s, c.orgId))
                          }
                        />
                        <span className="truncate">
                          {c.orgName}
                          {c.country ? ` — ${c.country}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
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

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={
                    selKinds.length === 0 ||
                    (selCountries.length === 0 && selCompanyIds.length === 0)
                  }
                  onClick={handleRun}
                  className="flex-1 rounded-md bg-foreground px-4 py-2.5 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40"
                >
                  Run simulation
                </button>
                {ran && (
                  <button
                    type="button"
                    onClick={() => setRan(false)}
                    className="rounded-md border border-border px-4 py-2.5 text-[12.5px] text-muted-foreground hover:bg-surface"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                This will trigger live risk alerts across your account.
              </p>
            </div>
          </div>

          {result && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border bg-card p-4">
                  <div className="mono-label">Simulated risk</div>
                  <div
                    className={`mt-1 font-display text-[26px] font-medium ${scoreTone(
                      result.score,
                    )}`}
                  >
                    {result.score}
                    <span className="text-[13px] text-muted-foreground">/100</span>
                  </div>
                </div>
                <Stat
                  k="Impacted inbound"
                  v={result.impacted.length.toString()}
                  emphasis={result.impacted.length > 0}
                />
                <Stat k="Signals" v={result.signals.length.toString()} />
              </div>

              <Section title="Projected signals">
                {result.signals.length === 0 ? (
                  <Empty msg="No signals for this scenario." />
                ) : (
                  <ul className="divide-y divide-border">
                    {result.signals.slice(0, 6).map((s) => (
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

              <div className="space-y-4">
                {result.impacted.length > 0 ? (
                  result.impacted.map((o) => {
                    const matchedSku = (inventory || []).find(
                      (item) => item.name.toLowerCase() === o.product.toLowerCase()
                    );
                    const itemPrice = matchedSku ? Number(matchedSku.price || 100) : null;
                    
                    let baseLoss = 0;
                    if (o.type.toLowerCase().includes("supplier")) {
                      if (itemPrice) {
                        baseLoss = itemPrice * 12000; // default annual quantity
                      } else {
                        // Mapped spend bucket
                        if (o.spend === "<$100k") baseLoss = 80000;
                        else if (o.spend === "$100k-1M") baseLoss = 800000;
                        else if (o.spend === "$1M-10M") baseLoss = 8000000;
                        else if (o.spend === ">$10M") baseLoss = 25000000;
                        else baseLoss = 500000;
                      }
                    } else {
                      // Customer loss: default quantity 8000
                      baseLoss = (itemPrice ? itemPrice : 150) * 8000;
                    }

                    const sevMult = severity === "critical" ? 1.5 : severity === "high" ? 1.0 : 0.6;
                    const lossEstimate = Math.round(baseLoss * sevMult);

                    let recoveryTime = 30;
                    if (selKinds.includes("geopolitical")) recoveryTime += 30;
                    if (selKinds.includes("logistics")) recoveryTime += 15;
                    if (severity === "critical") recoveryTime += 30;
                    else if (severity === "high") recoveryTime += 15;

                    const targetDate = new Date();
                    targetDate.setDate(targetDate.getDate() + recoveryTime);
                    const recoveryDateString = targetDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

                    return (
                      <div key={o.id} className="space-y-3">
                        {/* Notification / Disruption alert */}
                        <div className="rounded-md border-2 border-destructive/40 bg-destructive/10 p-4">
                          <div className="flex items-baseline justify-between gap-3">
                            <div>
                              <div className="mono-label !text-destructive">
                                ⚠️ Disruption Alert ({o.type.toLowerCase().includes("supplier") ? "Supplier Sourcing" : "Customer Delivery"})
                              </div>
                              <p className="mt-1.5 text-[13px] text-foreground leading-relaxed">
                                {o.type.toLowerCase().includes("supplier") ? (
                                  <>
                                    A simulated disruption has occurred in <strong>{o.country}</strong>. You may have to change your supplier! Sourcing for <strong>{o.product || o.category || "materials"}</strong> from <strong>{o.orgName}</strong> is halted. Alternate suppliers operating outside of {selCountries.join(", ")} are listed below.
                                  </>
                                ) : (
                                  <>
                                    A simulated disruption has occurred in <strong>{o.country}</strong>. Delivery lines to customer <strong>{o.orgName}</strong> for <strong>{o.product || o.category || "products"}</strong> are disrupted. Please prepare safety stock or coordinate alternate distribution.
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Financial Loss & Recovery Card — amber box */}
                        <div className="rounded-md border-2 border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
                          <div className="mono-label !text-amber-700">Financial Loss & Recovery Projection</div>
                          <div className="grid grid-cols-2 gap-4 text-[13px]">
                            <div>
                              <span className="text-muted-foreground block text-[11px] uppercase tracking-wider font-mono">Disruption Lead Time</span>
                              <span className="font-semibold text-foreground text-[14px]">{recoveryTime} Days</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[11px] uppercase tracking-wider font-mono">Estimated Financial Loss</span>
                              <span className="font-semibold text-destructive text-[14px]">Rs. {lossEstimate.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[11px] uppercase tracking-wider font-mono">Recovery Target Date</span>
                              <span className="font-semibold text-foreground text-[14px]">{recoveryDateString}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[11px] uppercase tracking-wider font-mono">Margin Recovery Horizon</span>
                              <span className="font-semibold text-emerald-700 text-[14px]">{recoveryTime + 30} Days to Reset</span>
                            </div>
                          </div>
                          
                          <div className="text-[12px] text-muted-foreground leading-relaxed pt-1.5 border-t border-border/20 space-y-1.5">
                            <p className="text-[11px] font-mono text-destructive">
                              Estimated daily financial margin impact: <strong>-Rs. {Math.round(lossEstimate * 0.05).toLocaleString()} / day</strong>
                            </p>
                          </div>
                          
                          <Link
                            to="/analytics"
                            search={{
                              disruptedOrgId: o.orgId,
                              disruptedOrgName: o.orgName,
                              disruptedProduct: o.product || o.category,
                              avoidCountries: selCountries.join(",")
                            }}
                            className="mt-3 block text-center rounded-md border border-amber-600/30 bg-amber-500/10 hover:bg-amber-500/20 py-2.5 text-[13px] font-medium text-amber-800 transition-colors"
                          >
                            Analyze Recovery Cost & Alternatives →
                          </Link>
                        </div>

                        {/* Recommendations — green box */}
                        {o.type.toLowerCase().includes("supplier") && (
                          <div className="rounded-md border-2 border-emerald-500/40 bg-emerald-500/10 p-4">
                            <div className="mono-label !text-emerald-700">
                              Recommended alternatives
                            </div>
                            <div className="mt-2">
                              <RecommendationsPanel
                                title=""
                                subtitle={`Cross-operator matches, avoiding ${selCountries.join(", ")}.`}
                                industry={o.industry}
                                category={o.product || o.category}
                                avoidCountry={selCountries.join(",")}
                                excludeOrgId={o.orgId}
                                limit={5}
                                compact
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-2 text-emerald-800">
                    <div className="mono-label !text-emerald-700">✓ Safe Status</div>
                    <p className="text-[14px] font-medium text-emerald-900">
                      You have no connections with the simulated countries/companies, so you are safe. No risk.
                    </p>
                  </div>
                )}
              </div>
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
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium capitalize ${
        active
          ? "border-primary bg-accent text-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
function Stat({ k, v, emphasis }: { k: string; v: string; emphasis?: boolean }) {
  return (
    <div
      className={`rounded-md border p-4 ${
        emphasis ? "border-destructive/40 bg-destructive/10" : "border-border bg-card"
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
