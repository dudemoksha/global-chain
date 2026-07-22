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
    if (!user) return;
    setLoading(true);
    try {
      // Get my own organization id from profiles
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('id, legal_name, hq_country, industry')
        .eq('id', user.id)
        .maybeSingle();

      if (!myProfile) { setLoading(false); return; }

      // Find all trade_requests where I am the seller (sell direction) and accepted
      const { data: reqs } = await supabase
        .from('trade_requests')
        .select(`
          id, category, message, created_at,
          from_profile:from_user_id ( id, legal_name, hq_country, industry ),
          to_profile:to_user_id ( id, legal_name, hq_country, industry )
        `)
        .eq('status', 'accepted')
        .eq('direction', 'sell')
        .eq('from_user_id', user.id);

      // Also fetch where others buy from us
      const { data: incoming } = await supabase
        .from('trade_requests')
        .select(`
          id, category, message, created_at,
          from_profile:from_user_id ( id, legal_name, hq_country, industry ),
          to_profile:to_user_id ( id, legal_name, hq_country, industry )
        `)
        .eq('status', 'accepted')
        .eq('direction', 'buy')
        .eq('to_user_id', user.id);

      const all = [...(reqs || []), ...(incoming || [])];
      setCustomers(all);
    } catch (e) {
      console.error('Error fetching customers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(r => {
      const cust = r.from_profile?.legal_name || r.to_profile?.legal_name || '';
      const country = r.from_profile?.hq_country || r.to_profile?.hq_country || '';
      const cat = r.category || '';
      return cust.toLowerCase().includes(q) || country.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
    });
  }, [customers, search]);

  const stats = useMemo(() => {
    const countries = new Set(customers.map(r => r.from_profile?.hq_country || r.to_profile?.hq_country).filter(Boolean)).size;
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
          Organisations that buy from you. Propose to new customers using the button below.
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
            const name = r.from_profile?.legal_name || r.to_profile?.legal_name || '—';
            const country = r.from_profile?.hq_country || r.to_profile?.hq_country || '';
            const industry = r.from_profile?.industry || r.to_profile?.industry || '';
            return (
              <div key={r.id} className="rounded-md border border-border bg-card p-4">
                <div className="font-medium text-[14px]">{name}</div>
                <div className="mono-label mt-0.5 text-[10px]">
                  {[country, industry].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
                  {r.category && <span className="rounded-full bg-surface px-2 py-0.5 border border-border">{r.category}</span>}
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.message && (
                  <div className="mt-2 text-[12px] text-muted-foreground">{r.message}</div>
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
    if (!product.trim()) { setErr('Product is required.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.from('trade_requests').insert({
        from_user_id: userId,
        from_org_id: null,
        to_user_id: selectedOrg.id,
        to_org_id: selectedOrg.id, // use profile id as org id placeholder
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
    <div className="fixed inset-0 z-50 flex items-end bg-foreground/30 backdrop-blur-[1px]" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-h-[90vh] overflow-y-auto rounded-t-2xl border-t border-border bg-background pb-safe">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
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
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
            {/* Org search */}
            <div>
              <div className="mono-label mb-1.5">Customer organisation</div>
              {selectedOrg ? (
                <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-medium">{selectedOrg.legal_name}</div>
                    <div className="text-[11px] text-muted-foreground">{selectedOrg.hq_country}</div>
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
                          <div className="text-[11px] text-muted-foreground">{o.hq_country}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="mono-label mb-1.5">Product / SKU you're offering</div>
              <input
                value={product}
                onChange={e => setProduct(e.target.value)}
                placeholder="e.g. Grade-A cotton yarn, 25 µm aluminium foil"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[13px] outline-none focus:border-foreground"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mono-label mb-1.5">Quantity</div>
                <input
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="10,000 units"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[13px] outline-none focus:border-foreground"
                />
              </div>
              <div>
                <div className="mono-label mb-1.5">Category</div>
                <input
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="Textiles…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[13px] outline-none focus:border-foreground"
                />
              </div>
            </div>

            <div>
              <div className="mono-label mb-1.5">Message (optional)</div>
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
