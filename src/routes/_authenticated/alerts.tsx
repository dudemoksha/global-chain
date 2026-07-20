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
  dismissAlert,
  listMyAlerts,
  markAlertRead,
  markAllAlertsRead,
  syncAlerts,
  type AlertRow,
} from "@/lib/alerts.functions";
import {
  severityColor,
  severityLabel,
  type Severity,
} from "@/lib/risk-signals";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const alertsQuery = queryOptions({
  queryKey: ["alerts", "list"],
  queryFn: () => listMyAlerts(),
});

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts · Global-Chain" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me.profile?.is_approved || me.isAdmin) {
      await context.queryClient
        .ensureQueryData(alertsQuery)
        .catch(() => ({ rows: [], unread: 0 }));
    }
    return null;
  },
  component: AlertsPage,
});

type Filter = "all" | "unread" | "watched";

function AlertsPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const { data } = useSuspenseQuery(alertsQuery);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const list = data.rows;
    if (filter === "unread") return list.filter((r) => !r.read_at);
    if (filter === "watched") return list.filter((r) => r.is_watched);
    return list;
  }, [data.rows, filter]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["alerts", "list"] }),
      qc.invalidateQueries({ queryKey: ["alerts", "unread-count"] }),
    ]);
  }

  async function onSync() {
    setBusy(true);
    try {
      await syncAlerts();
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function onRead(id: string) {
    await markAlertRead({ data: { id } });
    await refresh();
  }
  async function onDismiss(id: string) {
    await dismissAlert({ data: { id } });
    await refresh();
  }
  async function onReadAll() {
    await markAllAlertsRead();
    await refresh();
  }

  if (!me.profile) return null;
  if (!me.profile.is_approved && !me.isAdmin) {
    return (
      <AppShell isAdmin={me.isAdmin} email={me.profile.work_email}>
        <div className="mx-auto max-w-xl px-6 py-24">
          <div className="mono-label !text-primary">§ Under review</div>
          <h1 className="mt-3 font-display text-[28px] font-medium">
            Alerts unlock once the trust desk approves your organisation.
          </h1>
        </div>
      </AppShell>
    );
  }

  const counts = {
    all: data.rows.length,
    unread: data.unread,
    watched: data.rows.filter((r) => r.is_watched).length,
  };

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile.work_email}>
      <div className="mx-auto max-w-[1240px] px-6 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mono-label">§ Alert centre</div>
            <h1 className="mt-3 font-display text-[32px] font-medium tracking-tight">
              Signals touching your network
            </h1>
            <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
              High-severity events that map to organisations in your resolved
              supply graph. Watched suppliers surface first, and are highlighted
              on the globe.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSync}
              disabled={busy}
              className="rounded-md border border-border px-3 py-1.5 text-[13px] font-medium hover:bg-surface disabled:opacity-50"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              onClick={onReadAll}
              disabled={counts.unread === 0}
              className="rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>
        </div>

        <div className="mt-8 inline-flex rounded-md border border-border p-1">
          {(["all", "unread", "watched"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-sm px-3 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f} · {counts[f]}
            </button>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-md border border-border">
          {rows.length === 0 ? (
            <div className="px-6 py-20 text-center">
              <div className="mono-label !text-primary">§ All clear</div>
              <div className="mt-3 font-display text-[20px] font-medium">
                {counts.all === 0
                  ? "No alerts yet"
                  : filter === "unread"
                    ? "Nothing unread"
                    : "No matches for this filter"}
              </div>
              <div className="mt-2 text-[13px] text-muted-foreground">
                {counts.all === 0
                  ? "Run a sync to scan the current signal feed against your resolved graph."
                  : "Try another filter, or run a fresh sync."}
              </div>
              {counts.all === 0 && (
                <button
                  type="button"
                  onClick={onSync}
                  disabled={busy}
                  className="mt-5 inline-flex rounded-md bg-foreground px-4 py-2 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Syncing…" : "Run first sync"}
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((a) => (
                <AlertItem
                  key={a.id}
                  a={a}
                  onRead={() => onRead(a.id)}
                  onDismiss={() => onDismiss(a.id)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 text-[12px] text-muted-foreground">
          Alerts fire on high and critical severity only. Full feed lives on{" "}
          <Link to="/signals" className="text-primary hover:underline">
            Signals
          </Link>
          .
        </div>
      </div>
    </AppShell>
  );
}

function AlertItem({
  a,
  onRead,
  onDismiss,
}: {
  a: AlertRow;
  onRead: () => void;
  onDismiss: () => void;
}) {
  const unread = !a.read_at;
  const sev = a.severity as Severity;
  const stamp = new Date(a.created_at);
  const rel = timeAgo(stamp);

  return (
    <li
      className={`grid grid-cols-[auto_1fr_auto] items-start gap-4 px-5 py-4 ${
        unread ? "bg-accent/40" : "bg-card"
      }`}
    >
      <span
        className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: severityColor(sev) }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono-label uppercase">{a.kind}</span>
          <span
            className="mono-label"
            style={{ color: severityColor(sev) }}
          >
            {severityLabel(sev)}
          </span>
          <span className="mono-label">· {a.country}</span>
          {a.is_watched && (
            <span
              className="rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
              style={{
                borderColor: "oklch(0.58 0.13 232 / 0.4)",
                color: "oklch(0.45 0.13 232)",
              }}
            >
              Watched
            </span>
          )}
          <span className="ml-auto text-[11.5px] text-muted-foreground">{rel}</span>
        </div>
        <div className="mt-1.5 text-[14px] font-medium">{a.headline}</div>
        <div className="mt-0.5 text-[13px] text-muted-foreground">{a.detail}</div>
        {a.supplier_name && (
          <div className="mt-2 text-[12px]">
            <span className="mono-label">Impacts</span>{" "}
            <span className="font-medium">{a.supplier_name}</span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {unread && (
          <button
            type="button"
            onClick={onRead}
            className="rounded-md border border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
          >
            Mark read
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:border-destructive hover:text-destructive"
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}

function timeAgo(d: Date): string {
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
