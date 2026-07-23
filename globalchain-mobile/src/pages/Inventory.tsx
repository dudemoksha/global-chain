import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, Trash2, Edit2, X, AlertTriangle, CheckCircle, Package } from 'lucide-react';

export const Inventory: React.FC = () => {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Form states
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unit');
  const [warehouseId, setWarehouseId] = useState('');
  const [capacity, setCapacity] = useState<number | ''>(0);
  const [monthlyProd, setMonthlyProd] = useState<number | ''>(0);
  const [currentStock, setCurrentStock] = useState<number | ''>(0);
  const [safetyStock, setSafetyStock] = useState<number | ''>(0);
  const [reorderLevel, setReorderLevel] = useState<number | ''>(0);
  const [price, setPrice] = useState<number | ''>(100);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [invRes, whRes] = await Promise.all([
        supabase
          .from('inventory_items')
          .select(`
            id, sku, name, unit, warehouse_id, warehouse_capacity, monthly_production, current_stock, safety_stock, reorder_level, price, updated_at,
            warehouses:warehouse_id ( name, country, city )
          `)
          .eq('owner_id', user.id)
          .order('name', { ascending: true }),
        supabase
          .from('warehouses')
          .select('id, name')
          .eq('owner_id', user.id)
          .order('name', { ascending: true })
      ]);

      if (invRes.error) throw invRes.error;
      if (whRes.error) throw whRes.error;

      setInventory(invRes.data || []);
      setWarehouses(whRes.data || []);
    } catch (e) {
      console.error('Error fetching inventory:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [user]);

  // Generate clean SKU client-side
  const generateSku = async () => {
    if (!user) return '';
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 6; attempt++) {
      let code = 'SKU-';
      for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
      const { data } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('owner_id', user.id)
        .eq('sku', code)
        .maybeSingle();
      if (!data) return code;
    }
    return `SKU-${Date.now().toString(36).toUpperCase()}`;
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!warehouseId) {
      setFormErr('Please select a warehouse.');
      return;
    }
    setFormErr(null);
    setFormBusy(true);

    try {
      const sku = await generateSku();
      const { error } = await supabase
        .from('inventory_items')
        .insert({
          owner_id: user.id,
          sku,
          name,
          unit,
          warehouse_id: warehouseId,
          warehouse_capacity: capacity === '' ? 0 : Number(capacity),
          monthly_production: monthlyProd === '' ? 0 : Number(monthlyProd),
          current_stock: currentStock === '' ? 0 : Number(currentStock),
          safety_stock: safetyStock === '' ? 0 : Number(safetyStock),
          reorder_level: reorderLevel === '' ? 0 : Number(reorderLevel),
          price: price === '' ? 100 : Number(price),
          warehouse: warehouses.find(w => w.id === warehouseId)?.name || '',
        });

      if (error) throw error;
      setShowAddModal(false);
      resetForm();
      fetchData();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to add SKU.');
    } finally {
      setFormBusy(false);
    }
  };

  const openEdit = (item: any) => {
    setSelectedItem(item);
    setName(item.name);
    setUnit(item.unit);
    setWarehouseId(item.warehouse_id || '');
    setCapacity(item.warehouse_capacity || 0);
    setMonthlyProd(item.monthly_production || 0);
    setCurrentStock(item.current_stock || 0);
    setSafetyStock(item.safety_stock || 0);
    setReorderLevel(item.reorder_level || 0);
    setPrice(item.price || 100);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedItem) return;
    setFormErr(null);
    setFormBusy(true);

    try {
      const { error } = await supabase
        .from('inventory_items')
        .update({
          name,
          unit,
          warehouse_id: warehouseId,
          warehouse_capacity: capacity === '' ? 0 : Number(capacity),
          monthly_production: monthlyProd === '' ? 0 : Number(monthlyProd),
          current_stock: currentStock === '' ? 0 : Number(currentStock),
          safety_stock: safetyStock === '' ? 0 : Number(safetyStock),
          reorder_level: reorderLevel === '' ? 0 : Number(reorderLevel),
          price: price === '' ? 100 : Number(price),
          warehouse: warehouses.find(w => w.id === warehouseId)?.name || '',
        })
        .eq('id', selectedItem.id)
        .eq('owner_id', user.id);

      if (error) throw error;
      setShowEditModal(false);
      resetForm();
      fetchData();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to update SKU.');
    } finally {
      setFormBusy(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this SKU?')) return;
    setBusyId(itemId);
    try {
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', itemId)
        .eq('owner_id', user!.id);

      if (error) throw error;
      setInventory((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e: any) {
      alert(e.message || 'Failed to delete SKU.');
    } finally {
      setBusyId(null);
    }
  };

  const resetForm = () => {
    setName('');
    setUnit('unit');
    setWarehouseId('');
    setCapacity(0);
    setMonthlyProd(0);
    setCurrentStock(0);
    setSafetyStock(0);
    setReorderLevel(0);
    setPrice(100);
    setFormErr(null);
    setSelectedItem(null);
  };

  const filteredInventory = inventory.filter((item) => {
    const q = search.toLowerCase();
    return item.name.toLowerCase().includes(q) || 
           item.sku.toLowerCase().includes(q) || 
           (item.warehouses?.name && item.warehouses.name.toLowerCase().includes(q));
  });

  return (
    <div className="px-4 py-5 animate-rise space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="mono-label">§ Material Catalog</span>
          <h2 className="text-xl font-display font-semibold">Inventory SKUs</h2>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="bg-foreground text-background px-3 py-1.5 rounded-md text-[12.5px] font-medium flex items-center gap-1 shadow-sm"
        >
          Add SKU <Plus size={14} />
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
        <input
          type="text"
          placeholder="Search SKU name, code, warehouse..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-border rounded-md bg-card text-[13.5px] outline-none focus:border-foreground"
        />
      </div>

      {/* SKU Cards List */}
      {loading ? (
        <div className="p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredInventory.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-10 text-center text-[13px] text-muted-foreground">
          {search ? 'No search results match.' : 'No SKUs added yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredInventory.map((i) => {
            const isBusy = busyId === i.id;
            const isLowStock = i.current_stock <= i.reorder_level;
            const isCriticallyLow = i.current_stock <= i.safety_stock;

            return (
              <div 
                key={i.id} 
                className={`border rounded-md bg-card p-4 transition-all duration-200 ${
                  isCriticallyLow ? 'border-destructive/30 bg-destructive/5' :
                  isLowStock ? 'border-warn/30 bg-warn/5' :
                  'border-border'
                }`}
              >
                {/* SKU Code & Status */}
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-[14.5px] font-medium text-foreground">{i.name}</h4>
                    <span className="text-[10px] font-mono text-muted-foreground mt-0.5 block">
                      {i.sku} · {i.warehouses?.name || 'No Warehouse'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isCriticallyLow ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                        <AlertTriangle size={12} /> Critical
                      </span>
                    ) : isLowStock ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-warn">
                        <AlertTriangle size={12} /> Low Stock
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                        <CheckCircle size={12} /> Adequate
                      </span>
                    )}
                  </div>
                </div>

                {/* Stock Stats Grid */}
                <div className="grid grid-cols-3 gap-2 border-t border-border mt-3 pt-3 text-center">
                  <div className="bg-surface rounded p-1.5">
                    <span className="text-[9px] mono-label block">In Stock</span>
                    <span className="text-[13px] font-semibold text-foreground mt-0.5 block">
                      {i.current_stock} <span className="text-[10px] text-muted-foreground font-normal">{i.unit}</span>
                    </span>
                  </div>
                  <div className="bg-surface rounded p-1.5">
                    <span className="text-[9px] mono-label block">Reorder</span>
                    <span className="text-[13px] font-semibold text-foreground mt-0.5 block">
                      {i.reorder_level}
                    </span>
                  </div>
                  <div className="bg-surface rounded p-1.5">
                    <span className="text-[9px] mono-label block">Safety</span>
                    <span className="text-[13px] font-semibold text-foreground mt-0.5 block">
                      {i.safety_stock}
                    </span>
                  </div>
                </div>

                {/* Extra Stats */}
                <div className="grid grid-cols-2 gap-2 mt-2 text-[11px] text-muted-foreground">
                  <div>
                    <span>Production/Mo:</span> <span className="text-foreground font-medium">{i.monthly_production || 0}</span>
                  </div>
                  <div>
                    <span>Price:</span> <span className="text-foreground font-medium">Rs. {i.price ?? 100} / {i.unit}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 border-t border-border mt-3 pt-3">
                  <button
                    onClick={() => openEdit(i)}
                    disabled={isBusy}
                    className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(i.id)}
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

      {/* Add SKU Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">Add Inventory SKU</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3.5">
              <div>
                <div className="mono-label mb-1">SKU Name / Material</div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Titanium Alloy Sheet"
                  className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mono-label mb-1">Measurement Unit</div>
                  <input
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. kg, unit, liter"
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Warehouse Location</div>
                  <select
                    required
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  >
                    <option value="">Select facility...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="mono-label mb-1">Current Stock</div>
                  <input
                    type="number"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2 py-1 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Reorder Level</div>
                  <input
                    type="number"
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2 py-1 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Safety Stock</div>
                  <input
                    type="number"
                    value={safetyStock}
                    onChange={(e) => setSafetyStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2 py-1 text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="mono-label mb-1">Price (Rs.)</div>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Facility Capacity</div>
                  <input
                    type="number"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Est. Production/Mo</div>
                  <input
                    type="number"
                    value={monthlyProd}
                    onChange={(e) => setMonthlyProd(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              {formErr && <div className="text-[12px] text-destructive">{formErr}</div>}

              <button
                type="submit"
                disabled={formBusy}
                className="w-full bg-foreground text-background py-2.5 rounded text-[13px] font-medium hover:opacity-90 disabled:opacity-60"
              >
                {formBusy ? 'Creating SKU...' : 'Add SKU Node'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit SKU Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-sm rounded-md border border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-2">
              <h3 className="text-[15px] font-display font-medium">Edit Inventory SKU</h3>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3.5">
              <div>
                <div className="mono-label mb-1">SKU Name / Material</div>
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
                  <div className="mono-label mb-1">Measurement Unit</div>
                  <input
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Warehouse Location</div>
                  <select
                    required
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="mono-label mb-1">Current Stock</div>
                  <input
                    type="number"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2 py-1 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Reorder Level</div>
                  <input
                    type="number"
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2 py-1 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Safety Stock</div>
                  <input
                    type="number"
                    value={safetyStock}
                    onChange={(e) => setSafetyStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2 py-1 text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="mono-label mb-1">Price (Rs.)</div>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Facility Capacity</div>
                  <input
                    type="number"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <div className="mono-label mb-1">Est. Production/Mo</div>
                  <input
                    type="number"
                    value={monthlyProd}
                    onChange={(e) => setMonthlyProd(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full border border-border bg-background rounded px-2.5 py-1.5 text-[13px]"
                  />
                </div>
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
