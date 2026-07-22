import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Play, ShieldAlert, CheckCircle, Plus } from 'lucide-react';

const KINDS = ['geopolitical', 'climate', 'logistics', 'cyber', 'regulatory'];
const SEVERITIES = ['medium', 'high', 'critical'];

export const Simulation: React.FC = () => {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<any[]>([]);
  const [customCountries, setCustomCountries] = useState<string[]>([]);
  const [customCountryInput, setCustomCountryInput] = useState('');
  const [loading, setLoading] = useState(true);

  // Simulation Form States
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedKind, setSelectedKind] = useState('geopolitical');
  const [selectedSeverity, setSelectedSeverity] = useState('high');
  const [simulated, setSimulated] = useState(false);

  // Simulation Results
  const [riskScore, setRiskScore] = useState(0);
  const [affectedNodes, setAffectedNodes] = useState<any[]>([]);

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

  // Unique list of node countries combined with custom countries
  const countries = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      if (n.country) set.add(n.country);
    });
    // Add default global countries
    const defaults = ['Japan', 'China', 'Germany', 'United States', 'Taiwan', 'India', 'South Korea'];
    defaults.forEach(c => set.add(c));
    // Add custom countries
    customCountries.forEach(c => set.add(c));
    return Array.from(set).sort();
  }, [nodes, customCountries]);

  // Auto-select first country if none selected
  useEffect(() => {
    if (countries.length > 0 && !selectedCountry) {
      setSelectedCountry(countries[0]);
    }
  }, [countries, selectedCountry]);

  const addCustomCountry = () => {
    const trimmed = customCountryInput.trim();
    if (!trimmed) return;
    if (!customCountries.includes(trimmed)) {
      setCustomCountries(prev => [...prev, trimmed]);
    }
    setSelectedCountry(trimmed);
    setCustomCountryInput('');
  };

  const runSimulation = async () => {
    if (!selectedCountry || !user) return;

    // Filter nodes in the target country
    const affected = nodes.filter(
      (n) => (n.country || '').toLowerCase() === selectedCountry.toLowerCase()
    );

    // Calculate simulated risk score (0-100) based on severity and criticality weights
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
    setSimulated(true);

    // Write real alerts to Supabase alerts table so both website & app sync!
    const rows: any[] = [];
    const now = new Date().toISOString();

    const headline = `${selectedSeverity.toUpperCase()} risk alert: Simulated ${selectedKind} disruption`;
    const detail = `A simulated stress test scenario of severity ${selectedSeverity} has been initiated for region/node ${selectedCountry}.`;

    if (affected.length > 0) {
      affected.forEach((node) => {
        rows.push({
          user_id: user.id,
          signal_key: `sim-mob-${selectedKind}-${node.orgId}-${Date.now()}`,
          kind: selectedKind,
          severity: selectedSeverity,
          country: selectedCountry,
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
        signal_key: `sim-mob-${selectedKind}-generic-${Date.now()}`,
        kind: selectedKind,
        severity: selectedSeverity,
        country: selectedCountry,
        headline: `[SIMULATED] ${headline}`,
        detail: detail,
        supplier_org_id: null,
        supplier_name: null,
        created_at: now
      });
    }

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
              <div className="mono-label mb-1">Target Country</div>
              <div className="flex gap-2">
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="flex-1 border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                >
                  <option value="">Select country...</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              
              {/* Add Custom Country Input */}
              <div className="mt-2 flex gap-1.5">
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
                  className="flex-1 border border-border bg-background rounded px-2.5 py-1 text-[12.5px] outline-none"
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
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] capitalize"
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
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] capitalize"
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
            disabled={!selectedCountry}
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
                const isHit = selectedCountry && n.country.toLowerCase() === selectedCountry.toLowerCase();
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
                  For {selectedKind} event in {selectedCountry}
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

            {/* AI Sourcing Recommendation */}
            <div className="bg-primary/5 border border-primary/20 rounded-md p-3.5 space-y-1.5 text-[12.5px] text-primary">
              <div className="font-semibold flex items-center gap-1">
                <CheckCircle size={14} /> Sourcing Mitigation Plan
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11.5px]">
                {affectedNodes.length > 0
                  ? `We suggest exploring alternative partners outside of ${selectedCountry} for your ${affectedNodes.map(n => n.category || n.product).filter(Boolean).slice(0, 3).join('/')} lines to safeguard operational continuity.`
                  : 'Your active Tier-1 supply and distribution nodes appear insulated from this geographic disruption. Keep standard watchlists active.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
