import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { Mark } from "@/components/site/mark";
import { supabase } from "@/integrations/supabase/client";
import {
  addSupplier,
  getMySupplyGraph,
  listMySuppliers,
  removeSupplier,
} from "@/lib/suppliers.functions";
import { getMyProfile } from "@/lib/profile.functions";

const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: () => getMyProfile(),
});
const listQuery = queryOptions({
  queryKey: ["suppliers", "mine"],
  queryFn: () => listMySuppliers(),
});
const graphQuery = queryOptions({
  queryKey: ["suppliers", "graph"],
  queryFn: () => getMySupplyGraph(),
});

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers · Global-Chain" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(meQuery),
      context.queryClient.ensureQueryData(listQuery),
      context.queryClient.ensureQueryData(graphQuery),
    ]);
  },
  component: SuppliersPage,
});

type Criticality = "low" | "medium" | "high" | "critical";

function SuppliersPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: rows } = useSuspenseQuery(listQuery);
  const { data: graph } = useSuspenseQuery(graphQuery);
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const tier2 = graph.filter((n) => n.tier === 2);
  const tier2Distinct = new Map<string, (typeof tier2)[number]>();
  tier2.forEach((n) => tier2Distinct.set(n.supplier_org_id, n));

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["suppliers", "mine"] }),
      qc.invalidateQueries({ queryKey: ["suppliers", "graph"] }),
    ]);
  }

  async function onRemove(id: string) {
    await removeSupplier({ data: { id } });
    await refresh();
  }

  if (!me.profile?.is_approved && !me.isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <div className="mono-label !text-primary">§ Under review</div>
        <h1 className="mt-3 font-display text-[28px] font-medium">
          Suppliers unlock once the trust desk approves your organisation.
        </h1>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex text-[13px] font-medium text-primary"
        >
          Back to dashboard →
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-6">
          <Link to="/dashboard">
            <Mark />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              to="/dashboard"
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              Dashboard
            </Link>
            <Link
              to="/suppliers"
              className="text-[13px] font-medium"
              activeProps={{ className: "text-primary" }}
            >
              Suppliers
            </Link>
            {me.isAdmin && (
              <Link
                to="/admin/requests"
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
              >
                Admin
              </Link>
            )}
          </nav>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1240px] px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mono-label">§ Directory</div>
            <h1 className="mt-3 font-display text-[32px] font-medium tracking-tight">
              Your supplier network
            </h1>
            <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
              Declare the organisations you buy from. When another operator on
              Global-Chain declares one of them, we resolve the hidden
              downstream tier — without exposing who told us.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90"
          >
            + Add supplier
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard k="Tier-1 suppliers" v={rows.length.toString()} />
          <StatCard
            k="Tier-2 exposure"
            v={tier2Distinct.size.toString()}
            hint={
              tier2Distinct.size > 0
                ? "Resolved via linked operators"
                : "None yet — grows as more of your suppliers join"
            }
            emphasis={tier2Distinct.size > 0}
          />
          <StatCard
            k="Critical dependencies"
            v={rows
              .filter((r) => r.criticality === "critical")
              .length.toString()}
          />
        </div>

        <div className="mt-10 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {[
                  "Organisation",
                  "Category",
                  "Criticality",
                  "Spend / Lead time",
                  "",
                ].map((h) => (
                  <th key={h} className="mono-label px-4 py-2.5 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-16 text-center text-muted-foreground"
                  >
                    No suppliers yet — add your first tier-1 partner to begin
                    building your graph.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium">
                      {r.organizations?.display_name ?? "—"}
                    </div>
                    <div className="mono-label mt-1">
                      {[r.organizations?.country, r.organizations?.industry]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">{r.category || "—"}</td>
                  <td className="px-4 py-4 align-top">
                    <CriticalityPill c={r.criticality as Criticality} />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div>{r.annual_spend_bucket || "—"}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {r.lead_time_days
                        ? `${r.lead_time_days} day lead`
                        : ""}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right align-top">
                    <button
                      type="button"
                      onClick={() => onRemove(r.id)}
                      className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:border-destructive hover:text-destructive"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {tier2Distinct.size > 0 && (
          <div className="mt-12">
            <div className="mono-label">§ Hidden linkage · Tier 2</div>
            <h2 className="mt-2 font-display text-[22px] font-medium tracking-tight">
              Downstream nodes we resolved for you
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              These are organisations your suppliers depend on. You do not see
              which of your suppliers declared them.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...tier2Distinct.values()].map((n) => (
                <div
                  key={n.supplier_org_id}
                  className="rounded-md border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{n.supplier_name}</div>
                      <div className="mono-label mt-1">
                        {[n.supplier_country, n.supplier_industry]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                    <CriticalityPill c={n.criticality as Criticality} />
                  </div>
                  {n.category && (
                    <div className="mt-3 text-[12px] text-muted-foreground">
                      As: {n.category}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {open && (
        <AddSupplierDialog
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  k,
  v,
  hint,
  emphasis,
}: {
  k: string;
  v: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-5 ${
        emphasis
          ? "border-primary/40 bg-accent"
          : "border-border bg-card"
      }`}
    >
      <div className="mono-label">{k}</div>
      <div className="mt-2 font-display text-[28px] font-medium">{v}</div>
      {hint && (
        <div className="mt-2 text-[12px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function CriticalityPill({ c }: { c: Criticality }) {
  const map: Record<Criticality, { label: string; dot: string; border: string }> = {
    low: { label: "Low", dot: "bg-muted-foreground", border: "border-border" },
    medium: { label: "Medium", dot: "bg-primary", border: "border-border" },
    high: { label: "High", dot: "bg-warn", border: "border-border" },
    critical: {
      label: "Critical",
      dot: "bg-destructive",
      border: "border-destructive/40",
    },
  };
  const s = map[c];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${s.border} px-2 py-0.5 text-[11px] font-medium`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function AddSupplierDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    legal_name: "",
    country: "",
    industry: "",
    category: "",
    criticality: "medium" as Criticality,
    annual_spend_bucket: "",
    lead_time_days: "",
    notes: "",
  });

  const set =
    <K extends keyof typeof form>(k: K) =>
    (v: (typeof form)[K]) =>
      setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await addSupplier({
        data: {
          legal_name: form.legal_name,
          country: form.country,
          industry: form.industry,
          category: form.category,
          criticality: form.criticality,
          annual_spend_bucket: form.annual_spend_bucket,
          lead_time_days: form.lead_time_days
            ? Number(form.lead_time_days)
            : null,
          notes: form.notes,
        },
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add supplier");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/20 p-6 backdrop-blur-[1px]">
      <div className="w-full max-w-2xl rounded-md border border-border bg-background shadow-xl animate-rise">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="mono-label">§ New tier-1 supplier</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            Close ✕
          </button>
        </header>
        <form onSubmit={submit} className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2">
          <F
            className="sm:col-span-2"
            label="Supplier legal name"
            value={form.legal_name}
            onChange={set("legal_name")}
            placeholder="Foxconn Technology Group"
            required
          />
          <F
            label="Country"
            value={form.country}
            onChange={set("country")}
            placeholder="Taiwan"
          />
          <F
            label="Industry"
            value={form.industry}
            onChange={set("industry")}
            placeholder="Electronics manufacturing"
          />
          <F
            label="Category / what they supply"
            value={form.category}
            onChange={set("category")}
            placeholder="Semiconductor assembly"
            className="sm:col-span-2"
          />
          <div>
            <div className="mono-label mb-1.5">Criticality</div>
            <div className="grid grid-cols-4 gap-1 rounded-md border border-border p-1">
              {(["low", "medium", "high", "critical"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("criticality")(c)}
                  className={`rounded-sm px-2 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                    form.criticality === c
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <F
            label="Annual spend bucket"
            value={form.annual_spend_bucket}
            onChange={set("annual_spend_bucket")}
            placeholder="$1M – $10M"
          />
          <F
            label="Lead time (days)"
            type="number"
            value={form.lead_time_days}
            onChange={set("lead_time_days")}
            placeholder="45"
          />
          <div className="sm:col-span-2">
            <div className="mono-label mb-1.5">Notes (optional)</div>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              placeholder="Contract terms, backup posture, anything worth knowing."
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
            />
          </div>
          {err && (
            <div className="sm:col-span-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
              {err}
            </div>
          )}
          <div className="sm:col-span-2 flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || form.legal_name.trim().length < 2}
              className="rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Add supplier →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function F({
  label,
  value,
  onChange,
  placeholder,
  className = "",
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      <div className="mono-label mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
      />
    </label>
  );
}
