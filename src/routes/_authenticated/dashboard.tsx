import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { AppShell } from "@/components/site/app-shell";
import { Mark } from "@/components/site/mark";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/profile.functions";
import { getMySupplyGraph, listMySuppliers } from "@/lib/suppliers.functions";
import { listInventory } from "@/lib/inventory.functions";
import { syncAlerts } from "@/lib/alerts.functions";
import { platformStats } from "@/lib/admin.functions";
import { listAllProfiles } from "@/lib/profile.functions";
import { generateSignals, severityColor, severityLabel } from "@/lib/risk-signals";
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
const inventoryQuery = queryOptions({
  queryKey: ["inventory", "mine"],
  queryFn: () => listInventory(),
});
const adminStatsQuery = queryOptions({
  queryKey: ["admin", "stats"],
  queryFn: () => platformStats(),
});
const adminProfilesQuery = queryOptions({
  queryKey: ["admin", "profiles"],
  queryFn: () => listAllProfiles(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Global-Chain" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me.isAdmin) {
      await Promise.all([
        context.queryClient.ensureQueryData(adminStatsQuery).catch(() => null),
        context.queryClient.ensureQueryData(adminProfilesQuery).catch(() => []),
      ]);
    } else if (me.profile?.is_approved) {
      await Promise.all([
        context.queryClient.ensureQueryData(suppliersQuery).catch(() => []),
        context.queryClient.ensureQueryData(graphQuery).catch(() => []),
        context.queryClient.ensureQueryData(inventoryQuery).catch(() => []),
      ]);
    }
    return null;
  },
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(meQuery);
  const router = useRouter();
  const { profile, isAdmin } = data;

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }

  if (!profile) return <Empty onSignOut={signOut} />;
  if (!profile.is_approved && !isAdmin) {
    return <PendingApproval profile={profile} onSignOut={signOut} />;
  }

  return (
    <AppShell isAdmin={isAdmin} email={profile.work_email}>
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        {isAdmin ? <AdminDashboard /> : <UserDashboard profile={profile} />}
      </div>
    </AppShell>
  );
}

/* ─────────────────────────── USER ─────────────────────────── */

function UserDashboard({
  profile,
}: {
  profile: { legal_name: string; work_email: string; full_name: string };
}) {
  const qc = useQueryClient();
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const { data: graph } = useSuspenseQuery(graphQuery);
  const { data: inventory } = useSuspenseQuery(inventoryQuery);

  // Auto-sync live risk on mount
  const syncedRef = useRef(false);
  const syncMut = useMutation({
    mutationFn: () => syncAlerts(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    syncMut.mutate();
  }, [syncMut]);

  // Signals across visible (tier-1) + hidden (tier-2) org exposure
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

  // Risk score 0-100. Tier-weighted: tier-1 full, tier-2 half, tier-3+ quarter.
  // Longer the tier chain, the smaller its contribution — as required.
  const risk = useMemo(() => {
    const sevWeight = { low: 5, medium: 12, high: 22, critical: 35 } as const;
    const tierWeight = (t: number) => (t <= 1 ? 1 : t === 2 ? 0.5 : 0.25);

    // Map orgId → deepest tier it appears at from this operator's POV.
    const orgTier = new Map<string, number>();
    suppliers.forEach((s) => {
      if (s.organizations) orgTier.set(s.organizations.id, 1);
    });
    graph.forEach((g) => {
      const cur = orgTier.get(g.supplier_org_id);
      if (cur === undefined || g.tier < cur) orgTier.set(g.supplier_org_id, g.tier);
    });

    let raw = 0;
    signals.forEach((s) => {
      s.affectsOrgIds.forEach((id) => {
        const t = orgTier.get(id);
        if (t === undefined) return;
        raw += sevWeight[s.severity] * tierWeight(t);
      });
    });

    const critical = suppliers.filter((s) => s.criticality === "critical").length;
    raw += critical * 4;

    const score = Math.max(0, Math.min(100, Math.round(100 - raw)));
    const band =
      score >= 80 ? "Stable" : score >= 60 ? "Watch" : score >= 40 ? "Elevated" : "Critical";
    return { score, band };
  }, [signals, suppliers, graph]);

  // SKU analytics
  const skuStats = useMemo(() => {
    const total = inventory.length;
    const low = inventory.filter(
      (i) => i.current_stock <= (i.reorder_level ?? 0),
    ).length;
    const units = inventory.reduce((n, i) => n + (i.current_stock ?? 0), 0);
    return { total, low, units };
  }, [inventory]);

  // Top disruption → recommendation seed
  const rec = useMemo(() => {
    const rank = { critical: 3, high: 2, medium: 1, low: 0 } as const;
    const top = [...signals].sort(
      (a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0),
    )[0];
    if (!top) return null;
    const hit = suppliers.find((s) => s.organizations?.country === top.country);
    return {
      country: top.country,
      industry: hit?.organizations?.industry ?? "",
      category: hit?.category ?? "",
      headline: top.headline,
    };
  }, [signals, suppliers]);

  return (
    <>
      <div className="mono-label">§ Operations</div>
      <h1 className="mt-3 font-display text-[36px] font-medium leading-tight tracking-tight">
        Welcome, {profile.full_name || profile.work_email}.
      </h1>
      <p className="mt-3 max-w-2xl text-[14px] text-muted-foreground">
        <span className="text-foreground">{profile.legal_name}</span> — supply &
        demand posture across your declared network. Deeper tiers are analysed
        privately in the background and never revealed.
      </p>

      {/* Risk + SKU headline */}
      <div className="mt-10 grid gap-4 lg:grid-cols-[360px_1fr]">
        <RiskCard score={risk.score} band={risk.band} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard k="Suppliers" v={suppliers.length.toString()} />
          <StatCard
            k="Critical deps"
            v={suppliers.filter((s) => s.criticality === "critical").length.toString()}
          />
          <StatCard k="SKUs tracked" v={skuStats.total.toString()} />
          <StatCard
            k="Low-stock SKUs"
            v={skuStats.low.toString()}
            emphasis={skuStats.low > 0}
          />
        </div>
      </div>

      {/* Disruptions + recommendations */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="mono-label">Active disruptions</div>
            <Link
              to="/signals"
              className="text-[12px] font-medium text-primary hover:underline"
            >
              View feed →
            </Link>
          </div>
          {signals.length === 0 ? (
            <div className="mt-6 rounded-md border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
              No active disruptions on your network.
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {signals.slice(0, 6).map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: severityColor(s.severity) }}
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-[13.5px] font-medium">
                          {s.headline}
                        </span>
                        <span className="mono-label">
                          {severityLabel(s.severity)} · {s.kind}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">
                        {s.country} · {s.hoursAgo}h ago
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-6">
            <div className="mono-label">Quick actions</div>
            <div className="mt-4 flex flex-col gap-2">
              <ActionLink to="/suppliers" label="Manage suppliers" />
              <ActionLink to="/inventory" label="Manage SKUs" />
              <ActionLink to="/uploads" label="Upload data" />
              <ActionLink to="/globe" label="Open network globe" />
            </div>
          </div>

          {rec && (
            <RecommendationsPanel
              title="Recommended alternatives"
              subtitle={`Response to: ${rec.headline}`}
              industry={rec.industry}
              category={rec.category}
              avoidCountry={rec.country}
              limit={4}
            />
          )}
        </div>
      </div>
    </>
  );
}

function RiskCard({ score, band }: { score: number; band: string }) {
  const color =
    score >= 80
      ? "oklch(0.62 0.14 155)"
      : score >= 60
        ? "oklch(0.72 0.14 85)"
        : score >= 40
          ? "oklch(0.68 0.16 55)"
          : "oklch(0.58 0.19 27)";
  const pct = Math.max(4, Math.min(100, score));
  return (
    <div className="rounded-md border border-border bg-card p-6">
      <div className="mono-label">Composite risk score</div>
      <div className="mt-4 flex items-end gap-3">
        <div
          className="font-display text-[56px] font-medium leading-none"
          style={{ color }}
        >
          {score}
        </div>
        <div className="pb-2 text-[13px] text-muted-foreground">/ 100</div>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px]">
        <span className="text-muted-foreground">Status</span>
        <span className="font-medium" style={{ color }}>
          {band}
        </span>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        Weighted by live weather, geopolitics and logistics events touching
        your tier-1 network, with diminishing influence from deeper tiers
        analysed privately in the background.
      </p>
    </div>
  );
}

/* ─────────────────────────── ADMIN ─────────────────────────── */

function AdminDashboard() {
  const { data: stats } = useSuspenseQuery(adminStatsQuery);
  const { data: profiles } = useSuspenseQuery(adminProfilesQuery);

  const pending = profiles.filter((p) => !p.is_approved && !p.reviewed_at).length;
  const approved = profiles.filter((p) => p.is_approved).length;
  const rejected = profiles.filter(
    (p) => !p.is_approved && p.reviewed_at,
  ).length;

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    profiles.forEach((p) => {
      const c = (p.hq_country || "Unknown").trim() || "Unknown";
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [profiles]);

  const recent = [...profiles]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 6);

  const max = Math.max(1, ...byCountry.map(([, n]) => n));

  return (
    <>
      <div className="mono-label">§ Administration</div>
      <h1 className="mt-3 font-display text-[36px] font-medium leading-tight tracking-tight">
        Platform control.
      </h1>
      <p className="mt-3 max-w-2xl text-[14px] text-muted-foreground">
        Manage user access, monitor account health and keep the trust-desk
        queue moving.
      </p>

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard k="Companies" v={String(stats.companies)} />
        <StatCard k="Approved" v={String(approved)} />
        <StatCard k="Pending review" v={String(pending)} emphasis={pending > 0} />
        <StatCard k="Rejected" v={String(rejected)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="mono-label">Recent registrations</div>
            <Link
              to="/admin/requests"
              className="text-[12px] font-medium text-primary hover:underline"
            >
              Review queue →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="mt-6 rounded-md border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
              No registrations yet.
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {recent.map((p) => {
                const status = p.is_approved
                  ? "Approved"
                  : p.reviewed_at
                    ? "Rejected"
                    : "Pending";
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between py-3 text-[13px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {p.legal_name || "—"}
                      </div>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {p.work_email} · {p.hq_country || "—"}
                      </div>
                    </div>
                    <span className="mono-label shrink-0">{status}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-6">
            <div className="mono-label">Quick actions</div>
            <div className="mt-4 flex flex-col gap-2">
              <ActionLink to="/admin/requests" label="Approval queue" />
              <ActionLink to="/admin/companies" label="Manage companies" />
              <ActionLink to="/admin/audit" label="Audit log" />
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-6">
            <div className="mono-label">Top countries</div>
            {byCountry.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">
                No data yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {byCountry.map(([c, n]) => (
                  <li key={c} className="text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{c}</span>
                      <span className="mono-label">{n}</span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(n / max) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── shared ─────────────────────────── */

function ActionLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-[13px] font-medium hover:bg-surface"
    >
      <span>{label}</span>
      <span className="text-muted-foreground">→</span>
    </Link>
  );
}

function StatCard({
  k,
  v,
  emphasis,
}: {
  k: string;
  v: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-5 ${
        emphasis ? "border-primary/40 bg-accent" : "border-border bg-card"
      }`}
    >
      <div className="mono-label">{k}</div>
      <div className="mt-2 font-display text-[28px] font-medium">{v}</div>
    </div>
  );
}

function PendingApproval({
  profile,
  onSignOut,
}: {
  profile: { legal_name: string; work_email: string; full_name: string };
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-6">
          <Link to="/">
            <Mark />
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-xl px-6 py-24">
        <div className="mono-label !text-primary">§ Under review</div>
        <h1 className="mt-3 font-display text-[32px] font-medium leading-[1.1] tracking-tight">
          Your access request is in the trust-desk queue.
        </h1>
        <p className="mt-4 text-[14px] text-muted-foreground">
          Hello {profile.full_name || profile.work_email}. Once{" "}
          <span className="text-foreground">{profile.legal_name}</span> is
          reviewed and approved, this screen will unlock into your operator
          dashboard. Typical response time is under 48 hours.
        </p>
        <div className="mt-10 grid grid-cols-3 gap-3">
          {[
            ["Status", "Awaiting review"],
            ["Contact", profile.work_email],
            ["Est. response", "≤ 48h"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border border-border p-3">
              <div className="mono-label">{k}</div>
              <div className="mt-1 text-[13px] font-medium">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Empty({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="text-muted-foreground">Profile not found.</p>
      <button
        onClick={onSignOut}
        className="mt-4 rounded-md border border-border px-3 py-1.5 text-[13px]"
      >
        Sign out
      </button>
    </div>
  );
}
