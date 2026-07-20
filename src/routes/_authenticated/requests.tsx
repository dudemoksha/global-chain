import { createFileRoute, Link } from "@tanstack/react-router";
import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import {
  listIncomingRequests,
  listOutgoingRequests,
  respondTradeRequest,
} from "@/lib/trade-requests.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const incomingQuery = queryOptions({
  queryKey: ["requests", "incoming"],
  queryFn: () => listIncomingRequests(),
});
const outgoingQuery = queryOptions({
  queryKey: ["requests", "outgoing"],
  queryFn: () => listOutgoingRequests(),
});

export const Route = createFileRoute("/_authenticated/requests")({
  head: () => ({
    meta: [
      { title: "Requests · Global-Chain" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(meQuery),
      context.queryClient.ensureQueryData(incomingQuery),
      context.queryClient.ensureQueryData(outgoingQuery),
    ]);
  },
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-xl px-6 py-24 text-[13px] text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10">Not found.</div>,
  component: RequestsPage,
});

type Tab = "incoming" | "outgoing";

function RequestsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: incoming } = useSuspenseQuery(incomingQuery);
  const { data: outgoing } = useSuspenseQuery(outgoingQuery);
  const [tab, setTab] = useState<Tab>("incoming");
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function respond(id: string, accept: boolean) {
    setBusyId(id);
    try {
      await respondTradeRequest({ data: { id, accept } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["requests"] }),
        qc.invalidateQueries({ queryKey: ["customers"] }),
        qc.invalidateQueries({ queryKey: ["suppliers"] }),
      ]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  if (!me.profile?.is_approved && !me.isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-6 py-24">
        <div className="mono-label !text-primary">§ Under review</div>
        <h1 className="mt-3 font-display text-[28px] font-medium">
          Requests unlock once the trust desk approves your organisation.
        </h1>
        <Link to="/dashboard" className="mt-6 inline-flex text-[13px] font-medium text-primary">
          Back to dashboard →
        </Link>
      </div>
    );
  }

  const rows = tab === "incoming" ? incoming : outgoing;
  const pendingCount = incoming.filter((r) => r.status === "pending").length;

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1240px] px-6 pb-8 pt-10">
          <div className="mono-label">§ Trade requests</div>
          <h1 className="mt-3 font-display text-[32px] font-medium tracking-tight">
            Requests to buy and sell
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
            Incoming requests need your response. Once accepted, the two organisations
            are linked automatically as supplier & customer.
          </p>
          <div className="mt-6 inline-flex items-center gap-1 rounded-md border border-border p-1">
            {(["incoming", "outgoing"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-sm px-3 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
                  tab === t
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
                {t === "incoming" && pendingCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[10.5px] font-semibold text-primary">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-6 py-10">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {[
                  tab === "incoming" ? "From" : "To",
                  "Direction",
                  "Product",
                  "Qty",
                  "Status",
                  "",
                ].map((h, i) => (
                  <th key={i} className="mono-label px-4 py-2.5 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                    Nothing here yet.
                  </td>
                </tr>
              )}
              {rows.map((r: any) => {
                const org = tab === "incoming" ? r.from_org : r.to_org;
                const label =
                  tab === "incoming"
                    ? r.direction === "buy"
                      ? "wants to buy from you"
                      : "wants to sell to you"
                    : r.direction === "buy"
                      ? "you asked to buy"
                      : "you offered to sell";
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-4 align-top">
                      <div className="font-medium">{org?.display_name || "—"}</div>
                      <div className="mono-label mt-1">
                        {[org?.country, org?.industry].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-muted-foreground">{label}</td>
                    <td className="px-4 py-4 align-top">
                      <div>{r.product || "—"}</div>
                      {r.category && (
                        <div className="mono-label mt-1">{r.category}</div>
                      )}
                      {r.message && (
                        <div className="mt-1 max-w-md text-[12px] text-muted-foreground">
                          "{r.message}"
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">{r.quantity || "—"}</td>
                    <td className="px-4 py-4 align-top">
                      <StatusPill s={r.status} />
                    </td>
                    <td className="px-4 py-4 text-right align-top">
                      {tab === "incoming" && r.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => respond(r.id, false)}
                            className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-40"
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => respond(r.id, true)}
                            className="rounded-md bg-foreground px-3 py-1.5 text-[12.5px] font-medium text-background hover:opacity-90 disabled:opacity-40"
                          >
                            {busyId === r.id ? "…" : "Accept"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">
                          {r.responded_at
                            ? new Date(r.responded_at).toLocaleDateString()
                            : new Date(r.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function StatusPill({ s }: { s: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "border-border text-muted-foreground" },
    accepted: { label: "Accepted", cls: "border-primary/40 text-primary bg-accent" },
    rejected: { label: "Declined", cls: "border-destructive/40 text-destructive" },
    cancelled: { label: "Cancelled", cls: "border-border text-muted-foreground" },
  };
  const c = map[s] ?? map.pending;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}
