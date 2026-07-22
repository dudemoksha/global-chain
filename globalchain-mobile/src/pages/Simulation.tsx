import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Play, ShieldAlert, CheckCircle, Plus, AlertTriangle, X } from 'lucide-react';

const KINDS = ['geopolitical', 'climate', 'logistics', 'cyber', 'regulatory'];
const SEVERITIES = ['medium', 'high', 'critical'];
const DEFAULT_GLOBAL_COUNTRIES = [
  'Japan',
  'China',
  'Germany',
  'United States',
  'Taiwan',
  'Russia',
  'India',
  'South Korea',
];

export const Simulation: React.FC = () => {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<any[]>([]);
  const [customCountries, setCustomCountries] = useState<string[]>([]);
  const [customCountryInput, setCustomCountryInput] = useState('');
  const [loading, setLoading] = useState(true);

  // Simulation Form States
  const [selCountries, setSelCountries] = useState<string[]>(['Japan', 'China']);
  const [selectedKind, setSelectedKind] = useState('geopolitical');
  const [selectedSeverity, setSelectedSeverity] = useState('high');
  const [simulated, setSimulated] = useState(false);

  // Simulation Results
  const [riskScore, setRiskScore] = useState(0);
  const [affectedNodes, setAffectedNodes] = useState<any[]>([]);
  const [alternateOrgs, setAlternateOrgs] = useState<any[]>([]);

  // Financial Loss & Recovery States
  const [lossEstimate, setLossEstimate] = useState(0);
  const [recoveryTime, setRecoveryTime] = useState(0);
  const [recoveryDateString, setRecoveryDateString] = useState('');

  useEffect(() => {
    if (!user) return;
    const fetchConnections = async () => {
      setLoading(true);
      try {
        // Fetch suppliers (inbound)
        const { data: sups, error: supErr } = await supabase
          .from('suppliers')
          .select(`
            id, category, criticality, product,
            organizations:supplier_org_id ( id, display_name, country, industry )
          `)
          .eq('owner_id', user.id);
        if (supErr) throw supErr;

        // Fetch customers (outbound)
        const { data: custs, error: custErr } = await supabase
          .from('trade_requests')
          .select(`
            id, product, category,
            to_profile:to_user_id ( id, legal_name, hq_country, industry )
          `)
          .eq('from_user_id', user.id)
          .eq('status', 'accepted')
          .eq('direction', 'sell');
        if (custErr) throw custErr;

        const combined: any[] = [];
        
        // Add suppliers
        (sups || []).forEach((s: any) => {
          if (s.organizations) {
            combined.push({
              id: s.id,
              orgId: s.organizations.id,
              name: s.organizations.display_name,
              country: s.organizations.country || '',
              industry: s.organizations.industry || '',
              product: s.product || '',
              category: s.category || '',
              criticality: s.criticality || 'medium',
              type: 'Supplier (Inbound)'
            });
          }
        });

        // Add customers
        (custs || []).forEach((c: any) => {
          if (c.to_profile) {
            combined.push({
              id: c.id,
              orgId: c.to_profile.id,
              name: c.to_profile.legal_name,
              country: c.to_profile.hq_country || '',
              industry: c.to_profile.industry || '',
              product: c.product || '',
              category: c.category || '',
              criticality: 'medium',
              type: 'Customer (Outbound)'
            });
          }
        });

        setNodes(combined);
      } catch (e) {
        console.error('Error fetching connections for simulation:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchConnections();
  }, [user]);

  // Unique list of countries combined with custom countries
  const countries = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      if (n.country) set.add(n.country);
    });
    DEFAULT_GLOBAL_COUNTRIES.forEach(c => set.add(c));
    customCountries.forEach(c => set.add(c));
    return Array.from(set).sort();
  }, [nodes, customCountries]);

  const addCustomCountry = () => {
    const trimmed = customCountryInput.trim();
    if (!trimmed) return;
    if (!customCountries.includes(trimmed)) {
      setCustomCountries(prev => [...prev, trimmed]);
    }
    if (!selCountries.includes(trimmed)) {
      setSelCountries(prev => [...prev, trimmed]);
    }
    setCustomCountryInput('');
  };

  const toggleCountry = (country: string) => {
    setSelCountries(prev => 
      prev.includes(country) 
        ? prev.filter(c => c !== country) 
        : [...prev, country]
    );
  };

  const runSimulation = async () => {
    if (selCountries.length === 0 || !user) return;

    const lowerSelected = selCountries.map(c => c.toLowerCase());

    // Filter nodes in the target countries (supporting common typos like "inida" / "india")
    const affected = nodes.filter((n) => {
      const country = (n.country || '').toLowerCase();
      return lowerSelected.some(sel => 
        country === sel || 
        (sel === 'india' && country === 'inida') || 
        (sel === 'inida' && country === 'india')
      );
    });

    // Calculate simulated risk score (0-100)
    const critWeights: Record<string, number> = { critical: 40, high: 25, medium: 15, low: 5 };
    const sevWeights: Record<string, number> = { critical: 1.5, high: 1.0, medium: 0.6 };

    let score = 10; // baseline
    affected.forEach((n) => {
      const baseWeight = critWeights[n.criticality] || 15;
      const multiplier = sevWeights[selectedSeverity] || 1.0;
      score += baseWeight * multiplier;
    });

    score = Math.min(100, Math.round(score));
    setRiskScore(score);
    setAffectedNodes(affected);

    // Calculate dynamic financial loss & recovery metrics
    let baseLoss = 25000;
    if (affected.length > 0) {
      const hasCritical = affected.some(n => n.criticality === 'critical');
      const hasHigh = affected.some(n => n.criticality === 'high');
      baseLoss = hasCritical ? 85000 : hasHigh ? 50000 : 35000;
    }
    const sevMult = selectedSeverity === 'critical' ? 1.5 : selectedSeverity === 'high' ? 1.0 : 0.6;
    const calculatedLoss = Math.round(baseLoss * sevMult);
    setLossEstimate(calculatedLoss);

    let calculatedRecovery = 30;
    if (selectedKind === 'geopolitical') calculatedRecovery += 30;
    if (selectedKind === 'logistics') calculatedRecovery += 15;
    if (selectedSeverity === 'critical') calculatedRecovery += 30;
    else if (selectedSeverity === 'high') calculatedRecovery += 15;
    setRecoveryTime(calculatedRecovery);

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + calculatedRecovery);
    setRecoveryDateString(targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));

    // Fetch alternative companies outside ALL selected countries
    try {
      const { data: alts } = await supabase
        .from('organizations')
        .select('id, display_name, country, industry');
      
      // Filter out organizations inside any of the selected countries (including typos)
      const filteredAlts = (alts || []).filter(org => {
        const country = (org.country || '').toLowerCase();
        return !lowerSelected.some(sel => 
          country === sel || 
          (sel === 'india' && country === 'inida') || 
          (sel === 'inida' && country === 'india')
        );
      });
      setAlternateOrgs(filteredAlts.slice(0, 3));
    } catch (e) {
      console.error(e);
    }

    setSimulated(true);

    // Write real alerts to Supabase alerts table so both website & app sync!
    const rows: any[] = [];
    const now = new Date().toISOString();

    const headline = `${selectedSeverity.toUpperCase()} risk alert: Simulated ${selectedKind} disruption`;
    
    selCountries.forEach((country) => {
      const detail = `A simulated stress test scenario of severity ${selectedSeverity} has been initiated for region/node ${country}.`;
      const countryAffected = affected.filter(n => (n.country || '').toLowerCase() === country.toLowerCase());

      if (countryAffected.length > 0) {
        countryAffected.forEach((node) => {
          rows.push({
            user_id: user.id,
            signal_key: `sim-mob-${selectedKind}-${node.orgId}-${Date.now()}`,
            kind: selectedKind,
            severity: selectedSeverity,
            country: country,
            headline: `[SIMULATED] ${headline}`,
            detail: `${detail} (Impacts connection: ${node.name} — ${node.type})`,
            supplier_org_id: node.type.includes('Supplier') ? node.orgId : null,
            supplier_name: node.name,
            created_at: now
          });
        });
      } else {
        rows.push({
          user_id: user.id,
          signal_key: `sim-mob-${selectedKind}-${country.toLowerCase()}-${Date.now()}`,
          kind: selectedKind,
          severity: selectedSeverity,
          country: country,
          headline: `[SIMULATED] ${headline}`,
          detail: detail,
          supplier_org_id: null,
          supplier_name: null,
          created_at: now
        });
      }
    });

    if (rows.length > 0) {
      await supabase.from('alerts').upsert(rows, { onConflict: 'user_id,signal_key' });
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[300px]">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-2 text-[12px] text-muted-foreground">Preparing stress test models...</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 animate-rise space-y-6">
      {/* Title */}
      <div>
        <span className="mono-label">§ Stress Testing</span>
        <h2 className="text-xl font-display font-semibold">Risk Simulations</h2>
        <p className="text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
          Model threat shocks to test supply chains. Triggering simulation generates live alerts on both web and mobile channels.
        </p>
      </div>

      <div className="space-y-5">
        {/* Simulation Config Form */}
        <div className="border border-border bg-card rounded-md p-4 space-y-4">
          <h4 className="text-[13.5px] font-medium text-foreground">Configure Threat Scenario</h4>
          
          <div className="space-y-3">
            <div>
              <div className="mono-label mb-1">Target Countries (Multi-select)</div>
              
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 border border-border bg-background rounded-md mb-2">
                {countries.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCountry(c)}
                    className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium capitalize transition-colors ${
                      selCountries.includes(c)
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              
              {/* Add Custom Country Input */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Or enter new country (e.g. India)"
                  value={customCountryInput}
                  onChange={(e) => setCustomCountryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomCountry();
                    }
                  }}
                  className="flex-1 border border-border bg-background rounded px-2.5 py-1 text-[12.5px] outline-none focus:border-foreground"
                />
                <button
                  type="button"
                  onClick={addCustomCountry}
                  className="bg-surface border border-border text-foreground px-3 rounded flex items-center justify-center hover:bg-muted"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mono-label mb-1">Threat Type</div>
                <select
                  value={selectedKind}
                  onChange={(e) => setSelectedKind(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] capitalize outline-none focus:border-foreground"
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mono-label mb-1">Simulated Severity</div>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] capitalize outline-none focus:border-foreground"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={runSimulation}
            disabled={selCountries.length === 0}
            className="w-full bg-foreground text-background py-2.5 rounded text-[13px] font-medium flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-60"
          >
            <Play size={13} fill="currentColor" /> Run Scenario Stress Test
          </button>
        </div>

        {/* Connections List (Suppliers & Customers) */}
        <div className="border border-border bg-card rounded-md p-4">
          <div className="flex justify-between items-baseline border-b border-border pb-2 mb-3">
            <span className="text-[12.5px] font-medium text-foreground">Your Connections</span>
            <span className="mono-label">{nodes.length} nodes</span>
          </div>
          
          {nodes.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No active supplier or customer connections found.</p>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {nodes.map((n) => {
                const isHit = n.country && selCountries.map(c => c.toLowerCase()).includes(n.country.toLowerCase());
                return (
                  <div key={n.id} className={`p-2 rounded text-[12px] flex justify-between items-center ${isHit ? 'bg-destructive/10 border-l-2 border-destructive' : 'bg-surface'}`}>
                    <div>
                      <div className="font-medium text-foreground">{n.name}</div>
                      <div className="text-[10px] text-muted-foreground">{n.type} · {n.country || 'No Location'}</div>
                    </div>
                    {isHit && (
                      <span className="text-[9px] font-mono text-destructive uppercase tracking-wider font-semibold">Impacted</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Simulation Results */}
        {simulated && (
          <div className="border border-border bg-card rounded-md p-4 space-y-4 animate-fade">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h4 className="text-[13.5px] font-medium text-foreground">Stress Test Analysis</h4>
              <button onClick={() => setSimulated(false)} className="text-[11px] text-muted-foreground hover:text-foreground">
                Reset
              </button>
            </div>

            {/* Simulated Risk Score Ring */}
            <div className="flex items-center justify-between bg-surface border border-border rounded-md p-4">
              <div>
                <span className="mono-label block">Simulated Risk Score</span>
                <span className="text-[12.5px] text-muted-foreground mt-0.5">
                  For {selectedKind} event in {selCountries.join(', ')}
                </span>
              </div>
              <div className={`h-16 w-16 rounded-full border-4 flex flex-col items-center justify-center font-display font-semibold text-lg ${
                riskScore >= 70 ? 'border-destructive/30 text-destructive bg-destructive/5' :
                riskScore >= 45 ? 'border-warn/30 text-warn bg-warn/5' :
                'border-primary/20 text-primary bg-primary/5'
              }`}>
                {riskScore}
              </div>
            </div>

            {/* Financial Loss & Recovery Projection Card */}
            {affectedNodes.length > 0 && (
              <div className="border-2 border-amber-500/30 bg-amber-500/5 rounded-md p-4 space-y-3">
                <div className="mono-label !text-amber-700 flex items-center gap-1">
                  <AlertTriangle size={14} /> Financial Loss & Sourcing Disruption
                </div>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-mono">Disruption Lead Time</span>
                    <span className="font-semibold text-foreground">{recoveryTime} Days</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-mono">Estimated Profit Loss</span>
                    <span className="font-semibold text-destructive">${lossEstimate.toLocaleString()} USD</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-mono">Recovery Target Date</span>
                    <span className="font-semibold text-foreground">{recoveryDateString}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-mono">Profit Reset Horizon</span>
                    <span className="font-semibold text-emerald-700">{recoveryTime + 30} Days</span>
                  </div>
                </div>
                
                <div className="text-[11px] text-muted-foreground leading-relaxed pt-2 border-t border-border/20 space-y-2">
                  {affectedNodes.map((node) => {
                    const isInbound = node.type.toLowerCase().includes('supplier');
                    return (
                      <div key={node.id} className="pb-1 border-b border-dashed border-border/20 last:border-0 last:pb-0">
                        {isInbound ? (
                          <p>
                            ⚠️ You procure <strong>{node.product || node.category || 'goods'}</strong> from <strong>{node.name}</strong> in <strong>{node.country}</strong>. Sourcing is simulated to halt. We recommend shifting procurement to candidate companies below to safeguard lines.
                          </p>
                        ) : (
                          <p>
                            ⚠️ You supply <strong>{node.product || node.category || 'goods'}</strong> to <strong>{node.name}</strong> in <strong>{node.country}</strong>. A regional threat here will stall delivery routes and interrupt sales flow. We suggest safety stock or alternate buyers.
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <p className="text-[10px] font-mono text-destructive font-medium pt-1">
                    Estimated daily financial margin impact: <strong>-${Math.round(lossEstimate * 0.05).toLocaleString()} USD / day</strong>
                  </p>
                </div>
              </div>
            )}

            {/* Affected Nodes list */}
            <div className="space-y-2">
              <span className="text-[11px] mono-label">Affected Nodes ({affectedNodes.length})</span>
              {affectedNodes.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">No suppliers or customers affected by this scenario.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {affectedNodes.map((n) => (
                    <div key={n.id} className="border border-border bg-background rounded p-2.5 flex justify-between items-center text-[12.5px]">
                      <div>
                        <div className="font-medium text-foreground">{n.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {n.product || 'General materials'} · {n.category} · {n.type}
                        </div>
                      </div>
                      <span className="text-[9.5px] font-mono border px-1 rounded uppercase border-border text-muted-foreground">
                        {n.criticality}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Sourcing Recommendation & Suggested Companies */}
            <div className="border-2 border-emerald-500/30 bg-emerald-500/5 rounded-md p-4 space-y-3">
              <div className="font-semibold text-[13px] text-primary flex items-center gap-1">
                <CheckCircle size={14} className="text-emerald-600" /> Sourcing Recovery Recommendations
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11.5px]">
                {affectedNodes.length > 0
                  ? `To recover your profit margins, source from candidate companies operating outside of ${selCountries.join(', ')}.`
                  : 'Your active Tier-1 supply and distribution nodes appear insulated from this geographic disruption.'}
              </p>

              {alternateOrgs.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] mono-label text-emerald-700">Alternative Operators Suggested:</span>
                  <div className="space-y-1.5">
                    {alternateOrgs.map((alt) => (
                      <div key={alt.id} className="bg-background border border-emerald-500/20 rounded p-2 flex justify-between items-center text-[12px]">
                        <div>
                          <span className="font-medium text-foreground">{alt.display_name}</span>
                          <span className="text-[10px] text-muted-foreground block">{alt.industry || 'General Industry'} · {alt.country}</span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-600 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">Candidate</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
