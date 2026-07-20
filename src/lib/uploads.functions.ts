import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const kindEnum = z.enum(["suppliers", "factories", "inventory"]);

const rowSchemas = {
  suppliers: z.object({
    legal_name: z.string().trim().min(2).max(160),
    country: z.string().trim().max(80).default(""),
    industry: z.string().trim().max(120).default(""),
    category: z.string().trim().max(120).default(""),
    criticality: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    lead_time_days: z.number().int().min(0).max(1000).nullable().default(null),
  }),
  factories: z.object({
    name: z.string().trim().min(1).max(160),
    country: z.string().trim().max(80).default(""),
    city: z.string().trim().max(80).default(""),
    capacity_units: z.number().int().min(0).max(10_000_000).default(0),
    products: z.string().trim().max(500).default(""),
    warehouse: z.string().trim().max(120).default(""),
  }),
  inventory: z.object({
    sku: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(160),
    warehouse: z.string().trim().max(120).default(""),
    current_stock: z.number().int().min(0).default(0),
    safety_stock: z.number().int().min(0).default(0),
    reorder_level: z.number().int().min(0).default(0),
    unit: z.string().trim().max(20).default("unit"),
  }),
};

const bulkInput = z.object({
  kind: kindEnum,
  filename: z.string().trim().min(1).max(200),
  rows: z.array(z.record(z.string(), z.unknown())).max(2000),
});

export const listUploadHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("upload_history")
      .select("id, kind, filename, rows_ok, rows_failed, errors, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data ?? [];
  });

export const bulkUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const errors: Array<{ row: number; message: string }> = [];
    let ok = 0;

    if (data.kind === "suppliers") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (let i = 0; i < data.rows.length; i++) {
        try {
          const parsed = rowSchemas.suppliers.parse(data.rows[i]);
          const { data: orgId, error: e1 } = await supabaseAdmin.rpc("upsert_organization", {
            _name: parsed.legal_name,
            _country: parsed.country,
            _industry: parsed.industry,
          });
          if (e1) throw e1;
          const { error: e2 } = await supabase.from("suppliers").insert({
            owner_id: userId,
            supplier_org_id: orgId as string,
            category: parsed.category,
            criticality: parsed.criticality,
            lead_time_days: parsed.lead_time_days,
          });
          if (e2 && e2.code !== "23505") throw e2;
          ok++;
        } catch (err) {
          errors.push({ row: i + 2, message: (err as Error).message });
        }
      }
    } else if (data.kind === "factories") {
      for (let i = 0; i < data.rows.length; i++) {
        try {
          const p = rowSchemas.factories.parse(data.rows[i]);
          const products = p.products
            ? p.products.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30)
            : [];
          const { error } = await supabase.from("factories").insert({
            owner_id: userId,
            name: p.name,
            country: p.country,
            city: p.city,
            capacity_units: p.capacity_units,
            products,
            warehouse: p.warehouse,
          });
          if (error) throw error;
          ok++;
        } catch (err) {
          errors.push({ row: i + 2, message: (err as Error).message });
        }
      }
    } else {
      for (let i = 0; i < data.rows.length; i++) {
        try {
          const p = rowSchemas.inventory.parse(data.rows[i]);
          const { error } = await supabase
            .from("inventory_items")
            .upsert({ owner_id: userId, ...p }, { onConflict: "owner_id,sku" });
          if (error) throw error;
          ok++;
        } catch (err) {
          errors.push({ row: i + 2, message: (err as Error).message });
        }
      }
    }

    await supabase.from("upload_history").insert({
      owner_id: userId,
      kind: data.kind,
      filename: data.filename,
      rows_ok: ok,
      rows_failed: errors.length,
      errors: errors.slice(0, 100),
    });

    return { ok, failed: errors.length, errors: errors.slice(0, 50) };
  });
