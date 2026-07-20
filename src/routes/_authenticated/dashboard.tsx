import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { Mark } from "@/components/site/mark";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, listAllProfiles, decideProfile } from "@/lib/profile.functions";
import { getMySupplyGraph, listMySuppliers } from "@/lib/suppliers.functions";
import { listInventory } from "@/lib/inventory.functions";
import { listFactories } from "@/lib/factories.functions";
import { syncAlerts } from "@/lib/alerts.functions";
import { platformStats, setCompanyStatus } from "@/lib/admin.functions";
import {
  adminListUsers,
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminSetPassword,
} from "@/lib/admin-users.functions";
import { PASSWORD_RULE, validatePassword } from "@/lib/password";

import {
  generateSignals,
  severityColor,
  severityLabel,
} from "@/lib/risk-signals";
import { RecommendationsPanel } from "@/components/site/recommendations-panel";

/* ─────────────────────── Query definitions ─────────────────────── */

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
const factoriesQuery = queryOptions({
  queryKey: ["factories", "mine"],
  queryFn: () => listFactories(),
});
const adminStatsQuery = queryOptions({
  queryKey: ["admin", "stats"],
  queryFn: () => platformStats(),
});
const adminProfilesQuery = queryOptions({
  queryKey: ["admin", "profiles"],
  queryFn: () => listAllProfiles(),
});
const adminUsersQuery = queryOptions({
  queryKey: ["admin", "users"],
  queryFn: () => adminListUsers(),
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
        context.queryClient.ensureQueryData(adminUsersQuery).catch(() => []),
      ]);

    } else if (me.profile?.is_approved) {
      await Promise.all([
        context.queryClient.ensureQueryData(suppliersQuery).catch(() => []),
        context.queryClient.ensureQueryData(graphQuery).catch(() => []),
        context.queryClient.ensureQueryData(inventoryQuery).catch(() => []),
        context.queryClient.ensureQueryData(factoriesQuery).catch(() => []),
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
      {isAdmin ? <AdminDashboard /> : <UserDashboard profile={profile} />}
    </AppShell>
  );
}

/* ═══════════════════════════ USER DASHBOARD ═══════════════════════════ */

type UserTab = "overview" | "risk" | "inventory" | "network";

function UserDashboard({
  profile,
}: {
  profile: { legal_name: string; work_email: string; full_name: string };
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<UserTab>("overview");

  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const { data: graph } = useSuspenseQuery(graphQuery);
  const { data: inventory } = useSuspenseQuery(inventoryQuery);
  const { data: factories } = useSuspenseQuery(factoriesQuery);

  // Auto-sync live risk on mount (once)
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

  const risk = useMemo(() => {
    const sevWeight = { low: 5, medium: 12, high: 22, critical: 35 } as const;
    const tierWeight = (t: number) => (t <= 1 ? 1 : t === 2 ? 0.5 : 0.25);

    const orgTier = new Map<string, number>();
    suppliers.forEach((s) => {
      if (s.organizations) orgTier.set(s.organizations.id, 1);
    });
    graph.forEach((g) => {
      const cur = orgTier.get(g.supplier_org_id);
      if (cur === undefined || g.tier < cur)
        orgTier.set(g.supplier_org_id, g.tier);
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
      score >= 80
        ? "Stable"
        : score >= 60
          ? "Watch"
          : score >= 40
            ? "Elevated"
            : "Critical";
    return { score, band };
  }, [signals, suppliers, graph]);

  const skuStats = useMemo(() => {
    const total = inventory.length;
    const low = inventory.filter(
      (i) => i.current_stock <= (i.reorder_level ?? 0),
    ).length;
    const units = inventory.reduce((n, i) => n + (i.current_stock ?? 0), 0);
    return { total, low, units };
  }, [inventory]);

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

  const tier2 = graph.filter((g) => g.tier === 2).length;

  const USER_TABS: { id: UserTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "risk", label: "Risk & signals" },
    { id: "inventory", label: "Inventory" },
    { id: "network", label: "Network" },
  ];

  return (
    <>
      {/* Hero band */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1240px] px-6 pb-8 pt-10">
          <div className="mono-label">§ Operations</div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="font-display text-[34px] font-medium leading-tight tracking-tight">
                {profile.legal_name || "Your company"}
              </h1>
              <p className="mt-2 text-[13.5px] text-muted-foreground">
                Signed in as{" "}
                <span className="text-foreground">
                  {profile.full_name || profile.work_email}
                </span>
                . Deeper tiers are analysed privately and never revealed.
              </p>
            </div>
            <div className="flex items-center gap-6">
              <MiniStat label="Tier-1" value={String(suppliers.length)} />
              <MiniStat label="Tier-2" value={String(tier2)} />
              <MiniStat label="SKUs" value={String(skuStats.total)} />
              <MiniStat
                label="Low stock"
                value={String(skuStats.low)}
                emphasis={skuStats.low > 0}
              />
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[1240px] px-6">
          <TabBar
            tabs={USER_TABS}
            active={tab}
            onChange={(v) => setTab(v as UserTab)}
          />
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-6 py-10">
        {tab === "overview" && (
          <UserOverview
            risk={risk}
            suppliers={suppliers}
            skuStats={skuStats}
            factories={factories}
            signals={signals}
            rec={rec}
          />
        )}
        {tab === "risk" && (
          <UserRisk risk={risk} signals={signals} rec={rec} />
        )}
        {tab === "inventory" && (
          <UserInventory inventory={inventory} skuStats={skuStats} />
        )}
        {tab === "network" && (
          <UserNetwork suppliers={suppliers} graph={graph} />
        )}
      </div>
    </>
  );
}

/* ── User tab: Overview ── */

function UserOverview({
  risk,
  suppliers,
  skuStats,
  factories,
  signals,
  rec,
}: {
  risk: { score: number; band: string };
  suppliers: any[];
  skuStats: { total: number; low: number; units: number };
  factories: any[];
  signals: ReturnType<typeof generateSignals>;
  rec: {
    country: string;
    industry: string;
    category: string;
    headline: string;
  } | null;
}) {
  const critical = suppliers.filter((s) => s.criticality === "critical").length;
  const highSev = signals.filter(
    (s) => s.severity === "high" || s.severity === "critical",
  ).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <RiskCard score={risk.score} band={risk.band} />

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard k="Suppliers" v={String(suppliers.length)} />
          <StatCard k="Critical deps" v={String(critical)} />
          <StatCard k="Factories" v={String(factories.length)} />
          <StatCard
            k="High-sev alerts"
            v={String(highSev)}
            emphasis={highSev > 0}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ActionCard
            title="Upload centre"
            body="Bring in suppliers, factories and SKUs from Excel."
            to="/uploads"
          />
          <ActionCard
            title="Network globe"
            body="See your live 3D exposure map."
            to="/globe"
          />
          <ActionCard
            title="Simulation"
            body="Model what-if disruptions before they happen."
            to="/simulation"
          />
          <ActionCard
            title="AI assistant"
            body="Ask questions about your posture."
            to="/assistant"
          />
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
  );
}

/* ── User tab: Risk ── */

function UserRisk({
  risk,
  signals,
  rec,
}: {
  risk: { score: number; band: string };
  signals: ReturnType<typeof generateSignals>;
  rec: {
    country: string;
    industry: string;
    category: string;
    headline: string;
  } | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <RiskCard score={risk.score} band={risk.band} />

      <div className="rounded-md border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="mono-label">Active disruptions</div>
          <Link
            to="/signals"
            className="text-[12px] font-medium text-primary hover:underline"
          >
            Full feed →
          </Link>
        </div>
        {signals.length === 0 ? (
          <div className="mt-6 rounded-md border border-dashed border-border p-10 text-center text-[13px] text-muted-foreground">
            No active disruptions on your network.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {signals.slice(0, 10).map((s) => (
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

      {rec && (
        <div className="lg:col-span-2">
          <RecommendationsPanel
            title="Recommended alternatives"
            subtitle={`Response to: ${rec.headline}`}
            industry={rec.industry}
            category={rec.category}
            avoidCountry={rec.country}
            limit={6}
          />
        </div>
      )}
    </div>
  );
}

/* ── User tab: Inventory ── */

function UserInventory({
  inventory,
  skuStats,
}: {
  inventory: any[];
  skuStats: { total: number; low: number; units: number };
}) {
  const low = inventory.filter(
    (i) => i.current_stock <= (i.reorder_level ?? 0),
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard k="SKUs" v={String(skuStats.total)} />
        <StatCard k="Units on hand" v={skuStats.units.toLocaleString()} />
        <StatCard
          k="Low stock"
          v={String(skuStats.low)}
          emphasis={skuStats.low > 0}
        />
        <StatCard
          k="Healthy"
          v={String(skuStats.total - skuStats.low)}
        />
      </div>

      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="mono-label">Low-stock SKUs</div>
          <Link
            to="/inventory"
            className="text-[12px] font-medium text-primary hover:underline"
          >
            Manage inventory →
          </Link>
        </div>
        {low.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted-foreground">
            All SKUs are above their reorder level.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">SKU</th>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 text-right font-medium">On hand</th>
                <th className="px-6 py-3 text-right font-medium">Reorder</th>
              </tr>
            </thead>
            <tbody>
              {low.slice(0, 12).map((i) => (
                <tr key={i.id} className="border-b border-border">
                  <td className="px-6 py-3 font-mono text-[12px]">{i.sku}</td>
                  <td className="px-6 py-3">{i.name}</td>
                  <td className="px-6 py-3 text-right font-medium text-destructive">
                    {i.current_stock}
                  </td>
                  <td className="px-6 py-3 text-right text-muted-foreground">
                    {i.reorder_level ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── User tab: Network ── */

function UserNetwork({
  suppliers,
  graph,
}: {
  suppliers: any[];
  graph: any[];
}) {
  const tier2 = graph.filter((g) => g.tier === 2);
  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    suppliers.forEach((s) => {
      const c = s.organizations?.country || "Unknown";
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [suppliers]);
  const max = Math.max(1, ...byCountry.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard k="Tier-1 declared" v={String(suppliers.length)} />
        <StatCard k="Tier-2 hidden" v={String(tier2.length)} />
        <StatCard
          k="Countries covered"
          v={String(new Set(suppliers.map((s) => s.organizations?.country)).size)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="mono-label">Your declared suppliers</div>
            <Link
              to="/suppliers"
              className="text-[12px] font-medium text-primary hover:underline"
            >
              Manage →
            </Link>
          </div>
          {suppliers.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-muted-foreground">
              No suppliers yet. Head to Uploads to import your Excel sheet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {suppliers.slice(0, 10).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between px-6 py-3 text-[13px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {s.organizations?.display_name || "—"}
                    </div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {s.organizations?.country || "—"} ·{" "}
                      {s.category || "uncategorised"}
                    </div>
                  </div>
                  <span className="mono-label shrink-0">
                    {s.criticality || "standard"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <div className="mono-label">Concentration by country</div>
          {byCountry.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted-foreground">No data.</p>
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
  );
}

/* ═══════════════════════════ ADMIN DASHBOARD ═══════════════════════════ */

type AdminTab = "overview" | "approvals" | "companies" | "activity";

function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const { data: stats } = useSuspenseQuery(adminStatsQuery);
  const { data: profiles } = useSuspenseQuery(adminProfilesQuery);

  const pending = profiles.filter((p) => !p.is_approved && !p.reviewed_at).length;
  const approved = profiles.filter((p) => p.is_approved).length;
  const rejected = profiles.filter((p) => !p.is_approved && p.reviewed_at).length;

  const ADMIN_TABS: { id: AdminTab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "approvals", label: "Approvals", badge: pending || undefined },
    { id: "companies", label: "Companies" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1240px] px-6 pb-8 pt-10">
          <div className="mono-label !text-primary">§ Administration</div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-display text-[34px] font-medium leading-tight tracking-tight">
                Platform control
              </h1>
              <p className="mt-2 text-[13.5px] text-muted-foreground">
                Vet access, manage companies and audit every privileged action
                on Global-Chain.
              </p>
            </div>
            <div className="flex items-center gap-6">
              <MiniStat label="Companies" value={String(stats.companies)} />
              <MiniStat label="Approved" value={String(approved)} />
              <MiniStat
                label="Pending"
                value={String(pending)}
                emphasis={pending > 0}
              />
              <MiniStat label="Suppliers" value={String(stats.suppliers)} />
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[1240px] px-6">
          <TabBar
            tabs={ADMIN_TABS}
            active={tab}
            onChange={(v) => setTab(v as AdminTab)}
          />
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-6 py-10">
        {tab === "overview" && (
          <AdminOverview
            stats={stats}
            profiles={profiles}
            pending={pending}
            approved={approved}
            rejected={rejected}
          />
        )}
        {tab === "approvals" && <AdminApprovals profiles={profiles} />}
        {tab === "companies" && <AdminCompanies profiles={profiles} />}
        {tab === "activity" && <AdminActivity profiles={profiles} />}
      </div>
    </>
  );
}

/* ── Admin tab: Overview ── */

function AdminOverview({
  stats,
  profiles,
  pending,
  approved,
  rejected,
}: {
  stats: { companies: number; approved: number; suppliers: number; alerts: number };
  profiles: any[];
  pending: number;
  approved: number;
  rejected: number;
}) {
  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    profiles.forEach((p) => {
      const c = (p.hq_country || "Unknown").trim() || "Unknown";
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [profiles]);
  const max = Math.max(1, ...byCountry.map(([, n]) => n));

  const recent = [...profiles]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard k="Companies" v={String(stats.companies)} />
        <StatCard k="Approved" v={String(approved)} />
        <StatCard k="Pending" v={String(pending)} emphasis={pending > 0} />
        <StatCard k="Rejected" v={String(rejected)} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard k="Suppliers indexed" v={String(stats.suppliers)} />
        <StatCard k="Alerts routed" v={String(stats.alerts)} />
        <StatCard
          k="Approval rate"
          v={
            stats.companies
              ? `${Math.round((approved / stats.companies) * 100)}%`
              : "—"
          }
        />
        <StatCard
          k="Queue age"
          v={pending > 0 ? "Live" : "Clear"}
          emphasis={pending > 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="mono-label">Recent registrations</div>
          </div>

          {recent.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-muted-foreground">
              No registrations yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((p) => {
                const status = p.is_approved
                  ? "Approved"
                  : p.reviewed_at
                    ? "Rejected"
                    : "Pending";
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between px-6 py-3 text-[13px]"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {p.legal_name || "—"}
                      </div>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {p.work_email} · {p.hq_country || "—"}
                      </div>
                    </div>
                    <StatusPill status={status} />
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
              <ActionLink to="/analytics" label="Platform analytics" />
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
    </div>
  );
}

/* ── Admin tab: Approvals ── */

function AdminApprovals({ profiles }: { profiles: any[] }) {
  const queue = profiles.filter((p) => !p.is_approved && !p.reviewed_at);
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <div className="mono-label">Awaiting review</div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            {queue.length} companies queued for the trust desk.
          </div>
        </div>
      </div>



      {queue.length === 0 ? (
        <div className="p-10 text-center text-[13px] text-muted-foreground">
          Queue is clear. New registrations will appear here.
        </div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-6 py-3 font-medium">Company</th>
              <th className="px-6 py-3 font-medium">Contact</th>
              <th className="px-6 py-3 font-medium">Country</th>
              <th className="px-6 py-3 font-medium">Industry</th>
              <th className="px-6 py-3 font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {queue.slice(0, 20).map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="px-6 py-3 font-medium">{p.legal_name || "—"}</td>
                <td className="px-6 py-3 text-muted-foreground">
                  {p.work_email}
                </td>
                <td className="px-6 py-3 text-muted-foreground">
                  {p.hq_country || "—"}
                </td>
                <td className="px-6 py-3 text-muted-foreground">
                  {p.industry || "—"}
                </td>
                <td className="px-6 py-3 text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Admin tab: Companies ── */

function AdminCompanies({ profiles }: { profiles: any[] }) {
  const approved = profiles.filter((p) => p.is_approved);
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <div className="mono-label">Active companies</div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            {approved.length} approved companies on Global-Chain.
          </div>
        </div>
      </div>



      {approved.length === 0 ? (
        <div className="p-10 text-center text-[13px] text-muted-foreground">
          No approved companies yet.
        </div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-6 py-3 font-medium">Company</th>
              <th className="px-6 py-3 font-medium">Country</th>
              <th className="px-6 py-3 font-medium">Industry</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {approved.slice(0, 20).map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="px-6 py-3">
                  <div className="font-medium">{p.legal_name || "—"}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {p.work_email}
                  </div>
                </td>
                <td className="px-6 py-3 text-muted-foreground">
                  {p.hq_country || "—"}
                </td>
                <td className="px-6 py-3 text-muted-foreground">
                  {p.industry || "—"}
                </td>
                <td className="px-6 py-3">
                  <StatusPill status={p.status === "suspended" ? "Suspended" : "Active"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Admin tab: Activity ── */

function AdminActivity({ profiles }: { profiles: any[] }) {
  const recent = [...profiles]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 15);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="mono-label">Latest registrations</div>
        </div>

        <ul className="divide-y divide-border">
          {recent.map((p) => {
            const status = p.is_approved
              ? "Approved"
              : p.reviewed_at
                ? "Rejected"
                : "Pending";
            return (
              <li
                key={p.id}
                className="flex items-center justify-between px-6 py-3 text-[13px]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {p.legal_name || "—"}
                  </div>
                  <div className="truncate text-[12px] text-muted-foreground">
                    {new Date(p.created_at).toLocaleString()} · {p.work_email}
                  </div>
                </div>
                <StatusPill status={status} />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-md border border-border bg-card p-6">
        <div className="mono-label">Health</div>
        <ul className="mt-4 space-y-3 text-[13px]">
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">Auth service</span>
            <StatusPill status="Active" />
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">Signal ingestion</span>
            <StatusPill status="Active" />
          </li>
          <li className="flex items-center justify-between">
            <span className="text-muted-foreground">Graph resolver</span>
            <StatusPill status="Active" />
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Shared UI ═══════════════════════════ */

function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function MiniStat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="mono-label">{label}</div>
      <div
        className={`mt-1 font-display text-[22px] font-medium leading-none ${
          emphasis ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
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
      <div className="mt-2 font-display text-[26px] font-medium">{v}</div>
    </div>
  );
}

function ActionCard({
  title,
  body,
  to,
}: {
  title: string;
  body: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col justify-between rounded-md border border-border bg-card p-5 hover:border-border-strong hover:bg-surface"
    >
      <div>
        <div className="text-[14px] font-semibold">{title}</div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">{body}</p>
      </div>
      <div className="mono-label mt-4 !text-primary group-hover:opacity-80">
        Open →
      </div>
    </Link>
  );
}

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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Approved: "border-primary/40 bg-accent text-accent-foreground",
    Active: "border-primary/40 bg-accent text-accent-foreground",
    Pending: "border-border bg-surface text-muted-foreground",
    Rejected: "border-destructive/40 bg-background text-destructive",
    Suspended: "border-destructive/40 bg-background text-destructive",
  };
  const cls = map[status] ?? "border-border bg-surface text-muted-foreground";
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {status}
    </span>
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

/* ─────────────────── Non-approved & fallback states ─────────────────── */

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
