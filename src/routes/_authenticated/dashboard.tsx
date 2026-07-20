import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import {
  queryOptions,
  useMutation,
  useQuery,
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
import { adminGetUserActivity } from "@/lib/activity.functions";

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

type UserTab = "overview" | "risk" | "selling" | "buying";

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

  /* Backend-only tier map. User perspective:
     tier 1 = direct suppliers, tier 2+ = hidden upstream.
     Deeper tiers decay their contribution to the risk score. */
  const orgTier = useMemo(() => {
    const m = new Map<string, number>();
    suppliers.forEach((s) => {
      if (s.organizations) m.set(s.organizations.id, 1);
    });
    graph.forEach((g) => {
      const cur = m.get(g.supplier_org_id);
      if (cur === undefined || g.tier < cur) m.set(g.supplier_org_id, g.tier);
    });
    return m;
  }, [suppliers, graph]);

  /* Live signals — war conflicts (GDELT), seismic (USGS), weather feeds
     already normalised by generateSignals against every org in the graph. */
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
      .filter((g) => g.tier >= 2)
      .forEach((g) =>
        orgs.push({
          id: g.supplier_org_id,
          name: g.supplier_name,
          country: g.supplier_country,
        }),
      );
    return generateSignals(orgs);
  }, [suppliers, graph]);

  /* Composite risk score — tier-weighted decay so upstream noise never
     dominates. Longer tier → lower contribution. Never surfaced as tiers. */
  const risk = useMemo(() => {
    const sevWeight = { low: 4, medium: 10, high: 20, critical: 32 } as const;
    const tierDecay = (t: number) => Math.pow(0.5, Math.max(0, t - 1));

    let raw = 0;
    signals.forEach((s) => {
      s.affectsOrgIds.forEach((id) => {
        const t = orgTier.get(id);
        if (t === undefined) return;
        raw += sevWeight[s.severity] * tierDecay(t);
      });
    });

    const critical = suppliers.filter((s) => s.criticality === "critical").length;
    raw += critical * 3;

    // Stopped-supply shocks: a halted supplier is an active disruption.
    const stopped = suppliers.filter((s: any) => s.is_stopped).length;
    raw += stopped * 25;

    const score = Math.max(0, Math.min(100, Math.round(100 - raw)));
    const band =
      score >= 80 ? "Stable"
      : score >= 60 ? "Watch"
      : score >= 40 ? "Elevated"
      : "Critical";
    return { score, band };
  }, [signals, suppliers, orgTier]);

  /* Selling (my SKUs) — inventory represents products the user supplies. */
  const selling = useMemo(() => {
    const total = inventory.length;
    const low = inventory.filter((i) => !i.warehouse_id || (i.monthly_production ?? 0) === 0).length;
    const units = inventory.reduce((n, i) => n + (i.monthly_production ?? 0), 0);
    const safety = inventory.reduce((n, i) => n + (i.warehouse_capacity ?? 0), 0);
    return { total, low, units, safety, healthy: total - low };
  }, [inventory]);

  /* Buying (my suppliers) — spend concentration and critical dependencies. */
  const buying = useMemo(() => {
    const spendRank: Record<string, number> = {
      "<$100k": 1, "$100k-1M": 2, "$1M-10M": 3, ">$10M": 4,
    };
    const byCategory = new Map<string, number>();
    const byCountry = new Map<string, number>();
    let spendScore = 0;
    suppliers.forEach((s) => {
      byCategory.set(s.category || "uncategorised",
        (byCategory.get(s.category || "uncategorised") ?? 0) + 1);
      const c = s.organizations?.country || "Unknown";
      byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
      spendScore += spendRank[s.annual_spend_bucket] ?? 0;
    });
    return {
      total: suppliers.length,
      critical: suppliers.filter((s) => s.criticality === "critical").length,
      countries: byCountry.size,
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
      byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]),
      spendScore,
    };
  }, [suppliers]);

  /* Product-aware recommendations — pair the highest-severity live signal
     with the category most exposed to that country, so alternatives are
     matched by product family, not just geography. */
  const recs = useMemo(() => {
    const rank = { critical: 3, high: 2, medium: 1, low: 0 } as const;
    const sorted = [...signals].sort(
      (a, b) => (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0),
    );
    const out: Array<{
      id: string;
      country: string;
      industry: string;
      category: string;
      headline: string;
      severity: string;
    }> = [];
    const seen = new Set<string>();
    for (const s of sorted) {
      const hit = suppliers.find(
        (x) => x.organizations?.country === s.country,
      );
      const key = `${s.country}|${hit?.category ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: s.id,
        country: s.country,
        industry: hit?.organizations?.industry ?? "",
        category: hit?.category ?? "",
        headline: s.headline,
        severity: s.severity,
      });
      if (out.length >= 3) break;
    }
    return out;
  }, [signals, suppliers]);

  const USER_TABS: { id: UserTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "risk", label: "Risk & recommendations" },
    { id: "selling", label: "Selling (my SKUs)" },
    { id: "buying", label: "Buying (my suppliers)" },
  ];

  return (
    <>
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
                . You act as both supplier and consumer — upstream exposure
                is analysed privately and never revealed by name.
              </p>
            </div>
            <div className="flex items-center gap-6">
              <MiniStat label="Risk" value={String(risk.score)} emphasis={risk.score < 60} />
              <MiniStat label="Suppliers" value={String(suppliers.length)} />
              <MiniStat label="My SKUs" value={String(selling.total)} />
              <MiniStat label="Low stock" value={String(selling.low)} emphasis={selling.low > 0} />
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[1240px] px-6">
          <TabBar tabs={USER_TABS} active={tab} onChange={(v) => setTab(v as UserTab)} />
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-6 py-10">
        {tab === "overview" && (
          <UserOverview
            risk={risk}
            selling={selling}
            buying={buying}
            signals={signals}
            recs={recs}
          />
        )}
        {tab === "risk" && (
          <UserRisk risk={risk} signals={signals} recs={recs} />
        )}
        {tab === "selling" && (
          <UserSelling inventory={inventory} selling={selling} />
        )}
        {tab === "buying" && (
          <UserBuying suppliers={suppliers} buying={buying} />
        )}
      </div>
    </>
  );
}

/* ── Overview ── */

function UserOverview({
  risk, selling, buying, signals, recs,
}: {
  risk: { score: number; band: string };
  selling: { total: number; low: number; units: number; healthy: number; safety: number };
  buying: { total: number; critical: number; countries: number };
  signals: ReturnType<typeof generateSignals>;
  recs: Array<{ id: string; country: string; industry: string; category: string; headline: string; severity: string }>;
}) {
  const highSev = signals.filter(
    (s) => s.severity === "high" || s.severity === "critical",
  ).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <RiskCard score={risk.score} band={risk.band} />

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard k="Suppliers" v={String(buying.total)} />
          <StatCard k="Critical deps" v={String(buying.critical)} />
          <StatCard k="My SKUs" v={String(selling.total)} />
          <StatCard k="High-sev alerts" v={String(highSev)} emphasis={highSev > 0} />
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="mono-label">Live disruption feed</div>
            <Link to="/signals" className="text-[12px] font-medium text-primary hover:underline">
              Full feed →
            </Link>
          </div>
          {signals.length === 0 ? (
            <p className="mt-6 text-[13px] text-muted-foreground">
              No active disruptions across your network.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {signals.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-start gap-3 py-3">
                  <span
                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: severityColor(s.severity) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="truncate text-[13.5px] font-medium">{s.headline}</span>
                      <span className="mono-label">
                        {severityLabel(s.severity)} · {s.kind}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                      {s.country} · {s.hoursAgo}h ago
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {recs[0] && (
          <RecommendationsPanel
            title="Suggested alternatives"
            subtitle={`Response to: ${recs[0].headline}`}
            industry={recs[0].industry}
            category={recs[0].category}
            avoidCountry={recs[0].country}
            limit={4}
          />
        )}
      </div>
    </div>
  );
}

/* ── Risk & recommendations ── */

function UserRisk({
  risk, signals, recs,
}: {
  risk: { score: number; band: string };
  signals: ReturnType<typeof generateSignals>;
  recs: Array<{ id: string; country: string; industry: string; category: string; headline: string; severity: string }>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <RiskCard score={risk.score} band={risk.band} />

        <div className="rounded-md border border-border bg-card p-6">
          <div className="mono-label">How this is calculated</div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
            Your composite score blends four live inputs against every
            supplier in your declared network:
          </p>
          <ul className="mt-4 space-y-2 text-[13px]">
            <li className="flex items-baseline gap-3">
              <span className="mono-label w-24">Conflict</span>
              <span>Armed-conflict and geopolitical events (GDELT).</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="mono-label w-24">Weather</span>
              <span>Severe weather and climate events at supplier locations.</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="mono-label w-24">Geopolitics</span>
              <span>Sanctions, trade posture and border activity.</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="mono-label w-24">Chain</span>
              <span>Upstream disruption from suppliers-of-suppliers, decayed by distance.</span>
            </li>
          </ul>
          <p className="mt-4 text-[12px] text-muted-foreground">
            Upstream exposure is analysed privately. You only see your own
            declared suppliers.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="mono-label">Active disruptions</div>
          <Link to="/signals" className="text-[12px] font-medium text-primary hover:underline">
            Full feed →
          </Link>
        </div>
        {signals.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted-foreground">
            No active disruptions on your network.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {signals.slice(0, 12).map((s) => (
              <li key={s.id} className="flex items-start gap-3 px-6 py-3">
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: severityColor(s.severity) }}
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[13.5px] font-medium">{s.headline}</span>
                    <span className="mono-label">
                      {severityLabel(s.severity)} · {s.kind}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    {s.country} · {s.hoursAgo}h ago
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-10 text-center text-[13px] text-muted-foreground">
          No product-level recommendations right now — your chain is quiet.
        </div>
      ) : (
        <div className="space-y-4">
          {recs.map((r) => (
            <RecommendationsPanel
              key={r.id}
              title={`Alternatives for ${r.category || "affected products"}`}
              subtitle={`${severityLabel(r.severity as any)} · ${r.headline}`}
              industry={r.industry}
              category={r.category}
              avoidCountry={r.country}
              limit={5}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Selling (my SKUs) ── */

function UserSelling({
  inventory, selling,
}: {
  inventory: any[];
  selling: { total: number; low: number; units: number; healthy: number; safety: number };
}) {
  const low = inventory.filter(
    (i) => i.current_stock <= (i.reorder_level ?? 0),
  );
  const topSku = [...inventory]
    .sort((a, b) => (b.current_stock ?? 0) - (a.current_stock ?? 0))
    .slice(0, 6);
  const byWarehouse = useMemo(() => {
    const m = new Map<string, number>();
    inventory.forEach((i) => {
      const w = i.warehouse || "Unassigned";
      m.set(w, (m.get(w) ?? 0) + (i.current_stock ?? 0));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [inventory]);
  const max = Math.max(1, ...byWarehouse.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard k="SKUs listed" v={String(selling.total)} />
        <StatCard k="Units on hand" v={selling.units.toLocaleString()} />
        <StatCard k="Healthy" v={String(selling.healthy)} />
        <StatCard k="Low stock" v={String(selling.low)} emphasis={selling.low > 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="mono-label">Low-stock SKUs</div>
            <Link to="/inventory" className="text-[12px] font-medium text-primary hover:underline">
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

        <div className="rounded-md border border-border bg-card p-6">
          <div className="mono-label">Units by warehouse</div>
          {byWarehouse.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted-foreground">No data.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {byWarehouse.map(([w, n]) => (
                <li key={w} className="text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="truncate">{w}</span>
                    <span className="mono-label">{n.toLocaleString()}</span>
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

      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="mono-label">Top-stocked SKUs</div>
        </div>
        {topSku.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted-foreground">
            No SKUs yet. Upload your catalogue from the Upload centre.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">SKU</th>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Warehouse</th>
                <th className="px-6 py-3 text-right font-medium">On hand</th>
                <th className="px-6 py-3 text-right font-medium">Safety</th>
              </tr>
            </thead>
            <tbody>
              {topSku.map((i) => (
                <tr key={i.id} className="border-b border-border">
                  <td className="px-6 py-3 font-mono text-[12px]">{i.sku}</td>
                  <td className="px-6 py-3">{i.name}</td>
                  <td className="px-6 py-3 text-muted-foreground">{i.warehouse || "—"}</td>
                  <td className="px-6 py-3 text-right font-medium">{i.current_stock}</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{i.safety_stock ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Buying (my suppliers) ── */

function UserBuying({
  suppliers, buying,
}: {
  suppliers: any[];
  buying: {
    total: number; critical: number; countries: number; spendScore: number;
    byCategory: Array<[string, number]>;
    byCountry: Array<[string, number]>;
  };
}) {
  const maxCat = Math.max(1, ...buying.byCategory.map(([, n]) => n));
  const maxCty = Math.max(1, ...buying.byCountry.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard k="Suppliers" v={String(buying.total)} />
        <StatCard k="Critical deps" v={String(buying.critical)} emphasis={buying.critical > 0} />
        <StatCard k="Countries" v={String(buying.countries)} />
        <StatCard k="Spend index" v={String(buying.spendScore)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-6">
          <div className="mono-label">Spend by category</div>
          {buying.byCategory.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted-foreground">No data.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {buying.byCategory.slice(0, 8).map(([c, n]) => (
                <li key={c} className="text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="truncate">{c}</span>
                    <span className="mono-label">{n}</span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(n / maxCat) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <div className="mono-label">Concentration by country</div>
          {buying.byCountry.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted-foreground">No data.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {buying.byCountry.slice(0, 8).map(([c, n]) => (
                <li key={c} className="text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="truncate">{c}</span>
                    <span className="mono-label">{n}</span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(n / maxCty) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="mono-label">Your suppliers</div>
          <Link to="/suppliers" className="text-[12px] font-medium text-primary hover:underline">
            Manage →
          </Link>
        </div>
        {suppliers.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-muted-foreground">
            No suppliers yet. Head to the Upload centre to import your Excel sheet.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">Supplier</th>
                <th className="px-6 py-3 font-medium">Country</th>
                <th className="px-6 py-3 font-medium">Category</th>
                <th className="px-6 py-3 font-medium">Spend</th>
                <th className="px-6 py-3 text-right font-medium">Criticality</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.slice(0, 15).map((s) => (
                <tr key={s.id} className="border-b border-border">
                  <td className="px-6 py-3 font-medium">
                    {s.organizations?.display_name || "—"}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {s.organizations?.country || "—"}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {s.category || "uncategorised"}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {s.annual_spend_bucket || "—"}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span className="mono-label">{s.criticality || "standard"}</span>
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

/* ═══════════════════════════ ADMIN DASHBOARD ═══════════════════════════ */

type AdminTab = "overview" | "approvals" | "users" | "activity";

function AdminDashboard() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const { data: stats } = useSuspenseQuery(adminStatsQuery);
  const { data: profiles } = useSuspenseQuery(adminProfilesQuery);
  const { data: users } = useSuspenseQuery(adminUsersQuery);

  const pending = profiles.filter((p) => !p.is_approved && !p.reviewed_at).length;
  const approved = profiles.filter((p) => p.is_approved).length;
  const rejected = profiles.filter((p) => !p.is_approved && p.reviewed_at).length;

  const ADMIN_TABS: { id: AdminTab; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "approvals", label: "Approvals", badge: pending || undefined },
    { id: "users", label: "Users" },
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
                Vet access, manage users and audit every privileged action
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
        {tab === "users" && <AdminUsers users={users} />}
        {tab === "activity" && <AdminActivity profiles={profiles} users={users} />}
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
  const qc = useQueryClient();
  const queue = profiles.filter((p) => !p.is_approved && !p.reviewed_at);
  const decideFn = useServerFn(decideProfile);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function decide(userId: string, decision: "approve" | "reject") {
    setBusyId(userId);
    try {
      const reason =
        decision === "reject"
          ? (window.prompt("Reason for rejection (optional)") ?? "")
          : undefined;
      await decideFn({ data: { userId, decision, reason } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "profiles"] }),
        qc.invalidateQueries({ queryKey: ["admin", "users"] }),
        qc.invalidateQueries({ queryKey: ["admin", "stats"] }),
      ]);
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

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
              <th className="px-6 py-3 font-medium text-right">Decision</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((p) => (
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
                <td className="px-6 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => decide(p.id, "approve")}
                      className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => decide(p.id, "reject")}
                      className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-surface disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Admin tab: Users (full CRUD) ── */

type AdminUserRow = {
  id: string;
  full_name: string | null;
  work_email: string | null;
  legal_name: string | null;
  job_title: string | null;
  hq_country: string | null;
  industry: string | null;
  tier_role: string | null;
  is_approved: boolean;
  status: string | null;
  reviewed_at: string | null;
  created_at: string;
  is_admin: boolean;
};

function AdminUsers({ users }: { users: AdminUserRow[] }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "operator">("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [pwFor, setPwFor] = useState<AdminUserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setStatusFn = useServerFn(setCompanyStatus);
  const deleteFn = useServerFn(adminDeleteUser);
  const updateFn = useServerFn(adminUpdateUser);

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin", "users"] }),
      qc.invalidateQueries({ queryKey: ["admin", "profiles"] }),
      qc.invalidateQueries({ queryKey: ["admin", "stats"] }),
    ]);
  }

  async function toggleStatus(u: AdminUserRow) {
    setBusyId(u.id);
    try {
      const next = u.status === "suspended" ? "active" : "suspended";
      await setStatusFn({ data: { userId: u.id, status: next } });
      await invalidate();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleRole(u: AdminUserRow) {
    setBusyId(u.id);
    try {
      await updateFn({
        data: { userId: u.id, role: u.is_admin ? "operator" : "admin" },
      });
      await invalidate();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(u: AdminUserRow) {
    if (!window.confirm(`Permanently delete ${u.work_email}?`)) return;
    setBusyId(u.id);
    try {
      await deleteFn({ data: { userId: u.id } });
      await invalidate();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const filtered = users.filter((u) => {
    if (roleFilter === "admin" && !u.is_admin) return false;
    if (roleFilter === "operator" && u.is_admin) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      (u.work_email ?? "").toLowerCase().includes(q) ||
      (u.legal_name ?? "").toLowerCase().includes(q) ||
      (u.full_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <div className="mono-label">User management</div>
          <div className="mt-1 text-[13px] text-muted-foreground">
            {users.length} accounts · {users.filter((u) => u.is_admin).length}{" "}
            admin · {users.filter((u) => !u.is_admin).length} users ·{" "}
            {users.filter((u) => u.status === "suspended").length} suspended
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email, company, contact…"
            className="h-9 w-64 rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px] outline-none focus:border-primary"
          >
            <option value="all">All roles</option>
            <option value="admin">Admins</option>
            <option value="operator">Users</option>
          </select>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="h-9 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground"
          >
            + New user
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 text-center text-[13px] text-muted-foreground">
          No users match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-6 py-3 font-medium">Account</th>
                <th className="px-6 py-3 font-medium">Company</th>
                <th className="px-6 py-3 font-medium">Country</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border align-top">
                  <td className="px-6 py-3">
                    <div className="font-medium">{u.full_name || "—"}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {u.work_email}
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div>{u.legal_name || "—"}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {u.industry || "—"}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {u.hq_country || "—"}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`rounded-sm px-2 py-0.5 text-[11px] font-medium ${
                        u.is_admin
                          ? "bg-primary/10 text-primary"
                          : "bg-surface text-foreground"
                      }`}
                    >
                      {u.is_admin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <StatusPill
                      status={
                        !u.is_approved
                          ? u.reviewed_at
                            ? "Rejected"
                            : "Pending"
                          : u.status === "suspended"
                            ? "Suspended"
                            : "Active"
                      }
                    />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1.5">
                      <RowBtn onClick={() => setEditing(u)}>Edit</RowBtn>
                      <RowBtn
                        onClick={() => setPwFor(u)}
                        disabled={busyId === u.id}
                      >
                        Password
                      </RowBtn>
                      <RowBtn
                        onClick={() => toggleRole(u)}
                        disabled={busyId === u.id}
                      >
                        {u.is_admin ? "Revoke admin" : "Make admin"}
                      </RowBtn>
                      <RowBtn
                        onClick={() => toggleStatus(u)}
                        disabled={busyId === u.id}
                      >
                        {u.status === "suspended" ? "Activate" : "Suspend"}
                      </RowBtn>
                      <RowBtn
                        onClick={() => remove(u)}
                        disabled={busyId === u.id}
                        danger
                      >
                        Delete
                      </RowBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <UserFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            await invalidate();
          }}
        />
      )}
      {editing && (
        <UserFormModal
          mode="edit"
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await invalidate();
          }}
        />
      )}
      {pwFor && (
        <PasswordModal
          user={pwFor}
          onClose={() => setPwFor(null)}
          onSaved={() => setPwFor(null)}
        />
      )}
    </div>
  );
}

function RowBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2.5 py-1 text-[12px] font-medium disabled:opacity-40 ${
        danger
          ? "border-destructive/30 text-destructive hover:bg-destructive/5"
          : "border-border text-foreground hover:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4">
      <div className="w-full max-w-lg rounded-md border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-[14px] font-medium">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mono-label mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:border-primary";

function PasswordInput({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <input
        type={reveal ? "text" : "password"}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} pr-14`}
      />
      <button
        type="button"
        onClick={() => setReveal((v) => !v)}
        className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
        tabIndex={-1}
        aria-label={reveal ? "Hide password" : "Show password"}
      >
        {reveal ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function UserFormModal({
  mode,
  user,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  user?: AdminUserRow;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const createFn = useServerFn(adminCreateUser);
  const updateFn = useServerFn(adminUpdateUser);
  const [form, setForm] = useState({
    email: user?.work_email ?? "",
    password: "",
    fullName: user?.full_name ?? "",
    legalName: user?.legal_name ?? "",
    jobTitle: user?.job_title ?? "",
    hqCountry: user?.hq_country ?? "",
    industry: user?.industry ?? "",
    tierRole: user?.tier_role ?? "",
    role: (user?.is_admin ? "admin" : "operator") as "admin" | "operator",
    approve: user?.is_approved ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pwErr = mode === "create" ? validatePassword(form.password) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (mode === "create" && pwErr) {
      setErr(pwErr);
      return;
    }
    setBusy(true);
    try {
      if (mode === "create") {
        await createFn({
          data: {
            email: form.email,
            password: form.password,
            fullName: form.fullName,
            legalName: form.legalName,
            jobTitle: form.jobTitle,
            hqCountry: form.hqCountry,
            industry: form.industry,
            tierRole: form.tierRole,
            role: form.role,
            approve: form.approve,
          },
        });
      } else if (user) {
        await updateFn({
          data: {
            userId: user.id,
            fullName: form.fullName,
            legalName: form.legalName,
            jobTitle: form.jobTitle,
            hqCountry: form.hqCountry,
            industry: form.industry,
            tierRole: form.tierRole,
            role: form.role,
          },
        });
      }
      await onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={mode === "create" ? "New user" : `Edit · ${user?.work_email}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModalField label="Work email">
          <input
            type="email"
            required
            disabled={mode === "edit"}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputCls}
          />
        </ModalField>
        {mode === "create" && (
          <ModalField label="Password">
            <PasswordInput
              required
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
            />
            <p
              className={`mt-1 text-[11px] ${
                pwErr && form.password ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {pwErr && form.password ? pwErr : PASSWORD_RULE}
            </p>
          </ModalField>
        )}
        <ModalField label="Full name">
          <input
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className={inputCls}
          />
        </ModalField>
        <ModalField label="Job title">
          <input
            value={form.jobTitle}
            onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
            className={inputCls}
          />
        </ModalField>
        <ModalField label="Company (legal name)">
          <input
            value={form.legalName}
            onChange={(e) => setForm({ ...form, legalName: e.target.value })}
            className={inputCls}
          />
        </ModalField>
        <ModalField label="HQ country">
          <input
            value={form.hqCountry}
            onChange={(e) => setForm({ ...form, hqCountry: e.target.value })}
            className={inputCls}
          />
        </ModalField>
        <ModalField label="Industry">
          <input
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
            className={inputCls}
          />
        </ModalField>
        <ModalField label="Tier role">
          <input
            value={form.tierRole}
            onChange={(e) => setForm({ ...form, tierRole: e.target.value })}
            className={inputCls}
            placeholder="e.g. buyer, supplier"
          />
        </ModalField>
        <ModalField label="Role">
          <select
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as "admin" | "operator" })
            }
            className={inputCls}
          >
            <option value="operator">User</option>
            <option value="admin">Admin</option>
          </select>
        </ModalField>
        {mode === "create" && (
          <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.approve}
              onChange={(e) =>
                setForm({ ...form, approve: e.target.checked })
              }
            />
            Auto-approve account
          </label>
        )}

        {err && (
          <div className="col-span-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
            {err}
          </div>
        )}

        <div className="col-span-full mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : mode === "create" ? "Create user" : "Save changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function PasswordModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const setPwFn = useServerFn(adminSetPassword);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pwErr = validatePassword(pw);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwErr) {
      setErr(pwErr);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await setPwFn({ data: { userId: user.id, password: pw } });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Reset password · ${user.work_email}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <ModalField label="New password">
          <PasswordInput
            required
            value={pw}
            onChange={(v) => setPw(v)}
          />
          <p
            className={`mt-1 text-[11px] ${
              pwErr && pw ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {pwErr && pw ? pwErr : PASSWORD_RULE}
          </p>
        </ModalField>
        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
            {err}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Set password"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}


function AdminActivity({
  profiles,
  users,
}: {
  profiles: any[];
  users: any[];
}) {
  const [selected, setSelected] = useState<any | null>(null);
  const [query, setQuery] = useState("");

  const recent = [...profiles]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 15);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...users].sort((a, b) =>
      (a.full_name || a.work_email || "").localeCompare(
        b.full_name || b.work_email || "",
      ),
    );
    if (!q) return list;
    return list.filter((u) =>
      `${u.full_name ?? ""} ${u.work_email ?? ""} ${u.legal_name ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [users, query]);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-md border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div className="mono-label">Users · click for activity</div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search user…"
              className="h-8 w-48 rounded-md border border-border bg-background px-2 text-[12.5px] outline-none focus:border-primary"
            />
          </div>
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-muted-foreground">
              No users found.
            </div>
          ) : (
            <ul className="max-h-[540px] divide-y divide-border overflow-y-auto">
              {filteredUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(u)}
                    className="flex w-full items-center justify-between gap-3 px-6 py-3 text-left text-[13px] hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {u.full_name || u.work_email}
                      </div>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {u.work_email} · {u.legal_name || "—"}
                      </div>
                    </div>
                    <span
                      className={`rounded-sm px-2 py-0.5 text-[11px] font-medium ${
                        u.is_admin
                          ? "bg-primary/10 text-primary"
                          : "bg-surface text-foreground"
                      }`}
                    >
                      {u.is_admin ? "Admin" : "User"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6">
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
                        {new Date(p.created_at).toLocaleString()} ·{" "}
                        {p.work_email}
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
      </div>

      {selected && (
        <UserActivityModal
          user={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function UserActivityModal({
  user,
  onClose,
}: {
  user: any;
  onClose: () => void;
}) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "activity", user.id],
    queryFn: () => adminGetUserActivity({ data: { userId: user.id } }),
    refetchInterval: 10000,
  });

  const rows = data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-md border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <div className="mono-label">Activity · live</div>
            <div className="mt-1 truncate font-display text-[18px] font-medium">
              {user.full_name || user.work_email}
            </div>
            <div className="truncate text-[12px] text-muted-foreground">
              {user.work_email} · {user.legal_name || "—"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              className="h-8 rounded-md border border-border px-3 text-[12px] font-medium hover:bg-surface"
            >
              {isFetching ? "…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 rounded-md border border-border px-3 text-[12px] font-medium hover:bg-surface"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-10 text-center text-[13px] text-muted-foreground">
              Loading activity…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-[13px] text-muted-foreground">
              No activity recorded yet for this user.
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-6 py-3 font-medium">When</th>
                  <th className="px-6 py-3 font-medium">Event</th>
                  <th className="px-6 py-3 font-medium">Device</th>
                  <th className="px-6 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const d = new Date(r.created_at);
                  const meta = (r.meta ?? {}) as Record<string, any>;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border align-top"
                    >
                      <td className="px-6 py-3 whitespace-nowrap">
                        <div>{d.toLocaleDateString()}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {d.toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <ActionPill action={r.action} />
                      </td>
                      <td className="px-6 py-3">
                        <div>{meta.device || "—"}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {meta.platform || ""}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-[11.5px] text-muted-foreground">
                        {(() => {
                          const by =
                            meta.by ??
                            (r.action?.startsWith("auth.")
                              ? "self"
                              : r.actor_id && r.target_id && r.actor_id !== r.target_id
                                ? "admin"
                                : "self");
                          return (
                            <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-foreground">
                              By {by === "self" ? "user" : "admin"}
                            </div>
                          );
                        })()}
                        {meta.changes && typeof meta.changes === "object" && (
                          <div className="mb-1 space-y-0.5">
                            {Object.entries(meta.changes as Record<string, { from: string; to: string }>).map(
                              ([field, diff]) => (
                                <div key={field}>
                                  <span className="font-medium text-foreground">
                                    {field.replace(/_/g, " ")}
                                  </span>
                                  : <span className="line-through">{diff.from || "—"}</span>
                                  {" → "}
                                  <span className="text-foreground">{diff.to || "—"}</span>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                        {meta.from && meta.to && !meta.changes && (
                          <div>
                            role: <span className="line-through">{meta.from}</span>
                            {" → "}
                            <span className="text-foreground">{meta.to}</span>
                          </div>
                        )}
                        {meta.reason && <div>Reason: {meta.reason}</div>}
                        {meta.email && !meta.changes && !meta.from && (
                          <div>Email: {meta.email}</div>
                        )}
                        {meta.timezone && <div>TZ: {meta.timezone}</div>}
                        {meta.language && <div>Lang: {meta.language}</div>}
                        {meta.screen && <div>Screen: {meta.screen}</div>}
                        {meta.user_agent && (
                          <div className="mt-1 line-clamp-2 break-all">
                            {meta.user_agent}
                          </div>
                        )}
                        {!meta.timezone &&
                          !meta.user_agent &&
                          !meta.changes &&
                          !meta.from &&
                          !meta.email &&
                          !meta.reason && <div>—</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionPill({ action }: { action: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    "auth.login": { label: "Login", cls: "bg-primary/10 text-primary" },
    "auth.logout": { label: "Logout", cls: "bg-surface text-foreground" },
    "user.create": { label: "User created", cls: "bg-accent text-foreground" },
    "user.delete": { label: "User deleted", cls: "bg-accent text-foreground" },
    "user.profile_update": { label: "Profile updated", cls: "bg-accent text-foreground" },
    "user.password_reset": { label: "Password reset", cls: "bg-accent text-foreground" },
    "user.password_change": { label: "Password changed", cls: "bg-accent text-foreground" },
    "user.role_change": { label: "Role changed", cls: "bg-accent text-foreground" },
    "user.approved": { label: "Approved", cls: "bg-primary/10 text-primary" },
    "user.rejected": { label: "Rejected", cls: "bg-accent text-foreground" },
  };
  const entry = map[action] ?? {
    label: action.replace(/^user\./, "").replace(/^company\./, "").replace(/_/g, " "),
    cls: "bg-accent text-foreground",
  };
  return (
    <span className={`rounded-sm px-2 py-0.5 text-[11px] font-medium ${entry.cls}`}>
      {entry.label}
    </span>
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
