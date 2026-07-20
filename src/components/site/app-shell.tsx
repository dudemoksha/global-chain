import { Link, useRouter } from "@tanstack/react-router";
import { Mark } from "@/components/site/mark";
import { AlertBell } from "@/components/site/alert-bell";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/activity.functions";
import { collectDeviceMeta } from "@/lib/device-meta";


type NavItem = { to: string; label: string };

const USER_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/inventory", label: "My SKUs" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/customers", label: "Customers" },
  { to: "/requests", label: "Requests" },
  { to: "/assistant", label: "Assistant" },
];


const ADMIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/analytics", label: "Analytics" },
];

export function AppShell({
  children,
  isAdmin,
  email,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
  email: string;
}) {
  const router = useRouter();

  async function signOut() {
    try {
      await logAuthEvent({ data: { kind: "logout", ...collectDeviceMeta() } });
    } catch {}
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }


  const items = isAdmin ? ADMIN_NAV : USER_NAV;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-6 px-6">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2">
            <Mark />
            {isAdmin && (
              <span className="mono-label !text-primary hidden sm:inline">
                · Admin
              </span>
            )}
          </Link>
          <nav className="hidden flex-1 items-center gap-5 md:flex">
            {items.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
                activeProps={{ className: "!text-primary" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {!isAdmin && <AlertBell />}
            <span className="mono-label hidden lg:inline">{email}</span>
            <button
              type="button"
              onClick={signOut}
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
