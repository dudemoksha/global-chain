import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import {
  addFactory,
  listFactories,
  removeFactory,
} from "@/lib/factories.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const facQuery = queryOptions({ queryKey: ["factories"], queryFn: () => listFactories() });

export const Route = createFileRoute("/_authenticated/factories")({
  head: () => ({ meta: [{ title: "Factories · Global-Chain" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    await context.queryClient.ensureQueryData(facQuery).catch(() => []);
    return null;
  },
  component: FactoriesPage,
});

function FactoriesPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: rows } = useSuspenseQuery(facQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const add = useMutation({
    mutationFn: (input: Parameters<typeof addFactory>[0] extends { data: infer T } ? T : never) =>
      addFactory({ data: input as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factories"] });
      setOpen(false);
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => removeFactory({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["factories"] }),
  });

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mono-label">§ Production</div>
            <h1 className="mt-2 font-display text-[32px] font-medium tracking-tight">Factories</h1>
            <p className="mt-2 text-[13.5px] text-muted-foreground max-w-xl">
              Track your own production sites, capacity and warehouse routing.
              These records are private to your organisation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md bg-foreground px-3.5 py-2 text-[13px] font-medium text-background"
          >
            + Add factory
          </button>
        </div>

        <div className="mt-8 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {["Site", "Location", "Capacity", "Products", "Warehouse", ""].map((h) => (
                  <th key={h} className="mono-label px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                  No factories yet.
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.capacity_units.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(r.products ?? []).slice(0, 4).map((p) => (
                        <span key={p} className="rounded-sm border border-border px-1.5 py-0.5 text-[11px]">{p}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.warehouse || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => del.mutate(r.id)}
                      className="text-[12px] text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {open && (
          <FactoryForm
            onCancel={() => setOpen(false)}
            onSubmit={(v) => add.mutate(v)}
            busy={add.isPending}
          />
        )}
      </div>
    </AppShell>
  );
}

function FactoryForm({
  onCancel,
  onSubmit,
  busy,
}: {
  onCancel: () => void;
  onSubmit: (v: {
    name: string; country: string; city: string; capacity_units: number;
    products: string[]; warehouse: string;
  }) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("0");
  const [products, setProducts] = useState("");
  const [warehouse, setWarehouse] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            name: name.trim(),
            country: country.trim(),
            city: city.trim(),
            capacity_units: Number(capacity) || 0,
            products: products.split(",").map((p) => p.trim()).filter(Boolean),
            warehouse: warehouse.trim(),
          });
        }}
        className="w-full max-w-lg rounded-md border border-border bg-card p-6"
      >
        <div className="mono-label">§ New factory</div>
        <h2 className="mt-1 font-display text-[22px] font-medium">Add factory</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Site name"><input required value={name} onChange={(e) => setName(e.target.value)} className="fld" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City"><input value={city} onChange={(e) => setCity(e.target.value)} className="fld" /></Field>
            <Field label="Country"><input value={country} onChange={(e) => setCountry(e.target.value)} className="fld" /></Field>
          </div>
          <Field label="Capacity (units/day)"><input type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="fld" /></Field>
          <Field label="Products (comma-separated)"><input value={products} onChange={(e) => setProducts(e.target.value)} className="fld" /></Field>
          <Field label="Serves warehouse"><input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="fld" /></Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
