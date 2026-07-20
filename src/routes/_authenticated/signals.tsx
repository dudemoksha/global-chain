import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { getMySupplyGraph, listMySuppliers } from "@/lib/suppliers.functions";
import {
  generateSignals,
  severityColor,
  severityLabel,
  type SignalKind,
  type Severity,
} from "@/lib/risk-signals";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const suppliersQuery = queryOptions({
  queryKey: ["suppliers", "mine"],
  queryFn: () => listMySuppliers(),
});
const graphQuery = queryOptions({
  queryKey: ["suppliers", "graph"],
  queryFn: () => getMySupplyGraph(),
});

export const Route = createFileRoute("/_authenticated/signals")({
  head: () => ({
    meta: [
      { title: "Signals · Global-Chain" },
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
  component: SignalsPage,
});

const KIND_FILTERS: Array<SignalKind | "all"> = [
  "all",
  "geopolitical",
  "climate",
  "logistics",
  "cyber",
  "regulatory",
];
const SEV_FILTERS: Array<Severity | "all"> = ["all", "critical", "high", "medium", "low"];

function SignalsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  if (!me.profile) return null;
  if (!me.profile.is_approved && !me.isAdmin) {
    return (
      <AppShell isAdmin={me.isAdmin} email={me.profile.work_email}>
        <UnderReview />
      </AppShell>
    );
  }
  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile.work_email}>
      <Feed />
    </AppShell>
  );
}

function Feed() {
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const { data: graph } = useSuspenseQuery(graphQuery);
  const [kind, setKind] = useState<SignalKind | "all">("all");
  const [sev, setSev] = useState<Severity | "all">("all");

  const signals = useMemo(() => {
    const orgs: Array<{ id: string; name: string; country: string }> = [];
    suppliers.forEach((s) => {
      if (s.organizations)
        orgs.push({
          id: s.organizations.id,
          name: s.organizations.display_name,
          country: s.organizations.country,
        });
    });
    graph
      .filter((g) => g.tier === 2)
      .forEach((g) =>
        orgs.push({
          id: g.supplier_org_id,
          name: g.supplier_name,
          country: g.supplier_country,
        }),
      );
    return generateSignals(orgs);
  }, [suppliers, graph]);

  const filtered = signals.filter(
    (s) => (kind === "all" || s.kind === kind) && (sev === "all" || s.severity === sev),
  );

  const byRegion = filtered.reduce<Record<string, number>>((acc, s) => {
    acc[s.region] = (acc[s.region] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-10">
      <div className="mono-label">§ Live signals</div>
      <h1 className="mt-3 font-display text-[32px] font-medium tracking-tight">
        Continuous exposure feed
      </h1>
      <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
        Geopolitical, climate, logistics, cyber and regulatory events that
        intersect your Tier-1 and hidden Tier-2 dependencies.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          <div className="flex flex-wrap gap-4 border-b border-border pb-4">
            <FilterGroup label="Kind">
              {KIND_FILTERS.map((k) => (
                <Chip key={k} active={k === kind} onClick={() => setKind(k)}>
                  {k}
                </Chip>
              ))}
            </FilterGroup>
            <FilterGroup label="Severity">
              {SEV_FILTERS.map((k) => (
                <Chip key={k} active={k === sev} onClick={() => setSev(k)}>
                  {k}
                </Chip>
              ))}
            </FilterGroup>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-10 rounded-md border border-border p-8 text-center text-[13px] text-muted-foreground">
              No signals match these filters.
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {filtered.map((s) => (
                <li key={s.id} className="py-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: severityColor(s.severity) }}
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-[14.5px] font-medium">
                          {s.headline}
                        </span>
                        <span className="mono-label">
                          {severityLabel(s.severity)} · {s.kind}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {s.detail}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-muted-foreground">
                        <span>
                          {s.country} · {s.region}
                        </span>
                        <span>·</span>
                        <span>{s.hoursAgo}h ago</span>
                        <span>·</span>
                        <span>Touches {s.affectsOrgIds.length} node{s.affectsOrgIds.length === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-md border border-border bg-card p-5">
            <div className="mono-label">By region</div>
            <ul className="mt-3 space-y-2 text-[13px]">
              {Object.entries(byRegion)
                .sort((a, b) => b[1] - a[1])
                .map(([r, n]) => (
                  <li key={r} className="flex items-center justify-between">
                    <span>{r}</span>
                    <span className="text-muted-foreground">{n}</span>
                  </li>
                ))}
              {Object.keys(byRegion).length === 0 && (
                <li className="text-muted-foreground">—</li>
              )}
            </ul>
          </div>
          <div className="rounded-md border border-border bg-card p-5">
            <div className="mono-label">Recommended action</div>
            <p className="mt-2 text-[13px]">
              Run a <Link to="/simulation" className="text-primary hover:underline">simulation</Link> against the top-severity region to size the impact before it becomes live.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono-label mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
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
      className={`rounded-full border px-2.5 py-0.5 text-[11.5px] capitalize ${
        active
          ? "border-primary bg-accent text-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function UnderReview() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24">
      <div className="mono-label !text-primary">§ Under review</div>
      <h1 className="mt-3 font-display text-[28px] font-medium">
        Signals unlock once your organisation is approved.
      </h1>
    </div>
  );
}
