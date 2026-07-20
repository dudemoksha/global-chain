import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { getMySupplyGraph, listMySuppliers } from "@/lib/suppliers.functions";
import { listInventory } from "@/lib/inventory.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const supQuery = queryOptions({ queryKey: ["suppliers", "mine"], queryFn: () => listMySuppliers() });
const graphQuery = queryOptions({ queryKey: ["suppliers", "graph"], queryFn: () => getMySupplyGraph() });
const invQuery = queryOptions({ queryKey: ["inventory"], queryFn: () => listInventory() });

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Global-Chain" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(supQuery).catch(() => []),
      context.queryClient.ensureQueryData(graphQuery).catch(() => []),
      context.queryClient.ensureQueryData(invQuery).catch(() => []),
    ]);
    return null;
  },
  component: AnalyticsPage,
});

const COLORS = ["#0284c7", "#0ea5e9", "#38bdf8", "#7dd3fc", "#94a3b8", "#e11d48"];

function AnalyticsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: suppliers } = useSuspenseQuery(supQuery);
  const { data: graph } = useSuspenseQuery(graphQuery);
  const { data: inventory } = useSuspenseQuery(invQuery);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    suppliers.forEach((s) => {
      const c = s.organizations?.country || "Unknown";
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    return [...m.entries()].map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [suppliers]);

  const byCriticality = useMemo(() => {
    const m = new Map<string, number>();
    suppliers.forEach((s) => m.set(s.criticality, (m.get(s.criticality) ?? 0) + 1));
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [suppliers]);

  const tierMix = useMemo(() => {
    const t1 = suppliers.length;
    const t2 = new Set(graph.filter((g) => g.tier === 2).map((g) => g.supplier_org_id)).size;
    return [{ tier: "Tier-1", count: t1 }, { tier: "Tier-2 (hidden)", count: t2 }];
  }, [suppliers, graph]);

  const stockHealth = useMemo(() => {
    const critical = inventory.filter((r) => r.current_stock < r.safety_stock).length;
    const reorder = inventory.filter((r) => r.current_stock >= r.safety_stock && r.current_stock <= r.reorder_level).length;
    const ok = inventory.length - critical - reorder;
    return [
      { name: "OK", value: Math.max(0, ok) },
      { name: "Reorder", value: reorder },
      { name: "Critical", value: critical },
    ];
  }, [inventory]);

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="mono-label">§ Portfolio analytics</div>
        <h1 className="mt-2 font-display text-[32px] font-medium tracking-tight">Analytics</h1>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <Panel title="Suppliers by country">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byCountry}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="country" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: "hsla(var(--muted), 0.4)" }} />
                <Bar dataKey="count" fill="#0284c7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Criticality mix">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byCriticality} dataKey="value" nameKey="name" outerRadius={90} label>
                  {byCriticality.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Tier exposure">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tierMix} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="tier" tick={{ fontSize: 12 }} width={110} />
                <Tooltip />
                <Bar dataKey="count" fill="#0ea5e9" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Inventory health">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={stockHealth} dataKey="value" nameKey="name" outerRadius={90} label>
                  {stockHealth.map((_, i) => (
                    <Cell key={i} fill={["#22c55e", "#f59e0b", "#e11d48"][i]} />
                  ))}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mono-label">{title}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
