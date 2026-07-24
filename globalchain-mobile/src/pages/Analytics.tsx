import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { 
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, 
  PieChart, Pie, Cell, Legend, ResponsiveContainer 
} from 'recharts';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

const COLORS = ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#94a3b8', '#e11d48'];

export const Analytics: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const state = location.state as any || {};
  
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [graph, setGraph] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Recovery Mode State
  const isRecoveryMode = !!state.disruptedProduct;
  const [quantity, setQuantity] = useState<number>(10000);
  const [alternatives, setAlternatives] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [supRes, invRes, graphRes] = await Promise.all([
          supabase.from('suppliers').select('id, category, criticality, organizations:supplier_org_id(country)').eq('owner_id', user.id),
          supabase.from('inventory_items').select('id, warehouse_id, monthly_production').eq('owner_id', user.id),
          supabase.rpc('get_supply_graph', { _user_id: user.id }),
        ]);

        setSuppliers(supRes.data || []);
        setInventory(invRes.data || []);
        setGraph(graphRes.data || []);

        // If in recovery mode, fetch alternatives
        if (state.disruptedProduct) {
          const { data: altData } = await supabase.rpc('search_products_by_name', {
            _query: state.disruptedProduct,
          });
          setAlternatives(altData || []);
        }
      } catch (e) {
        console.error('Error fetching analytics data:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, state.disruptedProduct]);

  const avoidCountriesList = useMemo(
    () => (state.avoidCountries ? state.avoidCountries.split(",").map((c: string) => c.toLowerCase()) : []),
    [state.avoidCountries]
  );

  const recoveryData = useMemo(() => {
    if (!isRecoveryMode) return { baselinePrice: 100, candidates: [] };
    
    const originalSupplierResult = alternatives.find(a => a.org_id === state.disruptedOrgId);
    let baselinePrice = originalSupplierResult?.price ?? 100;
    
    if (!originalSupplierResult) {
      const matchInInventory = inventory.find(i => i.name.toLowerCase() === state.disruptedProduct?.toLowerCase());
      if (matchInInventory && matchInInventory.price) {
        baselinePrice = matchInInventory.price;
      }
    }

    const candidates = alternatives.filter((a) => {
      if (a.org_id === state.disruptedOrgId) return false;
      if (a.country && avoidCountriesList.includes(a.country.toLowerCase())) return false;
      return true;
    });

    return { baselinePrice, candidates };
  }, [alternatives, state.disruptedOrgId, avoidCountriesList, inventory, state.disruptedProduct, isRecoveryMode]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    suppliers.forEach((s) => {
      const c = s.organizations?.country || 'Unknown';
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    return [...m.entries()].map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [suppliers]);

  const byCriticality = useMemo(() => {
    const m = new Map<string, number>();
    suppliers.forEach((s) => m.set(s.criticality, (m.get(s.criticality) ?? 0) + 1));
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [suppliers]);

  const tierMix = useMemo(() => {
    const t1 = suppliers.length;
    const t2 = new Set(graph.filter((g) => g.tier === 2).map((g) => g.supplier_org_id)).size;
    return [{ name: 'Tier-1', value: t1 }, { name: 'Tier-2', value: t2 }];
  }, [suppliers, graph]);

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[300px]">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-2 text-[12px] text-muted-foreground">Compiling analytics charts...</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 animate-rise space-y-6">
      {/* Title */}
      <div>
        <span className="mono-label">§ Portfolio metrics</span>
        <h2 className="text-xl font-display font-semibold">Analytics</h2>
      </div>

      {isRecoveryMode && (
        <div className="border-2 border-amber-500/30 bg-amber-500/5 rounded-md p-4 animate-rise">
          <div className="flex items-center gap-1.5 mono-label !text-amber-700 mb-2">
            <AlertTriangle size={15} /> Disruption Recovery Analysis
          </div>
          <h3 className="text-[15px] font-medium text-foreground mb-1">Alternative Cost: {state.disruptedProduct}</h3>
          <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
            Evaluate the financial impact of shifting supply lines from <strong>{state.disruptedOrgName}</strong>.
          </p>

          <div className="bg-background border border-border p-3 rounded-md mb-4 shadow-sm">
            <label className="text-[11px] font-mono uppercase text-muted-foreground block mb-1">Target Quantity</label>
            <input 
              type="number" 
              value={quantity} 
              onChange={(e) => setQuantity(Number(e.target.value) || 0)} 
              className="w-full bg-surface border border-border px-3 py-2 rounded text-[13px] outline-none focus:border-foreground"
              min="1"
            />
          </div>

          <div className="p-3 border border-border bg-card rounded-md mb-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Original Baseline</div>
            <div className="flex justify-between items-end mt-1">
              <div>
                <span className="text-[14px] font-medium">{state.disruptedOrgName}</span>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">Rs. {recoveryData.baselinePrice} / unit</div>
                <div className="text-[14px] font-semibold text-foreground">Rs. {(recoveryData.baselinePrice * quantity).toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="mono-label mb-2">Available Alternatives</div>
          {recoveryData.candidates.length === 0 ? (
            <div className="p-3 border border-destructive/20 bg-destructive/5 text-destructive font-medium rounded-md text-[12px]">
              No alternative suppliers found for this product outside the disrupted zones.
            </div>
          ) : (
            <div className="space-y-3">
              {recoveryData.candidates.map((alt, idx) => {
                const newTotal = alt.price * quantity;
                const oldTotal = recoveryData.baselinePrice * quantity;
                const variance = newTotal - oldTotal;
                const isLoss = variance > 0;
                
                const suggestedIncreasePerUnit = isLoss ? Math.ceil(variance / quantity) : 0;

                return (
                  <div key={idx} className="p-3 border border-border bg-card rounded-md shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-medium text-[13px] text-foreground">{alt.company_name}</div>
                        <div className="text-[11px] text-muted-foreground">{alt.country}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-[13px] text-foreground">Rs. {alt.price} / unit</div>
                        <div className="text-[11px] text-muted-foreground">Total: Rs. {newTotal.toLocaleString()}</div>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-border flex justify-between items-center">
                      <div>
                        <div className="text-[10px] font-mono uppercase text-muted-foreground">Financial Impact</div>
                        <div className={`text-[12px] font-semibold flex items-center gap-1 ${isLoss ? 'text-destructive' : 'text-emerald-600'}`}>
                          {isLoss ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                          {isLoss ? 'Loss' : 'Profit'}: Rs. {Math.abs(variance).toLocaleString()}
                        </div>
                      </div>
                      {isLoss && (
                        <div className="text-right bg-surface px-2 py-1 rounded border border-border">
                          <div className="text-[9px] text-muted-foreground font-mono">Suggested Price Increase</div>
                          <div className="text-[11.5px] font-medium text-foreground">+ Rs. {suggestedIncreasePerUnit} / unit</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* Suppliers by country */}
        <div className="border border-border bg-card rounded-md p-4 space-y-3">
          <h4 className="text-[13.5px] font-medium text-foreground">Top Countries</h4>
          <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCountry} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="country" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                <Bar dataKey="count" fill="#0284c7" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Criticality mix */}
        <div className="border border-border bg-card rounded-md p-4 space-y-3">
          <h4 className="text-[13.5px] font-medium text-foreground">Criticality Mix</h4>
          <div className="w-full h-52 flex justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCriticality} dataKey="value" nameKey="name" outerRadius={65} label={{ fontSize: 10 }}>
                  {byCriticality.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tier mix */}
        <div className="border border-border bg-card rounded-md p-4 space-y-3">
          <h4 className="text-[13.5px] font-medium text-foreground">N-Tier Node Mix</h4>
          <div className="w-full h-52 flex justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tierMix} dataKey="value" nameKey="name" outerRadius={65} label={{ fontSize: 10 }}>
                  {tierMix.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
