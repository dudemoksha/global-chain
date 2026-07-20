import { createFileRoute, Link } from "@tanstack/react-router";
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import {
  listMySuppliers,
  removeSupplier,
} from "@/lib/suppliers.functions";
import {
  searchOrganizations,
  sendTradeRequest,
} from "@/lib/trade-requests.functions";
import { getMyProfile } from "@/lib/profile.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const listQuery = queryOptions({
  queryKey: ["suppliers", "mine"],
  queryFn: () => listMySuppliers(),
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
    ]);
  },
  component: SuppliersPage,
});

type Criticality = "low" | "medium" | "high" | "critical";

function SuppliersPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: rows } = useSuspenseQuery(listQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [critFilter, setCritFilter] = useState<"all" | Criticality>("all");

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["suppliers", "mine"] });
  }

  async function onRemove(id: string) {
    await removeSupplier({ data: { id } });
    await refresh();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (critFilter !== "all" && r.criticality !== critFilter) return false;
      if (!q) return true;
      return (
        r.organizations?.display_name?.toLowerCase().includes(q) ||
        r.organizations?.country?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, critFilter]);

  const stats = useMemo(() => {
    const critical = rows.filter((r) => r.criticality === "critical").length;
    const countries = new Set(
      rows.map((r) => r.organizations?.country).filter(Boolean),
    ).size;
    const categories = new Set(rows.map((r) => r.category).filter(Boolean)).size;
    return { total: rows.length, critical, countries, categories };
  }, [rows]);

  if (!me.profile?.is_approved && !me.isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <div className="mono-label !text-primary">§ Under review</div>
        <h1 className="mt-3 font-display text-[28px] font-medium">
          Suppliers unlock once the trust desk approves your organisation.
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
          <div className="mono-label">§ Buying</div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="font-display text-[32px] font-medium tracking-tight">
                Suppliers you buy from
              </h1>
              <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
                Send a request to any organisation on Global-Chain. Once they
                accept, they appear here — and you appear in their Customers list.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90"
            >
              + Request a supplier
            </button>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard k="Suppliers" v={String(stats.total)} />
            <StatCard k="Critical deps" v={String(stats.critical)} emphasis={stats.critical > 0} />
            <StatCard k="Countries" v={String(stats.countries)} />
            <StatCard k="Categories" v={String(stats.categories)} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-6 py-10">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, country or category"
            className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground"
          />
          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            {(["all", "low", "medium", "high", "critical"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCritFilter(c)}
                className={`rounded-sm px-2.5 py-1 text-[12px] font-medium capitalize transition-colors ${
                  critFilter === c
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {["Supplier", "Category", "Criticality", "Spend / Lead time", ""].map((h, i) => (
                  <th key={i} className="mono-label px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                    {rows.length === 0
                      ? "No suppliers yet — request one, or check pending requests under Requests."
                      : "No suppliers match your filters."}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium">{r.organizations?.display_name ?? "—"}</div>
                    <div className="mono-label mt-1">
                      {[r.organizations?.country, r.organizations?.industry].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">{r.category || "—"}</td>
                  <td className="px-4 py-4 align-top"><CriticalityPill c={r.criticality as Criticality} /></td>
                  <td className="px-4 py-4 align-top">
                    <div>{r.annual_spend_bucket || "—"}</div>
                    <div className="text-[12px] text-muted-foreground">
                      {r.lead_time_days ? `${r.lead_time_days} day lead` : ""}
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
      </div>

      {open && (
        <RequestSupplierDialog
          onClose={() => setOpen(false)}
          onSent={async () => {
            setOpen(false);
            await refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function StatCard({ k, v, emphasis }: { k: string; v: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-md border p-5 ${emphasis ? "border-primary/40 bg-accent" : "border-border bg-card"}`}>
      <div className="mono-label">{k}</div>
      <div className="mt-2 font-display text-[28px] font-medium">{v}</div>
    </div>
  );
}

function CriticalityPill({ c }: { c: Criticality }) {
  const map: Record<Criticality, { label: string; dot: string; border: string }> = {
    low: { label: "Low", dot: "bg-muted-foreground", border: "border-border" },
    medium: { label: "Medium", dot: "bg-primary", border: "border-border" },
    high: { label: "High", dot: "bg-warn", border: "border-border" },
    critical: { label: "Critical", dot: "bg-destructive", border: "border-destructive/40" },
  };
  const s = map[c];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${s.border} px-2 py-0.5 text-[11px] font-medium`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

type OrgHit = { id: string; display_name: string; country: string; industry: string };

export function OrgAutocomplete({
  onPick,
  placeholder = "Start typing an organisation name…",
}: {
  onPick: (org: OrgHit) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OrgHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [picked, setPicked] = useState<OrgHit | null>(null);

  useEffect(() => {
    if (picked && q === picked.display_name) return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await searchOrganizations({ data: { q: q.trim() } });
        setHits(res as OrgHit[]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, picked]);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPicked(null);
        }}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground"
      />
      {open && (hits.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card shadow-lg animate-rise">
          {loading && <div className="px-3 py-2 text-[12px] text-muted-foreground">Searching…</div>}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setPicked(h);
                setQ(h.display_name);
                setOpen(false);
                onPick(h);
              }}
              className="block w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface"
            >
              <div className="text-[13.5px] font-medium">{h.display_name}</div>
              <div className="mono-label mt-0.5">
                {[h.country, h.industry].filter(Boolean).join(" · ") || "—"}
              </div>
            </button>
          ))}
          {!loading && hits.length === 0 && q.trim().length >= 2 && (
            <div className="px-3 py-3 text-[12.5px] text-muted-foreground">
              No matches — that organisation isn't on Global-Chain yet.
            </div>
          )}
        </div>
      )}
      {picked && (
        <div className="mt-2 rounded-md border border-primary/30 bg-accent px-3 py-2 text-[12.5px]">
          Selected: <span className="font-medium">{picked.display_name}</span>
          <span className="text-muted-foreground"> — {[picked.country, picked.industry].filter(Boolean).join(" · ") || "no metadata"}</span>
        </div>
      )}
    </div>
  );
}

function RequestSupplierDialog({
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
      setErr("Pick an organisation from the dropdown first.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await sendTradeRequest({
        data: {
          to_org_id: orgId,
          direction: "buy",
          product,
          quantity,
          category,
          message,
        },
      });
      setOk(true);
      setTimeout(onSent, 900);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to send request");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/20 p-6 backdrop-blur-[1px]">
      <div className="w-full max-w-2xl rounded-md border border-border bg-background shadow-xl animate-rise">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="mono-label">§ Request a supplier</span>
          <button type="button" onClick={onClose} className="text-[13px] text-muted-foreground hover:text-foreground">
            Close ✕
          </button>
        </header>
        {ok ? (
          <div className="p-8 text-center">
            <div className="mono-label !text-primary">§ Sent</div>
            <p className="mt-3 text-[14px]">
              Your request is on its way. It will appear in your Suppliers list once they accept.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="mono-label mb-1.5">Supplier organisation</div>
              <OrgAutocomplete onPick={(o) => setOrgId(o.id)} />
              <p className="mt-2 text-[12px] text-muted-foreground">
                Only organisations that already have an approved Global-Chain account can receive requests.
              </p>
            </div>
            <label className="block sm:col-span-2">
              <div className="mono-label mb-1.5">Product / SKU you need</div>
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. 4-layer PCB, food-grade steel drum"
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground"
              />
            </label>
            <label className="block">
              <div className="mono-label mb-1.5">Quantity</div>
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
                placeholder="Electronics / Packaging / …"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground"
              />
            </label>
            <label className="block sm:col-span-2">
              <div className="mono-label mb-1.5">Message (optional)</div>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Delivery timelines, quality specs, contract terms…"
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
                {busy ? "Sending…" : "Send request →"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
