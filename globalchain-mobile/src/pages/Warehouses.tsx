import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, Trash2, Edit2, X, MapPin, Layers } from 'lucide-react';

export const Warehouses: React.FC = () => {
  const { user } = useAuth();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<any>(null);

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [capacity, setCapacity] = useState<number | ''>('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const fetchWarehouses = async () => {
    if (!user) return;
    if (warehouses.length === 0) setLoading(true);
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('owner_id', user.id)
        .order('name', { ascending: true });
      if (error) throw error;
      setWarehouses(data || []);
    } catch (e) {
      console.error('Error fetching warehouses:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarehouses();
    const interval = setInterval(fetchWarehouses, 5000);
    return () => clearInterval(interval);
  }, [user]);

  // Geocode address client-side
  const geocodeAddress = async (query: string) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'GlobalChainMobile/1.0 (supply-chain-risk-mobile-app)',
          'Accept-Language': 'en',
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.length) return null;
      const hit = data[0];
      const addr = hit.address || {};
      return {
        lat: parseFloat(hit.lat),
        lng: parseFloat(hit.lon),
        city: addr.city || addr.town || addr.village || addr.state || addr.country || '',
        country: addr.country || '',
      };
    } catch (e) {
      console.error('Geocoding error:', e);
      return null;
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormErr(null);
    setFormBusy(true);

    try {
      let finalLat = null;
      let finalLng = null;
      let finalCity = city;
      let finalCountry = country;

      // Geocode client-side if coordinates are not provided
      const geo = await geocodeAddress(address);
      if (geo) {
        finalLat = geo.lat;
        finalLng = geo.lng;
        if (!finalCity) finalCity = geo.city;
        if (!finalCountry) finalCountry = geo.country;
      }

      const { error } = await supabase
        .from('warehouses')
        .insert({
          owner_id: user.id,
          name,
          address,
          city: finalCity,
          country: finalCountry,
          lat: finalLat,
          lng: finalLng,
          capacity_units: capacity === '' ? 0 : Number(capacity),
        });

      if (error) throw error;
      setShowAddModal(false);
      resetForm();
      fetchWarehouses();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to add warehouse.');
    } finally {
      setFormBusy(false);
    }
  };

  const openEdit = (wh: any) => {
    setSelectedWarehouse(wh);
    setName(wh.name);
    setAddress(wh.address);
    setCity(wh.city || '');
    setCountry(wh.country || '');
    setCapacity(wh.capacity_units || 0);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedWarehouse) return;
    setFormErr(null);
    setFormBusy(true);

    try {
      const { error } = await supabase
        .from('warehouses')
        .update({
          name,
          address,
          city,
          country,
          capacity_units: capacity === '' ? 0 : Number(capacity),
        })
        .eq('id', selectedWarehouse.id)
        .eq('owner_id', user.id);

      if (error) throw error;
      setShowEditModal(false);
      resetForm();
      fetchWarehouses();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to update warehouse.');
    } finally {
      setFormBusy(false);
    }
  };

  const handleDelete = async (whId: string) => {
    if (!confirm('Are you sure you want to delete this warehouse node?')) return;
    setBusyId(whId);
    try {
      const { error } = await supabase
        .from('warehouses')
        .delete()
        .eq('id', whId)
        .eq('owner_id', user!.id);

      if (error) throw error;
      setWarehouses((prev) => prev.filter((w) => w.id !== whId));
    } catch (e: any) {
      alert(e.message || 'Failed to delete warehouse.');
    } finally {
      setBusyId(null);
    }
  };

  const resetForm = () => {
    setName('');
    setAddress('');
    setCity('');
    setCountry('');
    setCapacity('');
    setFormErr(null);
    setSelectedWarehouse(null);
  };

  const filteredWarehouses = warehouses.filter((w) => {
    const q = search.toLowerCase();
    return w.name.toLowerCase().includes(q) || 
           w.address.toLowerCase().includes(q) || 
           (w.city && w.city.toLowerCase().includes(q));
  });

  return (
    <div className="px-4 py-5 animate-rise space-y-4">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <span className="mono-label">§ Logistics Facilities</span>
          <h2 className="text-xl font-display font-semibold">Warehouses</h2>
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
          placeholder="Search facilities, cities..."
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
      ) : filteredWarehouses.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-10 text-center text-[13px] text-muted-foreground">
          {search ? 'No search results match.' : 'No warehouses registered yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredWarehouses.map((w) => {
            const isBusy = busyId === w.id;
            return (
              <div key={w.id} className="border border-border bg-card rounded-md p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-[14.5px] font-medium text-foreground">{w.name}</h4>
                    <span className="text-[11px] text-muted-foreground mt-0.5 block flex items-center gap-1">
                      <MapPin size={12} /> {w.address}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                    <Layers size={12} /> {w.capacity_units.toLocaleString()} units
                  </span>
                </div>

                {w.lat && w.lng && (
                  <div className="text-[10px] text-muted-foreground font-mono bg-surface p-1.5 rounded inline-block">
                    Geolinked: {w.lat.toFixed(4)}°, {w.lng.toFixed(4)}°
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  <button
                    onClick={() => openEdit(w)}
                    disabled={isBusy}
                    className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(w.id)}
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
              <h3 className="text-[15px] font-display font-medium">Add Warehouse</h3>
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
                  placeholder="e.g. Central Hub A"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                />
              </div>

              <div>
                <div className="mono-label mb-1">Address</div>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 100 Main St, Tokyo"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none focus:border-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">City (Optional)</div>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Tokyo"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Country (Optional)</div>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. Japan"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              <div>
                <div className="mono-label mb-1">Storage Capacity (Units)</div>
                <input
                  type="number"
                  required
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 50000"
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
              <h3 className="text-[15px] font-display font-medium">Edit Warehouse</h3>
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

              <div>
                <div className="mono-label mb-1">Address</div>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">City</div>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Country</div>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              <div>
                <div className="mono-label mb-1">Storage Capacity (Units)</div>
                <input
                  type="number"
                  required
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
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
