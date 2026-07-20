import { createFileRoute, Link } from "@tanstack/react-router";
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
import { syncAlerts } from "@/lib/alerts.functions";
import { generateSignals, severityColor, severityLabel } from "@/lib/risk-signals";
import { RecommendationsPanel } from "@/components/site/recommendations-panel";
import { useRouter } from "@tanstack/react-router";


const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const suppliersQuery = queryOptions({
  queryKey: ["suppliers", "mine"],
  queryFn: () => listMySuppliers(),
});
const graphQuery = queryOptions({
  queryKey: ["suppliers", "graph"],
  queryFn: () => getMySupplyGraph(),
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
    if (me.profile?.is_approved || me.isAdmin) {
      await Promise.all([
        context.queryClient.ensureQueryData(suppliersQuery).catch(() => []),
        context.queryClient.ensureQueryData(graphQuery).catch(() => []),
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
        <div className="mono-label">§ Operations</div>
        <h1 className="mt-3 font-display text-[36px] font-medium leading-tight tracking-tight">
          Welcome, {profile.full_name || profile.work_email}.
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] text-muted-foreground">
          <span className="text-foreground">{profile.legal_name}</span> is active
          on Global-Chain. Declare suppliers to unlock hidden downstream exposure
          and continuous risk monitoring.
        </p>

        <SupplierStats />
        <MainGrid />
      </div>
    </AppShell>
  );
}

function SupplierStats() {
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const { data: graph } = useSuspenseQuery(graphQuery);
  const tier2 = new Set(
    graph.filter((g) => g.tier === 2).map((g) => g.supplier_org_id),
  );
  const critical = suppliers.filter((s) => s.criticality === "critical").length;
  const countries = new Set(
    suppliers.map((s) => s.organizations?.country).filter(Boolean),
  );
  return (
    <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard k="Tier-1 suppliers" v={suppliers.length.toString()} />
      <StatCard
        k="Tier-2 exposure"
        v={tier2.size.toString()}
        emphasis={tier2.size > 0}
      />
      <StatCard k="Critical dependencies" v={critical.toString()} />
      <StatCard k="Countries covered" v={countries.size.toString()} />
    </div>
  );
}

function MainGrid() {
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const { data: graph } = useSuspenseQuery(graphQuery);

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

  // Drive recommendations off the highest-severity signal touching a tier-1 supplier.
  const rec = useMemo(() => {
    const sevRank = { critical: 3, high: 2, medium: 1, low: 0 } as const;
    const top = [...signals].sort(
      (a, b) => (sevRank[b.severity] ?? 0) - (sevRank[a.severity] ?? 0),
    )[0];
    if (!top) return null;
    const impacted = suppliers.find(
      (s) => s.organizations?.country === top.country,
    );
    return {
      country: top.country,
      industry: impacted?.organizations?.industry ?? "",
      category: impacted?.category ?? "",
      headline: top.headline,
    };
  }, [signals, suppliers]);

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="rounded-md border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="mono-label">Priority signals</div>
          <Link to="/signals" className="text-[12px] font-medium text-primary hover:underline">
            View feed →
          </Link>
        </div>
        {signals.length === 0 ? (
          <div className="mt-6 rounded-md border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
            No signals yet. Add suppliers to activate continuous monitoring.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {signals.slice(0, 5).map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex items-start gap-3">
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
                      {s.country} · {s.hoursAgo}h ago · touches {s.affectsOrgIds.length} node{s.affectsOrgIds.length === 1 ? "" : "s"}
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
            <ActionLink to="/globe" label="Open network globe" />
            <ActionLink to="/simulation" label="Run a what-if" />
          </div>
        </div>

        {rec && (
          <RecommendationsPanel
            title="Recommended alternatives"
            subtitle={`Response to top signal: ${rec.headline}`}
            industry={rec.industry}
            category={rec.category}
            avoidCountry={rec.country}
            limit={4}
          />
        )}


        <div className="rounded-md border border-border bg-card p-6">
          <div className="mono-label">Recent additions</div>
          {suppliers.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted-foreground">
              No suppliers declared yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {suppliers.slice(0, 4).map((s) => (
                <li key={s.id} className="flex items-center justify-between text-[13px]">
                  <span className="truncate">{s.organizations?.display_name}</span>
                  <span className="mono-label shrink-0">{s.criticality}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
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
