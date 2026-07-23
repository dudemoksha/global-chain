import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, X, Send, CheckCircle } from 'lucide-react';
import { searchOrganizations } from '../lib/server-fns';

export const Customers: React.FC = () => {
  const { user, profile } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPropose, setShowPropose] = useState(false);

  const fetchCustomers = async () => {
    if (!user || !profile) return;
    if (customers.length === 0) setLoading(true);
    try {
      // Match website logic: find everyone who has declared MY organization as their supplier
      // Step 1: Find my org by normalized legal_name
      const myName = (profile.legal_name || '').trim();
      if (!myName) { setLoading(false); return; }

      const normName = myName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const { data: myOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('name_norm', normName)
        .maybeSingle();

      if (!myOrg) {
        // No org registered yet — try to find customers via trade_requests instead
        setCustomers([]);
        setLoading(false);
        return;
      }

      // Step 2: Find all suppliers rows where supplier_org_id = my org (these are my customers)
      const { data: rows, error } = await supabase
        .from('suppliers')
        .select('id, owner_id, category, criticality, notes, product, created_at')
        .eq('supplier_org_id', myOrg.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!rows?.length) {
        setCustomers([]);
        setLoading(false);
        return;
      }

      // Step 3: Resolve the owner profiles (the buyers = my customers)
      const ownerIds = [...new Set(rows.map(r => r.owner_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, legal_name, hq_country, industry, work_email')
        .in('id', ownerIds);

      const byId = new Map((profiles || []).map(p => [p.id, p]));

      const enriched = rows.map(r => ({
        id: r.id,
        category: r.category,
        criticality: r.criticality,
        notes: r.notes,
        product: r.product,
        created_at: r.created_at,
        customer: byId.get(r.owner_id) || null,
      }));

      setCustomers(enriched);
    } catch (e) {
      console.error('Error fetching customers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !profile) return;
    fetchCustomers();

    const channel = supabase
      .channel(`customers:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, fetchCustomers)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, profile]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(r => {
      const name = r.customer?.legal_name || '';
      const country = r.customer?.hq_country || '';
      const cat = r.category || '';
      return name.toLowerCase().includes(q) || country.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
    });
  }, [customers, search]);

  const stats = useMemo(() => {
    const countries = new Set(customers.map(r => r.customer?.hq_country).filter(Boolean)).size;
    const categories = new Set(customers.map(r => r.category).filter(Boolean)).size;
    return { total: customers.length, countries, categories };
  }, [customers]);

  if (!profile?.is_approved) {
    return (
      <div className="px-4 py-16 text-center">
        <div className="mono-label !text-primary">§ Under review</div>
        <h1 className="mt-3 font-display text-[22px] font-medium">
          Customers unlock once your organisation is approved.
        </h1>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8">
      {/* Header */}
      <div className="pt-6 pb-4 border-b border-border mb-5">
        <div className="mono-label !text-primary">§ Selling</div>
        <h1 className="mt-2 font-display text-[24px] font-medium tracking-tight">
          Customers
        </h1>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          Organisations that buy from you. Every organisation that has declared you as their supplier appears here.
        </p>
        <button
          onClick={() => setShowPropose(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background"
        >
          <Plus size={14} />
          Propose to a customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { k: 'Customers', v: String(stats.total) },
          { k: 'Countries', v: String(stats.countries) },
          { k: 'Categories', v: String(stats.categories) },
        ].map(({ k, v }) => (
          <div key={k} className="rounded-md border border-border bg-card p-3 text-center">
            <div className="mono-label text-[9px]">{k}</div>
            <div className="mt-1 font-display text-[22px] font-medium">{v}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, country or category"
          className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-[13px]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground text-[13px]">
          {customers.length === 0
            ? 'No customers yet — propose to one or wait for an incoming request to be accepted.'
            : 'No customers match your search.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const name = r.customer?.legal_name || '—';
            const country = r.customer?.hq_country || '';
            const industry = r.customer?.industry || '';
            return (
              <div key={r.id} className="rounded-md border border-border bg-card p-4">
                <div className="font-medium text-[14px]">{name}</div>
                <div className="mono-label mt-0.5 text-[10px]">
                  {[country, industry].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
                  {r.category && <span className="rounded-full bg-surface px-2 py-0.5 border border-border">{r.category}</span>}
                  {r.product && <span className="rounded-full bg-surface px-2 py-0.5 border border-border">{r.product}</span>}
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.notes && (
                  <div className="mt-2 text-[12px] text-muted-foreground italic">{r.notes}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Propose Modal */}
      {showPropose && (
        <ProposeModal
          userId={user?.id || ''}
          onClose={() => setShowPropose(false)}
          onSent={() => { setShowPropose(false); fetchCustomers(); }}
        />
      )}
    </div>
  );
};

function ProposeModal({
  userId,
  onClose,
  onSent,
}: {
  userId: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [orgSearch, setOrgSearch] = useState('');
  const [orgResults, setOrgResults] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Load this user's own inventory SKUs
  const [mySkus, setMySkus] = useState<any[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('inventory_items')
          .select('id, name, sku, unit, price')
          .eq('owner_id', userId)
          .order('name');
        setMySkus(data || []);
      } catch (e) {
        console.error('Error loading my SKUs:', e);
      } finally {
        setLoadingSkus(false);
      }
    })();
  }, [userId]);

  const searchOrgs = async (q: string) => {
    if (q.trim().length < 2) { setOrgResults([]); return; }
    try {
      const res = await searchOrganizations({ q: q.trim() });
      const mapped = (res || []).map((o: any) => ({
        id: o.id,
        legal_name: o.display_name,
        hq_country: o.country,
        industry: o.industry
      }));
      setOrgResults(mapped);
    } catch (e) {
      console.error('Error searching organizations:', e);
      setOrgResults([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) { setErr('Select a customer organisation.'); return; }
    if (!product.trim()) { setErr('Select a SKU from your inventory.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const { data: toUserId, error: rpcErr } = await supabase.rpc('get_user_for_org', {
        _org_id: selectedOrg.id
      });
      if (rpcErr) throw rpcErr;
      if (!toUserId) throw new Error("That organisation doesn't have an approved operator.");

      const { error } = await supabase.from('trade_requests').insert({
        from_user_id: userId,
        from_org_id: null,
        to_user_id: toUserId,
        to_org_id: selectedOrg.id,
        direction: 'sell' as const,
        product: product.trim(),
        quantity: quantity.trim(),
        category: category.trim(),
        message: message.trim(),
        status: 'pending',
      });
      if (error) throw error;
      setSent(true);
      setTimeout(onSent, 1200);
    } catch (e: any) {
      setErr(e.message || 'Failed to send proposal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[1px] flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-md border border-border bg-background p-5 space-y-4 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="mono-label">§ Propose to a customer</span>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12">
            <CheckCircle size={36} className="text-primary" />
            <div className="mono-label !text-primary">§ Sent</div>
            <p className="text-center text-[13px] text-muted-foreground">
              Your proposal is on its way. They'll show up here once they accept.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Step 1: Pick from YOUR own inventory SKUs */}
            <div>
              <div className="mono-label mb-1">Your SKU / Product to offer</div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Only your own inventory items — you can only offer what you have.
              </p>
              {loadingSkus ? (
                <div className="border border-border rounded px-3 py-2.5 text-[13px] text-muted-foreground">
                  Loading your inventory…
                </div>
              ) : mySkus.length === 0 ? (
                <div className="border border-destructive/30 bg-destructive/5 rounded px-3 py-2.5 text-[12.5px] text-destructive">
                  No SKUs in your inventory yet. Add items under <strong>My SKUs</strong> first.
                </div>
              ) : (
                <select
                  value={product}
                  onChange={(e) => {
                    const sku = mySkus.find(s => s.name === e.target.value);
                    setProduct(e.target.value);
                    if (sku) setCategory(sku.name);
                  }}
                  required
                  className="w-full border border-border bg-background rounded px-2.5 py-2 text-[13px] outline-none focus:border-foreground"
                >
                  <option value="">— select a SKU to offer —</option>
                  {mySkus.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} ({s.sku}) — {s.unit}{s.price ? ` · Rs.${s.price}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Step 2: Search for target customer org */}
            <div>
              <div className="mono-label mb-1">Target customer organisation</div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Search for the company you want to sell to.
              </p>
              {selectedOrg ? (
                <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-medium">{selectedOrg.legal_name}</div>
                    <div className="text-[11px] text-muted-foreground">{selectedOrg.hq_country} · {selectedOrg.industry}</div>
                  </div>
                  <button type="button" onClick={() => { setSelectedOrg(null); setOrgResults([]); setOrgSearch(''); }} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={orgSearch}
                    onChange={e => { setOrgSearch(e.target.value); searchOrgs(e.target.value); }}
                    placeholder="Search organisations…"
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[13px] outline-none focus:border-foreground"
                  />
                  {orgResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-10 rounded-md border border-border bg-background shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {orgResults.map(o => (
                        <button
                          key={o.id}
                          type="button"
                          className="w-full px-3 py-2.5 text-left hover:bg-surface border-b border-border last:border-0"
                          onClick={() => { setSelectedOrg(o); setOrgResults([]); setOrgSearch(''); }}
                        >
                          <div className="text-[13px] font-medium">{o.legal_name}</div>
                          <div className="text-[11px] text-muted-foreground">{o.hq_country} · {o.industry}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mono-label mb-1">Quantity available</div>
                <input
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="10,000 units"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground"
                />
              </div>
              <div>
                <div className="mono-label mb-1">Category</div>
                <input
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="Textiles…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground"
                />
              </div>
            </div>

            <div>
              <div className="mono-label mb-1">Message (optional)</div>
              <textarea
                rows={3}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Lead time, pricing, MOQ…"
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-[13px] outline-none focus:border-foreground"
              />
            </div>

            {err && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
                {err}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-border py-2.5 text-[13px] font-medium text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !selectedOrg || !product.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-foreground py-2.5 text-[13px] font-medium text-background disabled:opacity-40"
              >
                <Send size={13} />
                {busy ? 'Sending…' : 'Send proposal'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

