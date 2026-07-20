import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile, listAllProfiles } from "@/lib/profile.functions";
import { platformStats, setCompanyStatus } from "@/lib/admin.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const cosQuery = queryOptions({ queryKey: ["admin", "profiles"], queryFn: () => listAllProfiles() });
const statsQuery = queryOptions({ queryKey: ["admin", "stats"], queryFn: () => platformStats() });

export const Route = createFileRoute("/_authenticated/admin/companies")({
  head: () => ({ meta: [{ title: "Companies · Global-Chain" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(cosQuery).catch(() => []),
      context.queryClient.ensureQueryData(statsQuery).catch(() => null),
    ]);
    return null;
  },
  component: CompaniesPage,
});

function CompaniesPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: rows } = useSuspenseQuery(cosQuery);
  const { data: stats } = useSuspenseQuery(statsQuery);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (v: { userId: string; status: "active" | "suspended" }) =>
      setCompanyStatus({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "profiles"] }),
  });

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (r.legal_name || "").toLowerCase().includes(s)
      || (r.work_email || "").toLowerCase().includes(s)
      || (r.hq_country || "").toLowerCase().includes(s);
  });

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[1240px] px-6 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mono-label">§ Administration</div>
            <h1 className="mt-2 font-display text-[32px] font-medium tracking-tight">Companies</h1>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/requests" className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium">Approvals</Link>
            <Link to="/admin/audit" className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium">Audit log</Link>
          </div>
        </div>

        {stats && (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi k="Registered" v={stats.companies} />
            <Kpi k="Approved" v={stats.approved} />
            <Kpi k="Suppliers indexed" v={stats.suppliers} />
            <Kpi k="Alerts issued" v={stats.alerts} />
          </div>
        )}

        <div className="mt-8">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search organisation, email, country…"
            className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 text-[13px]"
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {["Organisation", "Contact", "Country", "Status", ""].map((h) => (
                  <th key={h} className="mono-label px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">No companies match.</td></tr>
              )}
              {filtered.map((r) => {
                const status = (r as any).status || "active";
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.legal_name || "—"}</div>
                      <div className="mono-label mt-0.5">{r.industry || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{r.full_name}</div>
                      <div className="text-[12px] text-muted-foreground">{r.work_email}</div>
                    </td>
                    <td className="px-4 py-3">{r.hq_country || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        status === "suspended"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : r.is_approved
                          ? "border-primary/40 bg-accent text-accent-foreground"
                          : "border-border text-muted-foreground"
                      }`}>
                        {status === "suspended" ? "Suspended" : r.is_approved ? "Active" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.is_approved && (
                        <button
                          disabled={busy === r.id}
                          onClick={async () => {
                            setBusy(r.id);
                            await toggle.mutateAsync({ userId: r.id, status: status === "suspended" ? "active" : "suspended" });
                            setBusy(null);
                          }}
                          className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium hover:border-foreground disabled:opacity-40"
                        >
                          {status === "suspended" ? "Activate" : "Suspend"}
                        </button>
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

function Kpi({ k, v }: { k: string; v: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mono-label">{k}</div>
      <div className="mt-1 font-display text-[26px] font-medium tabular-nums">{v.toLocaleString()}</div>
    </div>
  );
}
