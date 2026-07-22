import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Check, X, Search, ArrowRightLeft, MessageCircle } from 'lucide-react';

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

  const fetchRequests = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const [incRes, outRes] = await Promise.all([
        supabase
          .from('trade_requests')
          .select(`
            id, direction, product, quantity, category, message, status, responded_at, created_at,
            from_org:from_org_id ( display_name, country, industry ),
            from_profile:from_user_id ( legal_name, hq_country, industry )
          `)
          .eq('to_user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('trade_requests')
          .select(`
            id, direction, product, quantity, category, message, status, responded_at, created_at,
            to_org:to_org_id ( display_name, country, industry ),
            to_profile:to_user_id ( legal_name, hq_country, industry )
          `)
          .eq('from_user_id', user.id)
          .order('created_at', { ascending: false })
      ]);

      if (incRes.error) throw incRes.error;
      if (outRes.error) throw outRes.error;

      setIncoming(incRes.data || []);
      setOutgoing(outRes.data || []);
    } catch (e) {
      console.error('Error fetching trade requests:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [user]);

  // Respond Accept/Decline
  const handleRespond = async (requestId: string, accept: boolean) => {
    setBusyId(requestId);
    try {
      const status = accept ? 'accepted' : 'rejected';
      const { error } = await supabase
        .from('trade_requests')
        .update({
          status,
          responded_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;
      fetchRequests();
    } catch (e: any) {
      alert(e.message || 'Failed to update request.');
    } finally {
      setBusyId(null);
    }
  };

  // Search organizations in real-time
  const searchOrgs = async (val: string) => {
    setOrgSearch(val);
    if (val.trim().length < 2) {
      setMatchingOrgs([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, display_name, country, industry, name_norm')
        .ilike('display_name', `%${val}%`)
        .limit(6);

      if (error) throw error;
      setMatchingOrgs(data || []);
    } catch (e) {
      console.error('Error searching organizations:', e);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (!selectedOrg) {
      setFormErr('Please select a recipient organization.');
      return;
    }
    setFormErr(null);
    setFormBusy(true);

    try {
      // 1. Resolve receiver user ID
      const { data: toUserId, error: rpcErr } = await supabase.rpc('get_user_for_org', {
        _org_id: selectedOrg.id
      });
      if (rpcErr) throw rpcErr;
      if (!toUserId) throw new Error('Recipient organization does not have an approved operator.');

      // 2. Resolve sender organization ID
      const senderNorm = (profile.legal_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const { data: fromOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('name_norm', senderNorm)
        .maybeSingle();

      // 3. Create request
      const { error } = await supabase
        .from('trade_requests')
        .insert({
          from_user_id: user.id,
          from_org_id: fromOrg?.id || null,
          to_org_id: selectedOrg.id,
          to_user_id: toUserId,
          direction,
          product,
          quantity,
          category,
          message,
          status: 'pending'
        });

      if (error) throw error;
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

      {/* Create Trade Request Modal — bottom sheet so it never hides under the header */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="bg-card w-full rounded-t-2xl border-t border-border space-y-4 max-h-[88vh] overflow-y-auto pb-8">
            <div className="flex justify-center pt-3 pb-1"><div className="h-1 w-10 rounded-full bg-border" /></div>
            <div className="flex justify-between items-center border-b border-border pb-3 px-5">
              <h3 className="text-[15px] font-display font-medium">New Trade Request</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground p-1">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5 px-5">
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
                      placeholder="Search company display name..."
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
                <input
                  type="text"
                  required
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="e.g. Titanium Bolts Grade 5"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                />
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
                <div className="mono-label mb-1">Negotation Message</div>
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
