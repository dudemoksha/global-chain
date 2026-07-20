import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Mark } from "@/components/site/mark";
import { getMyProfile } from "@/lib/profile.functions";
import { getMySupplyGraph, listMySuppliers } from "@/lib/suppliers.functions";
import { supabase } from "@/integrations/supabase/client";

const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: () => getMyProfile(),
});
const suppliersQuery = queryOptions({
  queryKey: ["suppliers", "mine"],
  queryFn: () => listMySuppliers(),
});
const graphQuery = queryOptions({
  queryKey: ["suppliers", "graph"],
  queryFn: () => getMySupplyGraph(),
});


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Global-Chain" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(meQuery);
  const router = useRouter();
  const { profile, isAdmin } = data;

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }

  if (!profile) return <Empty onSignOut={signOut} />;

  if (!profile.is_approved && !isAdmin) {
    return <PendingApproval profile={profile} onSignOut={signOut} />;
  }

  return (
    <AppShell isAdmin={isAdmin} email={profile.work_email} onSignOut={signOut}>
      <div className="mx-auto max-w-[1240px] px-6 py-14">
        <div className="mono-label">§ Dashboard</div>
        <h1 className="mt-3 font-display text-[36px] font-medium tracking-tight">
          Welcome, {profile.full_name || profile.work_email}.
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] text-muted-foreground">
          Your organisation <span className="text-foreground">{profile.legal_name}</span> is
          active on Global-Chain. The supplier graph, risk feed, and simulation
          surface arrive in the next release.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { k: "Tier-1 suppliers", v: "0", h: "Add via CSV or connector" },
            { k: "Active signals", v: "0", h: "Feed will populate here" },
            { k: "Simulations", v: "0", h: "Sandbox arrives in v0.2" },
          ].map((c) => (
            <div key={c.k} className="rounded-md border border-border bg-card p-5">
              <div className="mono-label">{c.k}</div>
              <div className="mt-2 font-display text-[28px] font-medium">{c.v}</div>
              <div className="mt-2 text-[12px] text-muted-foreground">{c.h}</div>
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="mt-10 rounded-md border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="mono-label !text-primary">Admin</div>
                <div className="mt-1 text-[14px] font-medium">
                  Access-request queue
                </div>
              </div>
              <Link
                to="/admin/requests"
                className="rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90"
              >
                Open queue →
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function AppShell({
  children,
  isAdmin,
  email,
  onSignOut,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-6">
          <Link to="/dashboard">
            <Mark />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              to="/dashboard"
              className="text-[13px] font-medium text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              Dashboard
            </Link>
            {isAdmin && (
              <Link
                to="/admin/requests"
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-primary" }}
              >
                Admin
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="mono-label hidden sm:inline">{email}</span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-surface"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

function PendingApproval({
  profile,
  onSignOut,
}: {
  profile: { legal_name: string; work_email: string; full_name: string };
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-6">
          <Link to="/">
            <Mark />
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-xl px-6 py-24">
        <div className="mono-label !text-primary">§ Under review</div>
        <h1 className="mt-3 font-display text-[32px] font-medium leading-[1.1] tracking-tight">
          Your access request is in the trust-desk queue.
        </h1>
        <p className="mt-4 text-[14px] text-muted-foreground">
          Hello {profile.full_name || profile.work_email}. Once{" "}
          <span className="text-foreground">{profile.legal_name}</span> is
          reviewed and approved, this screen will unlock into your operator
          dashboard. Typical response time is under 48 hours.
        </p>
        <div className="mt-10 grid grid-cols-3 gap-3">
          {[
            ["Status", "Awaiting review"],
            ["Contact", profile.work_email],
            ["Est. response", "≤ 48h"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md border border-border p-3">
              <div className="mono-label">{k}</div>
              <div className="mt-1 text-[13px] font-medium">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Empty({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="text-muted-foreground">Profile not found.</p>
      <button
        onClick={onSignOut}
        className="mt-4 rounded-md border border-border px-3 py-1.5 text-[13px]"
      >
        Sign out
      </button>
    </div>
  );
}
