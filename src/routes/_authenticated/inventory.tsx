import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import {
  createInventory,
  getInventoryRisks,
  listInventory,
  removeInventory,
  updateInventory,
  type InventoryRow,
  type WarehouseRisk,
} from "@/lib/inventory.functions";
import {
  addWarehouse,
  listWarehouses,
  removeWarehouse,
  searchAddresses,
  type WarehouseDTO,
} from "@/lib/warehouses.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const invQuery = queryOptions({ queryKey: ["inventory"], queryFn: () => listInventory() });
const whQuery = queryOptions({ queryKey: ["warehouses"], queryFn: () => listWarehouses() });
const riskQuery = queryOptions({
  queryKey: ["inventory-risks"],
  queryFn: () => getInventoryRisks(),
  staleTime: 5 * 60_000,
});

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "My SKUs · Global-Chain" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(invQuery).catch(() => []),
      context.queryClient.ensureQueryData(whQuery).catch(() => []),
      context.queryClient.ensureQueryData(riskQuery).catch(() => []),
    ]);
    return null;
  },
  component: InventoryPage,
});

const UNIT_GROUPS: Array<{ label: string; units: string[] }> = [
  { label: "Count", units: ["unit", "pcs", "pair", "dozen", "gross"] },
  { label: "Weight", units: ["mg", "g", "kg", "ton", "oz", "lb"] },
  { label: "Volume", units: ["ml", "l", "m³", "ft³", "gal"] },
  { label: "Length", units: ["mm", "cm", "m", "km", "in", "ft"] },
  { label: "Area", units: ["cm²", "m²", "ft²"] },
  { label: "Packaging", units: ["box", "carton", "case", "pallet", "bag", "roll", "sheet", "drum", "barrel", "container"] },
];

function InventoryPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: rows } = useSuspenseQuery(invQuery);
  const { data: warehouses } = useSuspenseQuery(whQuery);
  const { data: risks } = useSuspenseQuery(riskQuery);
  const qc = useQueryClient();
  const [skuOpen, setSkuOpen] = useState(false);
  const [whOpen, setWhOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryRow | null>(null);

  const riskByWh = useMemo(() => {
    const m = new Map<string, WarehouseRisk>();
    risks.forEach((r) => m.set(r.warehouse_id, r));
    return m;
  }, [risks]);

  const create = useMutation({
    mutationFn: (v: Parameters<typeof createInventory>[0]["data"]) => createInventory({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-risks"] });
      setSkuOpen(false);
    },
  });
  const update = useMutation({
    mutationFn: (v: Parameters<typeof updateInventory>[0]["data"]) => updateInventory({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      setEditing(null);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => removeInventory({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const atRisk = rows.filter((r) => {
    const rr = r.warehouse_id ? riskByWh.get(r.warehouse_id) : null;
    return rr && (rr.severity === "high" || rr.severity === "critical");
  }).length;

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mono-label">§ Warehouses</div>
            <h1 className="mt-2 font-display text-[32px] font-medium tracking-tight">My SKUs</h1>
            <p className="mt-2 text-[13.5px] text-muted-foreground max-w-xl">
              Products you supply, mapped to real warehouse locations. Risk is computed
              live from geopolitical, seismic and conflict signals near each site.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setWhOpen(true)}
              className="rounded-md border border-border px-3.5 py-2 text-[13px]"
            >
              Manage warehouses ({warehouses.length})
            </button>
            <button
              type="button"
              onClick={() => setSkuOpen(true)}
              disabled={warehouses.length === 0}
              className="rounded-md bg-foreground px-3.5 py-2 text-[13px] font-medium text-background disabled:opacity-40"
              title={warehouses.length === 0 ? "Add a warehouse first" : ""}
            >
              + Add SKU
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <StatCard k="SKUs tracked" v={rows.length.toString()} />
          <StatCard k="Warehouses" v={warehouses.length.toString()} />
          <StatCard k="SKUs at elevated risk" v={atRisk.toString()} emphasis={atRisk > 0} />
        </div>

        <div className="mt-8 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {["SKU", "Item", "Warehouse", "Capacity", "Monthly", "Live risk", ""].map((h) => (
                  <th key={h} className="mono-label px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                    No SKUs recorded. {warehouses.length === 0 && "Add a warehouse first."}
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const risk = r.warehouse_id ? riskByWh.get(r.warehouse_id) : null;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-[12.5px]">{r.sku}</td>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3">
                      {r.warehouse_name ? (
                        <>
                          <div>{r.warehouse_name}</div>
                          <div className="text-[11.5px] text-muted-foreground">
                            {[r.warehouse_city, r.warehouse_country].filter(Boolean).join(", ") || "—"}
                          </div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.warehouse_capacity.toLocaleString()}{" "}
                      <span className="text-muted-foreground">{r.unit}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {r.monthly_production.toLocaleString()}{" "}
                      <span className="text-muted-foreground">{r.unit}</span>
                    </td>
                    <td className="px-4 py-3">
                      <RiskPill risk={risk} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(r)} className="text-[12px] text-muted-foreground hover:text-foreground mr-3">
                        Edit
                      </button>
                      <button onClick={() => del.mutate(r.id)} className="text-[12px] text-muted-foreground hover:text-destructive">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {skuOpen && (
          <SkuForm
            warehouses={warehouses}
            onCancel={() => setSkuOpen(false)}
            onSubmit={(v) => create.mutate(v)}
            busy={create.isPending}
          />
        )}
        {editing && (
          <SkuForm
            warehouses={warehouses}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={(v) => update.mutate({ id: editing.id, ...v })}
            busy={update.isPending}
          />
        )}
        {whOpen && (
          <WarehouseManager
            items={warehouses}
            onClose={() => setWhOpen(false)}
          />
        )}
      </div>
    </AppShell>
  );
}

function RiskPill({ risk }: { risk: WarehouseRisk | null | undefined }) {
  if (!risk) return <span className="text-[11.5px] text-muted-foreground">No warehouse</span>;
  const cls =
    risk.severity === "critical" ? "bg-destructive/15 text-destructive border-destructive/30" :
    risk.severity === "high" ? "bg-warn/15 text-warn-foreground border-warn/40" :
    risk.severity === "medium" ? "bg-accent text-accent-foreground border-border" :
    "bg-surface text-muted-foreground border-border";
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
        {risk.severity} · {risk.score}
      </span>
      {risk.top_headline && (
        <span className="text-[11px] text-muted-foreground truncate max-w-[240px]" title={risk.top_headline}>
          {risk.top_headline}
        </span>
      )}
    </div>
  );
}

function StatCard({ k, v, emphasis }: { k: string; v: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-md border p-5 ${emphasis ? "border-primary/40 bg-accent" : "border-border bg-card"}`}>
      <div className="mono-label">{k}</div>
      <div className="mt-2 font-display text-[26px] font-medium tabular-nums">{v}</div>
    </div>
  );
}

/* ---------------- SKU form ---------------- */

type SkuValues = {
  name: string; unit: string; warehouse_id: string;
  warehouse_capacity: number; monthly_production: number;
};

function SkuForm({
  warehouses, initial, onCancel, onSubmit, busy,
}: {
  warehouses: WarehouseDTO[];
  initial?: InventoryRow;
  onCancel: () => void;
  onSubmit: (v: SkuValues) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "unit");
  const [warehouseId, setWarehouseId] = useState(initial?.warehouse_id ?? warehouses[0]?.id ?? "");
  const [capacity, setCapacity] = useState(String(initial?.warehouse_capacity ?? 0));
  const [monthly, setMonthly] = useState(String(initial?.monthly_production ?? 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!warehouseId) return;
          onSubmit({
            name: name.trim(), unit,
            warehouse_id: warehouseId,
            warehouse_capacity: +capacity || 0,
            monthly_production: +monthly || 0,
          });
        }}
        className="w-full max-w-lg rounded-md border border-border bg-card p-6"
      >
        <div className="mono-label">§ SKU</div>
        <h2 className="mt-1 font-display text-[22px] font-medium">
          {initial ? "Edit SKU" : "Add SKU"}
        </h2>
        {initial && (
          <div className="mt-2 text-[12px] text-muted-foreground">
            SKU code: <span className="font-mono">{initial.sku}</span>
          </div>
        )}
        {!initial && (
          <div className="mt-2 text-[12px] text-muted-foreground">
            A unique SKU code will be generated automatically.
          </div>
        )}

        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="mono-label">Item name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="fld" />
          </label>

          <label className="block">
            <span className="mono-label">Warehouse</span>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="fld" required>
              {warehouses.length === 0 && <option value="">— add a warehouse first —</option>}
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {[w.city, w.country].filter(Boolean).join(", ")}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mono-label">Unit of measure</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="fld">
              {UNIT_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.units.map((u) => <option key={u} value={u}>{u}</option>)}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mono-label">Warehouse capacity</span>
              <input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="fld" />
            </label>
            <label className="block">
              <span className="mono-label">Monthly production</span>
              <input type="number" min={0} value={monthly} onChange={(e) => setMonthly(e.target.value)} className="fld" />
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-[13px]">Cancel</button>
          <button disabled={busy} className="rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        <style>{`.fld{width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:13.5px;background:transparent}.fld:focus{outline:none;border-color:var(--border-strong)}`}</style>
      </form>
    </div>
  );
}

/* ---------------- Warehouse manager ---------------- */

function WarehouseManager({ items, onClose }: { items: WarehouseDTO[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("0");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{
    id: string; label: string; lat: number; lng: number; city: string; country: string;
  }>>([]);
  const [picked, setPicked] = useState<null | {
    label: string; lat: number; lng: number; city: string; country: string;
  }>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runSearch() {
    if (query.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await searchAddresses({ data: { q: query.trim() } });
      setSuggestions(res);
    } finally {
      setSearching(false);
    }
  }

  const add = useMutation({
    mutationFn: () => {
      if (!picked) throw new Error("Select a real address from the suggestions.");
      return addWarehouse({
        data: {
          name: name.trim() || picked.label.split(",")[0],
          address: picked.label,
          city: picked.city,
          country: picked.country,
          lat: picked.lat,
          lng: picked.lng,
          capacity_units: +capacity || 0,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["inventory-risks"] });
      setName(""); setCapacity("0"); setQuery(""); setPicked(null); setSuggestions([]); setErr(null);
    },
    onError: (e: Error) => setErr(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => removeWarehouse({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <div className="w-full max-w-2xl rounded-md border border-border bg-card p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <div className="mono-label">§ Locations</div>
            <h2 className="mt-1 font-display text-[22px] font-medium">Manage warehouses</h2>
          </div>
          <button onClick={onClose} className="text-[12px] text-muted-foreground hover:text-foreground">Close</button>
        </div>

        <div className="mt-5 rounded-md border border-border p-4">
          <div className="mono-label mb-2">§ Add warehouse</div>
          <div className="grid gap-3">
            <label className="block">
              <span className="mono-label">Warehouse name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rotterdam DC-1" className="fld" />
            </label>
            <div>
              <span className="mono-label">Address · real location</span>
              <div className="mt-1 flex gap-2">
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
                  placeholder="street, city, country"
                  className="fld flex-1"
                />
                <button type="button" onClick={runSearch} disabled={searching || query.trim().length < 3}
                  className="rounded-md border border-border px-3 py-1.5 text-[13px] disabled:opacity-40">
                  {searching ? "…" : "Search"}
                </button>
              </div>
              {suggestions.length > 0 && !picked && (
                <ul className="mt-2 max-h-52 overflow-y-auto rounded-md border border-border">
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => { setPicked(s); setSuggestions([]); }}
                        className="w-full px-3 py-2 text-left text-[13px] hover:bg-accent border-b border-border last:border-0"
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {picked && (
                <div className="mt-2 rounded-md border border-border bg-surface px-3 py-2 text-[12.5px]">
                  <div className="font-medium">{picked.label}</div>
                  <div className="text-muted-foreground text-[11.5px]">
                    {picked.lat.toFixed(3)}, {picked.lng.toFixed(3)}
                  </div>
                </div>
              )}
            </div>
            <label className="block">
              <span className="mono-label">Capacity (units)</span>
              <input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="fld" />
            </label>
            {err && <div className="text-[12px] text-destructive">{err}</div>}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!picked || add.isPending}
                onClick={() => add.mutate()}
                className="rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background disabled:opacity-40"
              >
                {add.isPending ? "Adding…" : "Add warehouse"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mono-label mb-2">§ Existing ({items.length})</div>
          {items.length === 0 && (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
              No warehouses yet. Add one above.
            </div>
          )}
          <ul className="divide-y divide-border rounded-md border border-border">
            {items.map((w) => (
              <li key={w.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <div className="text-[13.5px] font-medium">{w.name}</div>
                  <div className="text-[12px] text-muted-foreground">{w.address}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {[w.city, w.country].filter(Boolean).join(", ")}
                    {w.lat != null && w.lng != null && ` · ${w.lat.toFixed(2)}, ${w.lng.toFixed(2)}`}
                    {" · "}capacity {w.capacity_units.toLocaleString()}
                  </div>
                </div>
                <button onClick={() => del.mutate(w.id)} className="text-[12px] text-muted-foreground hover:text-destructive">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
        <style>{`.fld{width:100%;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:13.5px;background:transparent}.fld:focus{outline:none;border-color:var(--border-strong)}`}</style>
      </div>
    </div>
  );
}
