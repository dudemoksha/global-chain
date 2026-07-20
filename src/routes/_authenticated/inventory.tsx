import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listInventory,
  removeInventory,
  upsertInventory,
} from "@/lib/inventory.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const invQuery = queryOptions({ queryKey: ["inventory"], queryFn: () => listInventory() });

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory · Global-Chain" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    await context.queryClient.ensureQueryData(invQuery).catch(() => []);
    return null;
  },
  component: InventoryPage,
});

function InventoryPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: rows } = useSuspenseQuery(invQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const upsert = useMutation({
    mutationFn: (v: Parameters<typeof upsertInventory>[0] extends { data: infer T } ? T : never) =>
      upsertInventory({ data: v as any }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); setOpen(false); },
  });
  const del = useMutation({
    mutationFn: (id: string) => removeInventory({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory"] }),
  });

  const low = useMemo(
    () => rows.filter((r) => r.current_stock <= r.reorder_level),
    [rows],
  );

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mono-label">§ Warehouses</div>
            <h1 className="mt-2 font-display text-[32px] font-medium tracking-tight">Inventory</h1>
            <p className="mt-2 text-[13.5px] text-muted-foreground max-w-xl">
              Current stock levels, safety-stock thresholds and reorder triggers.
              Items at or below reorder level are flagged.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md bg-foreground px-3.5 py-2 text-[13px] font-medium text-background"
          >
            + Add / update SKU
          </button>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <StatCard k="SKUs tracked" v={rows.length.toString()} />
          <StatCard k="At or below reorder" v={low.length.toString()} emphasis={low.length > 0} />
          <StatCard
            k="Below safety stock"
            v={rows.filter((r) => r.current_stock < r.safety_stock).length.toString()}
            emphasis={rows.some((r) => r.current_stock < r.safety_stock)}
          />
        </div>

        <div className="mt-8 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {["SKU", "Item", "Warehouse", "On hand", "Safety", "Reorder", "Status", ""].map((h) => (
                  <th key={h} className="mono-label px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
                  No inventory recorded.
                </td></tr>
              )}
              {rows.map((r) => {
                const status =
                  r.current_stock < r.safety_stock ? "Critical" :
                  r.current_stock <= r.reorder_level ? "Reorder" : "OK";
                const color =
                  status === "Critical" ? "bg-destructive/15 text-destructive border-destructive/30" :
                  status === "Reorder" ? "bg-warn/15 text-warn-foreground border-warn/40" :
                  "bg-accent text-accent-foreground border-border";
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-[12.5px]">{r.sku}</td>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3">{r.warehouse || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{r.current_stock.toLocaleString()} <span className="text-muted-foreground">{r.unit}</span></td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.safety_stock.toLocaleString()}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.reorder_level.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${color}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
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

        {open && (
          <InventoryForm
            onCancel={() => setOpen(false)}
            onSubmit={(v) => upsert.mutate(v)}
            busy={upsert.isPending}
          />
        )}
      </div>
    </AppShell>
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

function InventoryForm({
  onCancel, onSubmit, busy,
}: {
  onCancel: () => void;
  onSubmit: (v: {
    sku: string; name: string; warehouse: string;
    current_stock: number; safety_stock: number; reorder_level: number; unit: string;
  }) => void;
  busy: boolean;
}) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [current, setCurrent] = useState("0");
  const [safety, setSafety] = useState("0");
  const [reorder, setReorder] = useState("0");
  const [unit, setUnit] = useState("unit");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit({
          sku: sku.trim(), name: name.trim(), warehouse: warehouse.trim(),
          current_stock: +current || 0, safety_stock: +safety || 0, reorder_level: +reorder || 0, unit: unit.trim() || "unit",
        }); }}
        className="w-full max-w-lg rounded-md border border-border bg-card p-6"
      >
        <div className="mono-label">§ Inventory item</div>
        <h2 className="mt-1 font-display text-[22px] font-medium">Add or update SKU</h2>
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="mono-label">SKU</span><input required value={sku} onChange={(e) => setSku(e.target.value)} className="fld" /></label>
            <label className="block"><span className="mono-label">Unit</span><input value={unit} onChange={(e) => setUnit(e.target.value)} className="fld" /></label>
          </div>
          <label className="block"><span className="mono-label">Item name</span><input required value={name} onChange={(e) => setName(e.target.value)} className="fld" /></label>
          <label className="block"><span className="mono-label">Warehouse</span><input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="fld" /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="mono-label">On hand</span><input type="number" min={0} value={current} onChange={(e) => setCurrent(e.target.value)} className="fld" /></label>
            <label className="block"><span className="mono-label">Safety</span><input type="number" min={0} value={safety} onChange={(e) => setSafety(e.target.value)} className="fld" /></label>
            <label className="block"><span className="mono-label">Reorder</span><input type="number" min={0} value={reorder} onChange={(e) => setReorder(e.target.value)} className="fld" /></label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-1.5 text-[13px]">Cancel</button>
          <button disabled={busy} className="rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        <style>{`.fld{width:100%;border:1px solid hsl(var(--border));border-radius:6px;padding:8px 10px;font-size:13.5px;background:transparent}`}</style>
      </form>
    </div>
  );
}
