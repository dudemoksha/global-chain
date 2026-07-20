import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateSignals } from "@/lib/risk-signals";
import { getMySupplyGraph } from "@/lib/suppliers.functions";

export type AlertRow = {
  id: string;
  signal_key: string;
  kind: string;
  severity: string;
  country: string;
  headline: string;
  detail: string;
  supplier_org_id: string | null;
  supplier_name: string | null;
  read_at: string | null;
  created_at: string;
  is_watched: boolean;
};

/** List all alerts for the current operator, plus unread count. */
export const listMyAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: alerts, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const { data: watches } = await supabase
      .from("supplier_watches")
      .select("supplier_id, suppliers(supplier_org_id)")
      .eq("user_id", userId);

    const watchedOrgIds = new Set<string>();
    (watches ?? []).forEach((w) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgId = (w as any).suppliers?.supplier_org_id;
      if (orgId) watchedOrgIds.add(orgId);
    });

    const rows: AlertRow[] = (alerts ?? []).map((a) => ({
      id: a.id as string,
      signal_key: a.signal_key as string,
      kind: a.kind as string,
      severity: a.severity as string,
      country: a.country as string,
      headline: a.headline as string,
      detail: a.detail as string,
      supplier_org_id: (a.supplier_org_id as string | null) ?? null,
      supplier_name: (a.supplier_name as string | null) ?? null,
      read_at: (a.read_at as string | null) ?? null,
      created_at: a.created_at as string,
      is_watched: a.supplier_org_id
        ? watchedOrgIds.has(a.supplier_org_id as string)
        : false,
    }));

    const unread = rows.filter((r) => !r.read_at).length;
    return { rows, unread };
  });

/** Sync — regenerate signals from the current graph and upsert new alerts. */
export const syncAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const graph = await getMySupplyGraph();
    const orgs = graph.map((n) => ({
      id: n.supplier_org_id,
      name: n.supplier_name,
      country: n.supplier_country ?? "",
    }));
    if (orgs.length === 0) return { inserted: 0 };

    const signals = generateSignals(orgs);
    const orgById = new Map(orgs.map((o) => [o.id, o]));

    const rows = signals.flatMap((s) =>
      s.affectsOrgIds.map((orgId) => {
        const org = orgById.get(orgId);
        return {
          user_id: userId,
          signal_key: `${s.id}:${orgId}`,
          kind: s.kind,
          severity: s.severity,
          country: s.country,
          headline: s.headline,
          detail: s.detail,
          supplier_org_id: orgId,
          supplier_name: org?.name ?? null,
        };
      }),
    );
    if (rows.length === 0) return { inserted: 0 };

    // Only insert critical/high by default — noise reduction.
    const filtered = rows.filter(
      (r) => r.severity === "critical" || r.severity === "high",
    );
    if (filtered.length === 0) return { inserted: 0 };

    const { error, count } = await supabase
      .from("alerts")
      .upsert(filtered, {
        onConflict: "user_id,signal_key",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) throw error;
    return { inserted: count ?? 0 };
  });

export const markAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const markAllAlertsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw error;
    return { ok: true };
  });

export const dismissAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("alerts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Watches ---------- */

export const listMyWatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("supplier_watches")
      .select("supplier_id")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []).map((r) => r.supplier_id as string);
  });

export const toggleWatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { supplier_id: string; watch: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.watch) {
      const { error } = await supabase
        .from("supplier_watches")
        .upsert(
          { user_id: userId, supplier_id: data.supplier_id },
          { onConflict: "user_id,supplier_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("supplier_watches")
        .delete()
        .eq("user_id", userId)
        .eq("supplier_id", data.supplier_id);
      if (error) throw error;
    }
    return { ok: true };
  });
