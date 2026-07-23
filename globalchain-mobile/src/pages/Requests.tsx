import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Check, X, Search, ArrowRightLeft, MessageCircle } from 'lucide-react';
import { searchOrganizations, listOrgProducts, sendTradeRequest } from '../lib/server-fns';

export const Requests: React.FC = () => {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [incoming, setIncoming] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New Request Form Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [matchingOrgs, setMatchingOrgs] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<any>(null);

  // Form Fields
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [prodSearch, setProdSearch] = useState('');
  const [matchingProds, setMatchingProds] = useState<any[]>([]);
  
  // Product catalogue states
  const [products, setProducts] = useState<Array<{ sku: string; name: string; unit: string }>>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedFromSearch, setSelectedFromSearch] = useState(false);

  useEffect(() => {
    if (selectedFromSearch) {
      setSelectedFromSearch(false);
    } else {
      setProduct('');
    }
    setProducts([]);
    if (!selectedOrg?.id) return;
    setLoadingProducts(true);
    listOrgProducts({ org_id: selectedOrg.id })
      .then((res) => setProducts(res || []))
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [selectedOrg, direction]);

  const fetchRequests = async () => {
    if (!user) return;
    if (incoming.length === 0 && outgoing.length === 0) setLoading(true);

    try {
      // Fetch incoming requests (org joins only, no profile FK joins through auth.users)
      const { data: incData, error: incErr } = await supabase
        .from('trade_requests')
        .select(`
          id, direction, product, quantity, category, message, status, responded_at, created_at,
          from_user_id,
          from_org:from_org_id ( id, display_name, country, industry )
        `)
        .eq('to_user_id', user.id)
        .order('created_at', { ascending: false });

      if (incErr) throw incErr;

      // Fetch outgoing requests (org joins only)
      const { data: outData, error: outErr } = await supabase
        .from('trade_requests')
        .select(`
          id, direction, product, quantity, category, message, status, responded_at, created_at,
          to_user_id,
          to_org:to_org_id ( id, display_name, country, industry )
        `)
        .eq('from_user_id', user.id)
        .order('created_at', { ascending: false });

      if (outErr) throw outErr;

      // Separately resolve profiles for display names
      const allUserIds = new Set<string>();
      (incData || []).forEach(r => { if (r.from_user_id) allUserIds.add(r.from_user_id); });
      (outData || []).forEach(r => { if (r.to_user_id) allUserIds.add(r.to_user_id); });

      let profileMap = new Map<string, any>();
      if (allUserIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, legal_name, hq_country, industry')
          .in('id', [...allUserIds]);
        profileMap = new Map((profiles || []).map(p => [p.id, p]));
      }

      // Attach profiles to request objects
      const enrichedInc = (incData || []).map(r => ({
        ...r,
        from_profile: r.from_user_id ? (profileMap.get(r.from_user_id) || null) : null,
      }));
      const enrichedOut = (outData || []).map(r => ({
        ...r,
        to_profile: r.to_user_id ? (profileMap.get(r.to_user_id) || null) : null,
      }));

      setIncoming(enrichedInc);
      setOutgoing(enrichedOut);
    } catch (e) {
      console.error('Error fetching trade requests:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchRequests();

    // Supabase Realtime — instant update when any trade_request changes
    const channel = supabase
      .channel(`trade_requests:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trade_requests',
          filter: `to_user_id=eq.${user.id}`,
        },
        () => fetchRequests()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trade_requests',
          filter: `from_user_id=eq.${user.id}`,
        },
        () => fetchRequests()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Respond Accept/Decline — with auto-linking supplier on accept (same as website)
  const handleRespond = async (requestId: string, accept: boolean) => {
    if (!user) return;
    setBusyId(requestId);
    try {
      // Find the request in incoming list
      const req = incoming.find(r => r.id === requestId);
      if (!req) throw new Error('Request not found.');

      const status = accept ? 'accepted' : 'rejected';
      const { error } = await supabase
        .from('trade_requests')
        .update({
          status,
          responded_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      // On accept: auto-link the supplier relationship (mirroring website logic)
      if (accept && req) {
        try {
          // Determine buyer and seller
          // direction 'buy'  → from_user_id = buyer, to_user_id = seller (me, the one accepting)
          // direction 'sell' → from_user_id = seller, to_user_id = buyer (me, the one accepting)
          const buyerUserId = req.direction === 'buy' ? req.from_user_id : user.id;
          const sellerUserId = req.direction === 'buy' ? user.id : req.from_user_id;

          // Resolve the seller's organization
          let sellerOrgId: string | null = req.direction === 'buy' 
            ? null  // seller is me, need to resolve my org
            : (req.from_org?.id || null);  // seller is them

          if (!sellerOrgId) {
            // Look up seller profile and find/create their org
            const { data: sellerProfile } = await supabase
              .from('profiles')
              .select('legal_name, hq_country, industry')
              .eq('id', sellerUserId)
              .maybeSingle();

            if (sellerProfile?.legal_name?.trim()) {
              // Try to find existing org by normalized name
              const normName = sellerProfile.legal_name.toLowerCase().replace(/[^a-z0-9]/g, '');
              const { data: existingOrg } = await supabase
                .from('organizations')
                .select('id')
                .eq('name_norm', normName)
                .maybeSingle();

              if (existingOrg) {
                sellerOrgId = existingOrg.id;
              }
            }
          }

          if (buyerUserId && sellerOrgId) {
            // Insert the seller as a supplier for the buyer (idempotent)
            await supabase
              .from('suppliers')
              .insert({
                owner_id: buyerUserId,
                supplier_org_id: sellerOrgId,
                category: req.category || '',
                criticality: 'medium',
                annual_spend_bucket: '',
                product: req.product || '',
                notes: req.product
                  ? `Auto-linked via trade request: ${req.product}${req.quantity ? ` × ${req.quantity}` : ''}`
                  : 'Auto-linked via accepted trade request',
              })
              .then(r => {
                if (r.error && r.error.code !== '23505') {
                  console.error('Auto-link supplier error:', r.error);
                }
              });
          }
        } catch (linkErr) {
          console.error('Auto-link supplier failed (non-blocking):', linkErr);
        }
      }

      fetchRequests();
    } catch (e: any) {
      alert(e.message || 'Failed to update request.');
    } finally {
      setBusyId(null);
    }
  };

  // Search organizations using server function (same as website)
  const searchOrgs = async (val: string) => {
    setOrgSearch(val);
    if (val.trim().length < 2) {
      setMatchingOrgs([]);
      return;
    }

    try {
      const res = await searchOrganizations({ q: val.trim() });
      const mapped = (res || []).map((o: any) => ({
        id: o.id,
        display_name: o.display_name,
        country: o.country,
        industry: o.industry,
      }));
      setMatchingOrgs(mapped);
    } catch (e) {
      console.error('Error searching organizations:', e);
      setMatchingOrgs([]);
    }
  };

  const searchProds = async (val: string) => {
    setProdSearch(val);
    if (val.trim().length < 2) {
      setMatchingProds([]);
      return;
    }
    try {
      const { data, error } = await (supabase as any).rpc('search_products_by_name', {
        _query: val.trim()
      });
      if (!error && data) {
        setMatchingProds((data || []) as any[]);
      }
    } catch (e) {
      console.error('Error searching products:', e);
      setMatchingProds([]);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!selectedOrg) {
      setFormErr('Please select a recipient organization.');
      return;
    }
    if (!product.trim()) {
      setFormErr('Please enter or select a product.');
      return;
    }
    setFormErr(null);
    setFormBusy(true);

    try {
      await sendTradeRequest({
        to_org_id: selectedOrg.id,
        direction,
        product,
        quantity,
        category,
        message,
      });
      setShowAddModal(false);
      resetForm();
      fetchRequests();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to submit trade request.');
    } finally {
      setFormBusy(false);
    }
  };

  const resetForm = () => {
    setOrgSearch('');
    setMatchingOrgs([]);
    setSelectedOrg(null);
    setProduct('');
    setQuantity('');
    setCategory('');
    setMessage('');
    setFormErr(null);
    setProdSearch('');
    setMatchingProds([]);
    setProducts([]);
    setSelectedFromSearch(false);
  };

  const currentList = tab === 'incoming' ? incoming : outgoing;

  return (
    <div className="px-4 py-5 animate-rise space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="mono-label">§ Trade Requests</span>
          <h2 className="text-xl font-display font-semibold">Procurement & Supply</h2>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="bg-foreground text-background px-3 py-1.5 rounded-md text-[12.5px] font-medium flex items-center gap-1 shadow-sm"
        >
          Create Request <Plus size={14} />
        </button>
      </div>

      {/* Tabs toggle */}
      <div className="flex border border-border rounded-md p-1 bg-surface">
        <button
          onClick={() => setTab('incoming')}
          className={`flex-1 text-center py-2 rounded text-[12.5px] font-medium transition-colors ${
            tab === 'incoming' 
              ? 'bg-background text-foreground border border-border shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Incoming ({incoming.filter(r => r.status === 'pending').length})
        </button>
        <button
          onClick={() => setTab('outgoing')}
          className={`flex-1 text-center py-2 rounded text-[12.5px] font-medium transition-colors ${
            tab === 'outgoing' 
              ? 'bg-background text-foreground border border-border shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Outgoing
        </button>
      </div>

      {/* Requests Cards List */}
      {loading ? (
        <div className="p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : currentList.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-10 text-center text-[13px] text-muted-foreground">
          No trade requests found.
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map((r) => {
            const isBusy = busyId === r.id;
            const org = tab === 'incoming' ? r.from_org : r.to_org;
            const profile = tab === 'incoming' ? r.from_profile : r.to_profile;
            const displayName = org?.display_name || profile?.legal_name || '—';
            const displaySub = org ? [org?.country, org?.industry].filter(Boolean).join(' · ') : [profile?.hq_country, profile?.industry].filter(Boolean).join(' · ');
            const label = tab === 'incoming' 
              ? (r.direction === 'buy' ? 'Wants to buy from you' : 'Offers to sell to you')
              : (r.direction === 'buy' ? 'You requested to buy' : 'You offered to sell');

            return (
              <div key={r.id} className="border border-border bg-card rounded-md p-4 space-y-3">
                {/* Org header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-[14px] font-medium text-foreground">{displayName}</h4>
                    <span className="mono-label text-[9px] mt-0.5 block">
                      {displaySub || '—'}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                    r.status === 'accepted' ? 'border-primary/20 bg-primary/5 text-primary' :
                    r.status === 'rejected' ? 'border-destructive/20 bg-destructive/5 text-destructive' :
                    'border-border text-muted-foreground'
                  }`}>
                    {r.status}
                  </span>
                </div>

                {/* Main request info */}
                <div className="bg-surface rounded-md border border-border p-3 text-[12.5px] space-y-1">
                  <div className="text-muted-foreground">{label}</div>
                  <div className="font-semibold text-foreground text-[13.5px]">{r.product}</div>
                  <div className="text-muted-foreground">Quantity: <span className="text-foreground font-medium">{r.quantity}</span></div>
                  {r.category && <div className="text-[11px] mono-label mt-1">{r.category}</div>}
                </div>

                {r.message && (
                  <p className="text-[12px] italic text-muted-foreground pl-2.5 border-l-2 border-border leading-relaxed">
                    {r.message}
                  </p>
                )}

                {/* Action buttons (Incoming Pending only) */}
                {tab === 'incoming' && r.status === 'pending' && (
                  <div className="flex gap-2 border-t border-border pt-3">
                    <button
                      onClick={() => handleRespond(r.id, false)}
                      disabled={isBusy}
                      className="flex-1 border border-destructive/20 text-destructive py-2 rounded text-[12px] font-medium hover:bg-destructive/5 disabled:opacity-40 flex items-center justify-center gap-1"
                    >
                      <X size={14} /> Decline
                    </button>
                    <button
                      onClick={() => handleRespond(r.id, true)}
                      disabled={isBusy}
                      className="flex-1 bg-foreground text-background py-2 rounded text-[12px] font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1"
                    >
                      <Check size={14} /> Accept
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Trade Request Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">New Trade Request</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground p-1">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              {/* Product Search */}
              <div className="relative">
                <div className="mono-label mb-1">Search by Product Name (quick setup)</div>
                <input
                  type="text"
                  placeholder="Type product name (e.g. wood)..."
                  value={prodSearch}
                  onChange={(e) => searchProds(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                />
                {matchingProds.length > 0 && (
                  <div className="absolute left-0 right-0 z-50 bg-card border border-border rounded mt-1 shadow-lg max-h-48 overflow-y-auto">
                    {matchingProds.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedFromSearch(true);
                          setSelectedOrg({
                            id: p.org_id,
                            display_name: p.company_name,
                            country: p.country,
                            industry: ''
                          });
                          setProduct(p.product_name);
                          setCategory(p.product_name);
                          setProdSearch(p.product_name);
                          setMatchingProds([]);
                        }}
                        className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-surface border-b border-border last:border-0"
                      >
                        <div className="font-medium">{p.product_name} <span className="text-[10px] text-muted-foreground">({p.sku})</span></div>
                        <div className="text-[11px] text-muted-foreground">Company: {p.company_name} ({p.country})</div>
                        <div className="text-[11px] text-primary font-semibold">Rs. {p.price} / {p.unit}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center py-1">
                <span className="h-px bg-border flex-1"></span>
                <span className="mx-2 text-[9px] mono-label text-muted-foreground">OR SELECT MANUALLY</span>
                <span className="h-px bg-border flex-1"></span>
              </div>

              {/* Organization Search */}
              <div className="relative">
                <div className="mono-label mb-1">Target Organization</div>
                {selectedOrg ? (
                  <div className="border border-border bg-surface p-2.5 rounded flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-medium">{selectedOrg.display_name}</div>
                      <div className="text-[11px] text-muted-foreground">{selectedOrg.country} · {selectedOrg.industry}</div>
                    </div>
                    <button type="button" onClick={() => setSelectedOrg(null)} className="text-muted-foreground hover:text-foreground">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search company name..."
                      value={orgSearch}
                      onChange={(e) => searchOrgs(e.target.value)}
                      className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                    />
                    {matchingOrgs.length > 0 && (
                      <div className="absolute left-0 right-0 z-50 bg-card border border-border rounded mt-1 shadow-lg max-h-48 overflow-y-auto">
                        {matchingOrgs.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => { setSelectedOrg(o); setMatchingOrgs([]); }}
                            className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-surface border-b border-border last:border-0"
                          >
                            <div className="font-medium">{o.display_name}</div>
                            <div className="text-[11px] text-muted-foreground">{o.country} · {o.industry}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Trade Direction */}
              <div>
                <div className="mono-label mb-1">Direction</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDirection('buy')}
                    className={`flex-1 py-2 text-[12.5px] font-medium border rounded transition-colors ${
                      direction === 'buy' 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Request to Buy (Procure)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('sell')}
                    className={`flex-1 py-2 text-[12.5px] font-medium border rounded transition-colors ${
                      direction === 'sell' 
                        ? 'border-primary bg-primary/10 text-primary' 
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Offer to Sell (Supply)
                  </button>
                </div>
              </div>

              {/* Product */}
              <div>
                <div className="mono-label mb-1">Product Description</div>
                {direction === 'buy' ? (
                  <select
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                    required
                    disabled={!selectedOrg || loadingProducts || products.length === 0}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none disabled:opacity-60"
                  >
                    <option value="">
                      {loadingProducts ? 'Loading catalogue...' : 
                       !selectedOrg ? '— select an organisation first —' :
                       products.length === 0 ? '— no products in catalogue —' : 
                       '— select a product —'}
                    </option>
                    {products.map((p) => (
                      <option key={p.sku} value={p.name}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                    placeholder="e.g. Titanium Bolts Grade 5"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">Quantity</div>
                  <input
                    type="text"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="e.g. 5,000 units"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Category (Optional)</div>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Fasteners"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <div className="mono-label mb-1">Negotiation Message</div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enquire details, pricing, delivery expectations..."
                  rows={2}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none resize-none"
                />
              </div>

              {formErr && <div className="text-[12px] text-destructive">{formErr}</div>}

              <button
                type="submit"
                disabled={formBusy}
                className="w-full bg-foreground text-background py-2.5 rounded text-[13px] font-medium hover:opacity-90 disabled:opacity-60"
              >
                {formBusy ? 'Submitting...' : 'Send Trade Request'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
