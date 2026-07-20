import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listMyAlerts } from "@/lib/alerts.functions";

export function AlertBell() {
  const { data } = useQuery({
    queryKey: ["alerts", "unread-count"],
    queryFn: () => listMyAlerts(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unread = data?.unread ?? 0;

  return (
    <Link
      to="/alerts"
      aria-label={`Alerts (${unread} unread)`}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6.5a5 5 0 0 1 10 0v2.2l1.2 2.3H1.8L3 8.7V6.5Z" />
        <path d="M6.3 12.5a1.8 1.8 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span
          className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-background px-1 text-[9.5px] font-semibold leading-none text-background"
          style={{ backgroundColor: "oklch(0.55 0.19 27)" }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
