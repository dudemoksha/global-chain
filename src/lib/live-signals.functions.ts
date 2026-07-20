import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LiveEventDTO = {
  id: string;
  source: "gdelt" | "usgs";
  sourceUrl?: string;
  country: string;
  region: string;
  kind: string;
  severity: string;
  headline: string;
  detail: string;
  affectsOrgIds: string[];
  hoursAgo: number;
  lat: number;
  lng: number;
  occurredAt: string;
};

/** Fetch live GDELT + USGS events mapped to the current operator's supplier graph. */
export const getLiveEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LiveEventDTO[]> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: graph, error } = await supabaseAdmin.rpc("get_supply_graph", {
      _user_id: userId,
    });
    if (error) throw error;
    const orgs = (graph ?? []).map((n: {
      supplier_org_id: string;
      supplier_name: string;
      supplier_country: string | null;
    }) => ({
      id: n.supplier_org_id,
      name: n.supplier_name,
      country: n.supplier_country ?? "",
    }));
    if (orgs.length === 0) return [];
    const { fetchLiveSignals } = await import("./live-signals.server");
    const events = await fetchLiveSignals(orgs);
    // Trim payload to top 60 to keep transfer small.
    return events.slice(0, 60) as LiveEventDTO[];
  });
