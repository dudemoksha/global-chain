import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InventoryRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  warehouse_id: string | null;
  warehouse_name: string | null;
  warehouse_country: string | null;
  warehouse_city: string | null;
  warehouse_capacity: number;
  monthly_production: number;
  updated_at: string;
  price: number;
};

export const listInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InventoryRow[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("inventory_items")
      .select(`
        id, sku, name, unit, warehouse_id, warehouse_capacity, monthly_production, updated_at, price,
        warehouses:warehouse_id ( name, country, city )
      `)
      .eq("owner_id", userId)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, sku: r.sku, name: r.name, unit: r.unit,
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouses?.name ?? null,
      warehouse_country: r.warehouses?.country ?? null,
      warehouse_city: r.warehouses?.city ?? null,
      warehouse_capacity: r.warehouse_capacity,
      monthly_production: r.monthly_production,
      updated_at: r.updated_at,
      price: r.price ?? 100,
    }));
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateSku(supabase: any, userId: string): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 6; attempt++) {
    let code = "SKU-";
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const { data } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("sku", code)
      .maybeSingle();
    if (!data) return code;
  }
  return `SKU-${Date.now().toString(36).toUpperCase()}`;
}

const skuInput = z.object({
  name: z.string().trim().min(1).max(160),
  unit: z.string().trim().min(1).max(20),
  warehouse_id: z.string().uuid(),
  warehouse_capacity: z.number().int().min(0).max(1_000_000_000).default(0),
  monthly_production: z.number().int().min(0).max(1_000_000_000).default(0),
  price: z.number().min(0).default(100),
});

export const createInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => skuInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const sku = await generateSku(supabase, userId);
    const { error } = await supabase.from("inventory_items").insert({
      owner_id: userId,
      sku,
      name: data.name,
      unit: data.unit,
      warehouse_id: data.warehouse_id,
      warehouse_capacity: data.warehouse_capacity,
      monthly_production: data.monthly_production,
      price: data.price,
      // legacy NOT NULL columns
      warehouse: "",
      current_stock: 0,
      safety_stock: 0,
      reorder_level: 0,
    });
    if (error) throw error;
    return { ok: true, sku };
  });

export const updateInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    skuInput.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...rest } = data;
    const { error } = await supabase
      .from("inventory_items")
      .update(rest)
      .eq("id", id)
      .eq("owner_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const removeInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/* ---------- Real-time risk per warehouse (live GDELT + USGS) ---------- */

export type WarehouseRisk = {
  warehouse_id: string;
  score: number;          // 0-100
  severity: "low" | "medium" | "high" | "critical";
  event_count: number;
  top_headline: string | null;
  top_kind: string | null;
};

export const getInventoryRisks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WarehouseRisk[]> => {
    const { supabase, userId } = context;
    const { data: warehouses, error } = await supabase
      .from("warehouses")
      .select("id, name, country, city")
      .eq("owner_id", userId);
    if (error) throw error;
    if (!warehouses || warehouses.length === 0) return [];

    const { fetchLiveSignals } = await import("./live-signals.server");
    // Treat warehouses as pseudo-orgs so the live-signals engine buckets events by their country.
    const orgs = warehouses.map((w) => ({ id: w.id, name: w.name, country: w.country }));
    const events = await fetchLiveSignals(orgs);

    const sevWeight: Record<string, number> = { critical: 40, high: 25, medium: 12, low: 4 };
    return warehouses.map((w) => {
      const affecting = events.filter((e) => e.affectsOrgIds.includes(w.id));
      let score = 5; // baseline
      let topHeadline: string | null = null;
      let topKind: string | null = null;
      let topRank = -1;
      const sevRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      for (const e of affecting) {
        const decay = Math.max(0.35, 1 - e.hoursAgo / 96);
        score += (sevWeight[e.severity] ?? 5) * decay;
        const r = sevRank[e.severity] ?? 0;
        if (r > topRank) { topRank = r; topHeadline = e.headline; topKind = e.kind; }
      }
      score = Math.min(100, Math.round(score));
      const severity: WarehouseRisk["severity"] =
        score >= 70 ? "critical" : score >= 45 ? "high" : score >= 22 ? "medium" : "low";
      return {
        warehouse_id: w.id,
        score,
        severity,
        event_count: affecting.length,
        top_headline: topHeadline,
        top_kind: topKind,
      };
    });
  });
