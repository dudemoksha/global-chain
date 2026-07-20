import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Mark } from "@/components/site/mark";
import { decideProfile, listAllProfiles } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

const queueQuery = queryOptions({
  queryKey: ["admin", "profiles"],
  queryFn: () => listAllProfiles(),
});

export const Route = createFileRoute("/_authenticated/admin/requests")({
  head: () => ({
    meta: [{ title: "Approval queue · Global-Chain" }, { name: "robots", content: "noindex" }],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(queueQuery).catch(() => []),
  component: AdminRequests,
});

function AdminRequests() {
  const { data: rows } = useSuspenseQuery(queueQuery);
  const qc = useQueryClient();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");

  async function decide(userId: string, decision: "approve" | "reject") {
    setBusyId(userId);
    try {
      await decideProfile({ data: { userId, decision } });
      await qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
    } finally {
      setBusyId(null);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }

  const filtered = rows.filter((r) => {
    if (filter === "pending") return !r.is_approved && !r.reviewed_at;
    if (filter === "approved") return r.is_approved;
    return true;
  });

  const counts = {
    pending: rows.filter((r) => !r.is_approved && !r.reviewed_at).length,
    approved: rows.filter((r) => r.is_approved).length,
    all: rows.length,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-6">
          <Link to="/dashboard">
            <Mark />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link to="/dashboard" className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <Link to="/admin/requests" className="text-[13px] font-medium text-primary">
              Admin
            </Link>
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
            <div className="mono-label">§ Trust desk</div>
            <h1 className="mt-3 font-display text-[32px] font-medium tracking-tight">
              Access-request queue
            </h1>
            <p className="mt-2 text-[13.5px] text-muted-foreground">
              Review new organisations. Approving unlocks the operator
              dashboard for the applicant on their next sign-in.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            {(["pending", "approved", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-sm px-3 py-1.5 text-[12px] font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f} · {counts[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {["Organisation", "Contact", "Role", "Submitted", "Status", ""].map(
                  (h) => (
                    <th key={h} className="mono-label px-4 py-2.5 text-left">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                    Nothing in this view.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-4 align-top">
                    <div className="font-medium">{r.legal_name || "—"}</div>
                    <div className="mono-label mt-1">
                      {r.hq_country} · {r.industry}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div>{r.full_name || "—"}</div>
                    <div className="text-[12px] text-muted-foreground">{r.work_email}</div>
                    <div className="text-[12px] text-muted-foreground">{r.job_title}</div>
                  </td>
                  <td className="px-4 py-4 align-top capitalize">{r.tier_role || "—"}</td>
                  <td className="px-4 py-4 align-top">
                    <time className="text-[12px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <StatusPill row={r} />
                  </td>
                  <td className="px-4 py-4 text-right align-top">
                    {!r.is_approved && !r.reviewed_at ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => decide(r.id, "reject")}
                          className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium hover:border-destructive hover:text-destructive disabled:opacity-40"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => decide(r.id, "approve")}
                          className="rounded-md bg-foreground px-3 py-1.5 text-[12.5px] font-medium text-background hover:opacity-90 disabled:opacity-40"
                        >
                          Approve
                        </button>
                      </div>
                    ) : r.is_approved ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => decide(r.id, "reject")}
                        className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-40"
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => decide(r.id, "approve")}
                        className="rounded-md border border-border px-3 py-1.5 text-[12.5px] font-medium hover:border-foreground disabled:opacity-40"
                      >
                        Reconsider
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ row }: { row: { is_approved: boolean; reviewed_at: string | null } }) {
  if (row.is_approved)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Approved
      </span>
    );
  if (row.reviewed_at)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Rejected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-warn" /> Pending
    </span>
  );
}
