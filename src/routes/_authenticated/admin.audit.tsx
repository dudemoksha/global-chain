import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { listAuditLogs } from "@/lib/admin.functions";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const auditQuery = queryOptions({ queryKey: ["admin", "audit"], queryFn: () => listAuditLogs() });

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Audit log · Global-Chain" }, { name: "robots", content: "noindex" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    await context.queryClient.ensureQueryData(auditQuery).catch(() => []);
    return null;
  },
  component: AuditPage,
});

function AuditPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data: rows } = useSuspenseQuery(auditQuery);
  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[1000px] px-6 py-12">
        <div className="mono-label">§ Compliance</div>
        <h1 className="mt-2 font-display text-[32px] font-medium tracking-tight">Audit log</h1>
        <p className="mt-2 text-[13.5px] text-muted-foreground">Latest 200 admin actions.</p>

        <div className="mt-6 overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-surface">
              <tr className="border-b border-border">
                {["When", "Action", "Target", "Meta"].map((h) => (
                  <th key={h} className="mono-label px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-16 text-center text-muted-foreground">No audit entries.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 font-medium">{r.action}</td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px]">{r.target_type}:{r.target_id.slice(0, 8)}</td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-muted-foreground">{JSON.stringify(r.meta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
