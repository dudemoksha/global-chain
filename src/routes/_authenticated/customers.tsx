import { createFileRoute, Link } from "@tanstack/react-router";
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listMyCustomers,
  sendTradeRequest,
} from "@/lib/trade-requests.functions";
import { OrgAutocomplete } from "./suppliers";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const customersQuery = queryOptions({
  queryKey: ["customers", "mine"],
  queryFn: () => listMyCustomers(),
});

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers · Global-Chain" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(meQuery),
      context.queryClient.ensureQueryData(customersQuery),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-xl px-6 py-24 text-[13px] text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10">Not found.</div>,
  component: CustomersPage,
});

function CustomersPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: rows } = useSuspenseQuery(customersQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.customer?.legal_name?.toLowerCase().includes(q) ||
        r.customer?.hq_country?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const countries = new Set(rows.map((r) => r.customer?.hq_country).filter(Boolean)).size;
    const categories = new Set(rows.map((r) => r.category).filter(Boolean)).size;
    return { total: rows.length, countries, categories };
  }, [rows]);

  if (!me.profile?.is_approved && !me.isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <div className="mono-label !text-primary">§ Under review</div>
        <h1 className="mt-3 font-display text-[28px] font-medium">
          Customers unlock once the trust desk approves your organisation.
        </h1>
        <Link to="/dashboard" className="mt-6 inline-flex text-[13px] font-medium text-primary">
          Back to dashboard →
        </Link>
      </div>
    );
  }

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1240px] px-6 pb-8 pt-10">
          <div className="mono-label">§ Selling</div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="font-display text-[32px] font-medium tracking-tight">
                Customers who buy from you
              </h1>
              <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
                Every organisation that has declared you as their supplier appears here.
                You can also propose to sell to any Global-Chain organisation — they'll
                be added once they accept.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90"
            >
              + Propose to a customer
            </button>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard k="Customers" v={String(stats.total)} />
            <StatCard k="Countries" v={String(stats.countries)} />
            <StatCard k="Categories" v={String(stats.categories)} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-6 py-10">
        <div className="mb-4 flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, country or category"
            className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground"
          />
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {["Customer", "Category they buy", "Since", "Notes"].map((h, i) => (
                  <th key={i} className="mono-label px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-16 text-center text-muted-foreground">
                    {rows.length === 0
                      ? "No customers yet — propose to one, or wait for an incoming trade request to be accepted."
                      : "No customers match your search."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium">{r.customer?.legal_name || "—"}</div>
                    <div className="mono-label mt-1">
                      {[r.customer?.hq_country, r.customer?.industry].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">{r.category || "—"}</td>
                  <td className="px-4 py-4 align-top text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4 align-top text-muted-foreground">{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <ProposeCustomerDialog
          onClose={() => setOpen(false)}
          onSent={async () => {
            setOpen(false);
            await qc.invalidateQueries({ queryKey: ["requests"] });
          }}
        />
      )}
    </AppShell>
  );
}

function StatCard({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mono-label">{k}</div>
      <div className="mt-2 font-display text-[28px] font-medium">{v}</div>
    </div>
  );
}

function ProposeCustomerDialog({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) {
      setErr("Pick a customer organisation from the dropdown.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await sendTradeRequest({
        data: {
          to_org_id: orgId,
          direction: "sell",
          product,
          quantity,
          category,
          message,
        },
      });
      setOk(true);
      setTimeout(onSent, 900);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send proposal");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/20 p-6 backdrop-blur-[1px]">
      <div className="w-full max-w-2xl rounded-md border border-border bg-background shadow-xl animate-rise">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="mono-label">§ Propose to a customer</span>
          <button type="button" onClick={onClose} className="text-[13px] text-muted-foreground hover:text-foreground">
            Close ✕
          </button>
        </header>
        {ok ? (
          <div className="p-8 text-center">
            <div className="mono-label !text-primary">§ Sent</div>
            <p className="mt-3 text-[14px]">
              Your proposal is on its way. They'll show up here once they accept.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="mono-label mb-1.5">Customer organisation</div>
              <OrgAutocomplete onPick={(o) => setOrgId(o.id)} />
            </div>
            <label className="block sm:col-span-2">
              <div className="mono-label mb-1.5">Product / SKU you're offering</div>
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. Grade-A cotton yarn, 25 µm aluminium foil"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground"
              />
            </label>
            <label className="block">
              <div className="mono-label mb-1.5">Quantity available</div>
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="10,000 units / 500 kg"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground"
              />
            </label>
            <label className="block">
              <div className="mono-label mb-1.5">Category</div>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Textiles / Packaging / …"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground"
              />
            </label>
            <label className="block sm:col-span-2">
              <div className="mono-label mb-1.5">Message (optional)</div>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Lead time, pricing, MOQ…"
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground"
              />
            </label>
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
                disabled={busy || !orgId || product.trim().length < 1}
                className="rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send proposal →"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
