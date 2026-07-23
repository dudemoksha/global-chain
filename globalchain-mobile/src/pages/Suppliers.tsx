import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { addSupplier } from '../lib/server-fns'; // uses our Vercel REST wrapper for insert/update if needed or direct DB
import { Plus, Search, Eye, ShieldAlert, Watch, Trash2, Edit2, AlertCircle, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Suppliers: React.FC = () => {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [watches, setWatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Form Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);

  // Add/Edit Form State
  const [legalName, setLegalName] = useState('');
  const [country, setCountry] = useState('');
  const [industry, setIndustry] = useState('');
  const [category, setCategory] = useState('');
  const [criticality, setCriticality] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [spendBucket, setSpendBucket] = useState('');
  const [leadTime, setLeadTime] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const fetchSuppliersAndWatches = async () => {
    if (!user) return;
    if (suppliers.length === 0) setLoading(true);

    try {
      const [supRes, watchRes] = await Promise.all([
        supabase
          .from('suppliers')
          .select(`
            id, category, criticality, annual_spend_bucket, lead_time_days, notes, product, is_stopped, stopped_at, created_at,
            organizations:supplier_org_id ( id, display_name, country, industry )
          `)
          .eq('owner_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('supplier_watches')
          .select('supplier_id')
          .eq('user_id', user.id)
      ]);

      if (supRes.error) throw supRes.error;
      if (watchRes.error) throw watchRes.error;

      setSuppliers(supRes.data || []);
      setWatches((watchRes.data || []).map((w: any) => w.supplier_id));
    } catch (e) {
      console.error('Error fetching suppliers list:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchSuppliersAndWatches();

    const channel = supabase
      .channel(`suppliers:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers', filter: `owner_id=eq.${user.id}` }, fetchSuppliersAndWatches)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_watches', filter: `user_id=eq.${user.id}` }, fetchSuppliersAndWatches)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Toggle Pinned / Watched Status
  const handleToggleWatch = async (supplierId: string, isWatched: boolean) => {
    if (!user) return;
    setBusyId(supplierId);

    try {
      if (isWatched) {
        // Unwatch
        const { error } = await supabase
          .from('supplier_watches')
          .delete()
          .eq('user_id', user.id)
          .eq('supplier_id', supplierId);
        if (error) throw error;
        setWatches((prev) => prev.filter((id) => id !== supplierId));
      } else {
        // Watch
        const { error } = await supabase
          .from('supplier_watches')
          .upsert(
            { user_id: user.id, supplier_id: supplierId },
            { onConflict: 'user_id,supplier_id', ignoreDuplicates: true }
          );
        if (error) throw error;
        setWatches((prev) => [...prev, supplierId]);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to update watch state.');
    } finally {
      setBusyId(null);
    }
  };

  // Toggle Stopped Status (Spikes risk score)
  const handleToggleStopped = async (supplierId: string, currentStopped: boolean) => {
    setBusyId(supplierId);
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({
          is_stopped: !currentStopped,
          stopped_at: !currentStopped ? new Date().toISOString() : null
        })
        .eq('id', supplierId)
        .eq('owner_id', user!.id);

      if (error) throw error;
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === supplierId
            ? { ...s, is_stopped: !currentStopped, stopped_at: !currentStopped ? new Date().toISOString() : null }
            : s
        )
      );
    } catch (e: any) {
      alert(e.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  // Add Supplier Action
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setFormBusy(true);

    try {
      // Delegate to server function wrapper to safely resolve organization via service role
      await addSupplier({
        legal_name: legalName,
        country,
        industry,
        category,
        criticality,
        annual_spend_bucket: spendBucket,
        lead_time_days: leadTime === '' ? null : Number(leadTime),
        notes,
      });

      setShowAddModal(false);
      resetForm();
      fetchSuppliersAndWatches();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to add supplier.');
    } finally {
      setFormBusy(false);
    }
  };

  // Open Edit Modal
  const openEdit = (supplier: any) => {
    setSelectedSupplier(supplier);
    setCategory(supplier.category || '');
    setCriticality(supplier.criticality || 'medium');
    setSpendBucket(supplier.annual_spend_bucket || '');
    setLeadTime(supplier.lead_time_days ?? '');
    setNotes(supplier.notes || '');
    setShowEditModal(true);
  };

  // Edit Supplier Action
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    setFormErr(null);
    setFormBusy(true);

    try {
      // We can update directly from the client using Supabase SDK
      const { error } = await supabase
        .from('suppliers')
        .update({
          category,
          criticality,
          annual_spend_bucket: spendBucket,
          lead_time_days: leadTime === '' ? null : Number(leadTime),
          notes,
        })
        .eq('id', selectedSupplier.id)
        .eq('owner_id', user!.id);

      if (error) throw error;
      setShowEditModal(false);
      resetForm();
      fetchSuppliersAndWatches();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to update supplier.');
    } finally {
      setFormBusy(false);
    }
  };

  // Delete Supplier Action
  const handleDelete = async (supplierId: string) => {
    if (!confirm('Are you sure you want to remove this supplier node?')) return;
    setBusyId(supplierId);

    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplierId)
        .eq('owner_id', user!.id);

      if (error) throw error;
      setSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
    } catch (e: any) {
      alert(e.message || 'Failed to delete supplier.');
    } finally {
      setBusyId(null);
    }
  };

  const resetForm = () => {
    setLegalName('');
    setCountry('');
    setIndustry('');
    setCategory('');
    setCriticality('medium');
    setSpendBucket('');
    setLeadTime('');
    setNotes('');
    setFormErr(null);
    setSelectedSupplier(null);
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const name = s.organizations?.display_name || '';
    const categoryName = s.category || '';
    const countryName = s.organizations?.country || '';
    const query = search.toLowerCase();
    return name.toLowerCase().includes(query) || 
           categoryName.toLowerCase().includes(query) || 
           countryName.toLowerCase().includes(query);
  });

  return (
    <div className="px-4 py-5 animate-rise space-y-4">
      {/* Header section */}
      <div className="flex items-center justify-between">
        <div>
          <span className="mono-label">§ Global Registry</span>
          <h2 className="text-xl font-display font-semibold">Tier-1 Suppliers</h2>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="bg-foreground text-background px-3 py-1.5 rounded-md text-[12.5px] font-medium flex items-center gap-1 shadow-sm"
        >
          Add Node <Plus size={14} />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
        <input
          type="text"
          placeholder="Search suppliers, category, country..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-card text-[13.5px] outline-none focus:border-foreground"
        />
      </div>

      {/* Suppliers Cards List */}
      {loading ? (
        <div className="p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-10 text-center text-[13px] text-muted-foreground">
          {search ? 'No search results match.' : 'No suppliers registered yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSuppliers.map((s) => {
            const org = s.organizations || {};
            const isWatched = watches.includes(s.id);
            const isBusy = busyId === s.id;

            return (
              <div 
                key={s.id} 
                className={`border rounded-md bg-card p-4 transition-all duration-200 ${
                  s.is_stopped ? 'border-destructive/30 bg-destructive/5' : 'border-border'
                }`}
              >
                {/* Supplier Title & Country */}
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-[14.5px] font-medium text-foreground">{org.display_name}</h4>
                    <span className="mono-label text-[10px] mt-0.5 block">
                      {[org.country, org.industry].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase ${
                    s.criticality === 'critical' ? 'border-destructive/20 bg-destructive/10 text-destructive' :
                    s.criticality === 'high' ? 'border-warn/20 bg-warn/10 text-warn' :
                    'border-border text-muted-foreground'
                  }`}>
                    {s.criticality}
                  </span>
                </div>

                {/* Grid details */}
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 border-t border-border mt-3 pt-3 text-[12px] text-muted-foreground">
                  <div>
                    <span>Category:</span> <span className="text-foreground font-medium">{s.category || 'N/A'}</span>
                  </div>
                  <div>
                    <span>Lead Time:</span> <span className="text-foreground font-medium">{s.lead_time_days !== null ? `${s.lead_time_days} days` : 'N/A'}</span>
                  </div>
                  <div>
                    <span>Spend:</span> <span className="text-foreground font-medium">{s.annual_spend_bucket || 'N/A'}</span>
                  </div>
                  <div>
                    <span>Status:</span> 
                    <span className={`font-semibold ml-1 ${s.is_stopped ? 'text-destructive' : 'text-primary'}`}>
                      {s.is_stopped ? 'Suspended' : 'Operational'}
                    </span>
                  </div>
                </div>

                {s.notes && (
                  <p className="text-[11.5px] italic text-muted-foreground bg-surface border border-border rounded p-2 mt-2 leading-relaxed">
                    "{s.notes}"
                  </p>
                )}

                {/* Actions row */}
                <div className="flex items-center justify-between border-t border-border mt-3 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleWatch(s.id, isWatched)}
                      disabled={isBusy}
                      className={`p-1.5 rounded border transition-colors ${
                        isWatched ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                      }`}
                      title={isWatched ? 'Unpin' : 'Pin to Dashboard'}
                    >
                      <Watch size={14} />
                    </button>
                    <button
                      onClick={() => handleToggleStopped(s.id, s.is_stopped)}
                      disabled={isBusy}
                      className={`px-2 py-1 rounded border text-[11.5px] font-medium transition-colors ${
                        s.is_stopped 
                          ? 'border-primary/20 bg-primary/5 text-primary hover:bg-primary/10' 
                          : 'border-destructive/20 bg-destructive/5 text-destructive hover:bg-destructive/10'
                      }`}
                    >
                      {s.is_stopped ? 'Reactivate' : 'Suspend Node'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(s)}
                      disabled={isBusy}
                      className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={isBusy}
                      className="p-1.5 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">Add Supplier Node</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              <div>
                <div className="mono-label mb-1">Company Legal Name</div>
                <input
                  type="text"
                  required
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="e.g. Meridian Aerospace"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">Country</div>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. Japan"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Industry</div>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Aerospace"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                  />
                </div>
              </div>

              <div>
                <div className="mono-label mb-1">Category / Components</div>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Carbon Fiber Composites"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">Criticality</div>
                  <select
                    value={criticality}
                    onChange={(e: any) => setCriticality(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <div className="mono-label mb-1">Spend Bucket</div>
                  <select
                    value={spendBucket}
                    onChange={(e) => setSpendBucket(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                  >
                    <option value="">Select bucket...</option>
                    <option value="<$50K">&lt;$50K</option>
                    <option value="$50K-$250K">$50K-$250K</option>
                    <option value="$250K-$1M">$250K-$1M</option>
                    <option value=">$1M">&gt;$1M</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="mono-label mb-1">Lead Time (Days)</div>
                <input
                  type="number"
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 30"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Notes</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Operational notes..."
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
                {formBusy ? 'Adding node...' : 'Enrol Supplier Node'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Supplier Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">Edit Supplier Details</h3>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5">
              <div>
                <div className="mono-label mb-1">Company (Read Only)</div>
                <input
                  type="text"
                  disabled
                  value={selectedSupplier?.organizations?.display_name || ''}
                  className="w-full border border-border bg-surface text-muted-foreground rounded px-2.5 py-1.5 text-[13px] outline-none"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Category / Components</div>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">Criticality</div>
                  <select
                    value={criticality}
                    onChange={(e: any) => setCriticality(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <div className="mono-label mb-1">Spend Bucket</div>
                  <select
                    value={spendBucket}
                    onChange={(e) => setSpendBucket(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                  >
                    <option value="">Select bucket...</option>
                    <option value="<$50K">&lt;$50K</option>
                    <option value="$50K-$250K">$50K-$250K</option>
                    <option value="$250K-$1M">$250K-$1M</option>
                    <option value=">$1M">&gt;$1M</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="mono-label mb-1">Lead Time (Days)</div>
                <input
                  type="number"
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Notes</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                {formBusy ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
