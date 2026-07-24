import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { getMySupplyGraph, listMySuppliers } from "@/lib/suppliers.functions";
import { listInventory } from "@/lib/inventory.functions";
import { supabase } from "@/integrations/supabase/client";
import { Info, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";

const analyticsSearchSchema = z.object({
  disruptedOrgId: z.string().optional(),
  disruptedOrgName: z.string().optional(),
  disruptedProduct: z.string().optional(),
  avoidCountries: z.string().optional(),
});

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const supQuery = queryOptions({ queryKey: ["suppliers", "mine"], queryFn: () => listMySuppliers() });
const graphQuery = queryOptions({ queryKey: ["suppliers", "graph"], queryFn: () => getMySupplyGraph() });
const invQuery = queryOptions({ queryKey: ["inventory"], queryFn: () => listInventory() });

export const Route = createFileRoute("/_authenticated/analytics")({
  validateSearch: analyticsSearchSchema,
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
    const total = inventory.length;
    const noWarehouse = inventory.filter((r) => !r.warehouse_id).length;
    const zeroProduction = inventory.filter((r) => (r.monthly_production ?? 0) === 0).length;
    const ok = Math.max(0, total - noWarehouse - zeroProduction);
    return [
      { name: "OK", value: ok },
      { name: "No warehouse", value: noWarehouse },
      { name: "No production", value: zeroProduction },
    ];
  }, [inventory]);

  const search = Route.useSearch();
  const isRecoveryMode = !!search.disruptedProduct;

  const [quantity, setQuantity] = useState<number>(10000);

  const { data: alternatives } = useQuery({
    queryKey: ["recovery_alternatives", search.disruptedProduct],
    queryFn: async () => {
      if (!search.disruptedProduct) return [];
      const { data, error } = await supabase.rpc("search_products_by_name", {
        _query: search.disruptedProduct,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!search.disruptedProduct,
  });

  const avoidCountriesList = useMemo(
    () => (search.avoidCountries ? search.avoidCountries.split(",").map((c) => c.toLowerCase()) : []),
    [search.avoidCountries]
  );

  const recoveryData = useMemo(() => {
    if (!alternatives) return { baselinePrice: 100, candidates: [] };
    
    // Find the original supplier's price if they exist in the results
    const originalSupplierResult = alternatives.find(a => a.org_id === search.disruptedOrgId);
    // If not found, look up our inventory price, or default to 100
    let baselinePrice = originalSupplierResult?.price ?? 100;
    
    if (!originalSupplierResult) {
      const matchInInventory = inventory.find(i => i.name.toLowerCase() === search.disruptedProduct?.toLowerCase());
      if (matchInInventory && matchInInventory.price) {
        baselinePrice = matchInInventory.price;
      }
    }

    const candidates = alternatives.filter((a) => {
      if (a.org_id === search.disruptedOrgId) return false;
      if (a.country && avoidCountriesList.includes(a.country.toLowerCase())) return false;
      return true;
    });

    return { baselinePrice, candidates };
  }, [alternatives, search.disruptedOrgId, avoidCountriesList, inventory, search.disruptedProduct]);

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="mono-label">§ Portfolio analytics</div>
        <h1 className="mt-2 font-display text-[32px] font-medium tracking-tight">Analytics</h1>

        {isRecoveryMode && (
          <div className="mt-8 mb-4 border-2 border-amber-500/30 bg-amber-500/5 rounded-md p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-2 mono-label !text-amber-700">
                  <AlertTriangle size={16} /> Disruption Recovery Analysis
                </div>
                <h3 className="mt-2 text-xl font-medium">Alternative Cost Comparison: {search.disruptedProduct}</h3>
                <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl">
                  Analyze the financial impact of shifting supply lines from <strong>{search.disruptedOrgName}</strong>. 
                  Adjust the projected quantity to see cost variances and recommended price adjustments.
                </p>
              </div>
              <div className="bg-background border border-border p-3 rounded-md w-64 shadow-sm">
                <label className="text-[11px] font-mono uppercase text-muted-foreground block mb-1">Target Quantity</label>
                <input 
                  type="number" 
                  value={quantity} 
                  onChange={(e) => setQuantity(Number(e.target.value) || 0)} 
                  className="w-full bg-surface border border-border px-3 py-1.5 rounded text-[14px]"
                  min="1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="p-4 border border-border bg-card rounded-md">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">Original Baseline</div>
                <div className="flex justify-between items-end mt-1">
                  <div>
                    <span className="text-lg font-medium">{search.disruptedOrgName}</span>
                    <span className="text-[13px] text-muted-foreground ml-2">(Disrupted)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] text-muted-foreground">Rs. {recoveryData.baselinePrice} / unit</div>
                    <div className="text-lg font-semibold">Cost: Rs. {(recoveryData.baselinePrice * quantity).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="mono-label mt-2 mb-1">Available Alternatives</div>
              {recoveryData.candidates.length === 0 ? (
                <div className="p-4 border border-destructive/20 bg-destructive/5 text-destructive rounded-md text-[13px]">
                  No alternative suppliers found for this product outside the disrupted zones ({avoidCountriesList.join(", ")}).
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {recoveryData.candidates.map((alt, idx) => {
                    const newTotal = alt.price * quantity;
                    const oldTotal = recoveryData.baselinePrice * quantity;
                    const variance = newTotal - oldTotal;
                    const isLoss = variance > 0;
                    
                    const suggestedIncreasePerUnit = isLoss ? Math.ceil(variance / quantity) : 0;

                    return (
                      <div key={idx} className="p-4 border border-border bg-card rounded-md shadow-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{alt.company_name}</div>
                            <div className="text-[11px] text-muted-foreground">{alt.country}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">Rs. {alt.price} / unit</div>
                            <div className="text-[11px] text-muted-foreground">Total: Rs. {newTotal.toLocaleString()}</div>
                          </div>
                        </div>
                        
                        <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
                          <div>
                            <div className="text-[11px] font-mono uppercase text-muted-foreground">Financial Impact</div>
                            <div className={`text-[14px] font-semibold flex items-center gap-1 ${isLoss ? 'text-destructive' : 'text-emerald-600'}`}>
                              {isLoss ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                              {isLoss ? 'Loss of' : 'Profit of'} Rs. {Math.abs(variance).toLocaleString()}
                            </div>
                          </div>
                          {isLoss && (
                            <div className="text-right bg-surface px-2 py-1.5 rounded border border-border">
                              <div className="text-[10px] text-muted-foreground font-mono">Suggested Price Increase</div>
                              <div className="text-[12.5px] font-medium">+ Rs. {suggestedIncreasePerUnit} / end unit</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

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
