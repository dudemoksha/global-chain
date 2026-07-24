import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, Trash2, Edit2, X, Factory as FactoryIcon, Settings } from 'lucide-react';

export const Factories: React.FC = () => {
  const { user } = useAuth();
  const [factories, setFactories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedFactory, setSelectedFactory] = useState<any>(null);

  // Form states
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [capacity, setCapacity] = useState<number | ''>(0);
  const [productsText, setProductsText] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const fetchFactories = async () => {
    if (!user) return;
    if (factories.length === 0) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('factories')
        .select('*')
        .eq('owner_id', user.id)
        .order('name', { ascending: true });
      if (error) throw error;
      setFactories(data || []);
    } catch (e) {
      console.error('Error fetching factories:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFactories();
    const interval = setInterval(fetchFactories, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormErr(null);
    setFormBusy(true);

    try {
      // Split products by comma or newline
      const products = productsText
        .split(/[,\n]/)
        .map((p) => p.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from('factories')
        .insert({
          owner_id: user.id,
          name,
          country,
          city,
          capacity_units: capacity === '' ? 0 : Number(capacity),
          products,
          warehouse,
        });

      if (error) throw error;
      setShowAddModal(false);
      resetForm();
      fetchFactories();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to add factory.');
    } finally {
      setFormBusy(false);
    }
  };

  const openEdit = (f: any) => {
    setSelectedFactory(f);
    setName(f.name);
    setCountry(f.country || '');
    setCity(f.city || '');
    setCapacity(f.capacity_units || 0);
    setProductsText((f.products || []).join(', '));
    setWarehouse(f.warehouse || '');
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFactory) return;
    setFormErr(null);
    setFormBusy(true);

    try {
      const products = productsText
        .split(/[,\n]/)
        .map((p) => p.trim())
        .filter(Boolean);

      const { error } = await supabase
        .from('factories')
        .update({
          name,
          country,
          city,
          capacity_units: capacity === '' ? 0 : Number(capacity),
          products,
          warehouse,
        })
        .eq('id', selectedFactory.id)
        .eq('owner_id', user.id);

      if (error) throw error;
      setShowEditModal(false);
      resetForm();
      fetchFactories();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to update factory.');
    } finally {
      setFormBusy(false);
    }
  };

  const handleDelete = async (fId: string) => {
    if (!confirm('Are you sure you want to delete this manufacturing facility?')) return;
    setBusyId(fId);
    try {
      const { error } = await supabase
        .from('factories')
        .delete()
        .eq('id', fId)
        .eq('owner_id', user!.id);

      if (error) throw error;
      setFactories((prev) => prev.filter((f) => f.id !== fId));
    } catch (e: any) {
      alert(e.message || 'Failed to delete factory.');
    } finally {
      setBusyId(null);
    }
  };

  const resetForm = () => {
    setName('');
    setCountry('');
    setCity('');
    setCapacity('');
    setProductsText('');
    setWarehouse('');
    setFormErr(null);
    setSelectedFactory(null);
  };

  const filteredFactories = factories.filter((f) => {
    const q = search.toLowerCase();
    return f.name.toLowerCase().includes(q) || 
           (f.city && f.city.toLowerCase().includes(q)) || 
           (f.country && f.country.toLowerCase().includes(q));
  });

  return (
    <div className="px-4 py-5 animate-rise space-y-4">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <span className="mono-label">§ Production Sites</span>
          <h2 className="text-xl font-display font-semibold">Facilities</h2>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="bg-foreground text-background px-3 py-1.5 rounded-md text-[12.5px] font-medium flex items-center gap-1 shadow-sm"
        >
          Add facility <Plus size={14} />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
        <input
          type="text"
          placeholder="Search facilities, products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-card text-[13.5px] outline-none focus:border-foreground"
        />
      </div>

      {/* Cards List */}
      {loading ? (
        <div className="p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredFactories.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-10 text-center text-[13px] text-muted-foreground">
          {search ? 'No search results match.' : 'No manufacturing sites registered yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFactories.map((f) => {
            const isBusy = busyId === f.id;
            return (
              <div key={f.id} className="border border-border bg-card rounded-md p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-[14.5px] font-medium text-foreground flex items-center gap-1.5">
                      <FactoryIcon size={16} className="text-muted-foreground" /> {f.name}
                    </h4>
                    <span className="mono-label text-[9px] mt-0.5 block">
                      {[f.city, f.country].filter(Boolean).join(', ')}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Cap: {f.capacity_units.toLocaleString()} units
                  </span>
                </div>

                {f.products && f.products.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] mono-label">Outputs:</span>
                    <div className="flex flex-wrap gap-1">
                      {f.products.map((p: string, idx: number) => (
                        <span key={idx} className="text-[10.5px] bg-surface border border-border rounded px-1.5 py-0.5 text-foreground">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {f.warehouse && (
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <span className="mono-label !text-[9px]">Linked Wh:</span> <span className="font-medium text-foreground">{f.warehouse}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  <button
                    onClick={() => openEdit(f)}
                    disabled={isBusy}
                    className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(f.id)}
                    disabled={isBusy}
                    className="p-1.5 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">Add Facility</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              <div>
                <div className="mono-label mb-1">Facility Name</div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Assembly Plant Tokyo"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">City</div>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Tokyo"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Country</div>
                  <input
                    type="text"
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. Japan"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              <div>
                <div className="mono-label mb-1">Facility Capacity (Units/Yr)</div>
                <input
                  type="number"
                  required
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 10000"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Manufactured Products (Comma separated)</div>
                <textarea
                  value={productsText}
                  onChange={(e) => setProductsText(e.target.value)}
                  placeholder="e.g. Carbon Tubing, Silicon Chips"
                  rows={2}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none resize-none"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Linked Destination Warehouse</div>
                <input
                  type="text"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  placeholder="e.g. Central Warehouse Tokyo"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              {formErr && <div className="text-[12px] text-destructive">{formErr}</div>}

              <button
                type="submit"
                disabled={formBusy}
                className="w-full bg-foreground text-background py-2.5 rounded text-[13px] font-medium hover:opacity-90 disabled:opacity-60"
              >
                {formBusy ? 'Adding facility...' : 'Add Facility Node'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">Edit Facility</h3>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5">
              <div>
                <div className="mono-label mb-1">Facility Name</div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">City</div>
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Country</div>
                  <input
                    type="text"
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              <div>
                <div className="mono-label mb-1">Facility Capacity</div>
                <input
                  type="number"
                  required
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Products (Comma separated)</div>
                <textarea
                  value={productsText}
                  onChange={(e) => setProductsText(e.target.value)}
                  rows={2}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] resize-none"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Linked Destination Warehouse</div>
                <input
                  type="text"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
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
