import { Link, useRouter } from "@tanstack/react-router";
import { Mark } from "@/components/site/mark";
import { AlertBell } from "@/components/site/alert-bell";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { to: string; label: string; adminOnly?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/factories", label: "Factories" },
  { to: "/inventory", label: "Inventory" },
  { to: "/globe", label: "Globe" },
  { to: "/signals", label: "Signals" },
  { to: "/simulation", label: "Simulation" },
  { to: "/analytics", label: "Analytics" },
  { to: "/uploads", label: "Uploads" },
  { to: "/assistant", label: "Assistant" },
  { to: "/alerts", label: "Alerts" },
  { to: "/admin/companies", label: "Admin", adminOnly: true },
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
    await supabase.auth.signOut();
    router.navigate({ to: "/", replace: true });
  }

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-6 px-6">
          <Link to="/dashboard" className="shrink-0">
            <Mark />
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
            <AlertBell />
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
