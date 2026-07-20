import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const criticalityEnum = z.enum(["low", "medium", "high", "critical"]);

/** List the signed-in operator's declared suppliers (tier-1 only). */
export const listMySuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("suppliers")
      .select(
        `id, category, criticality, annual_spend_bucket, lead_time_days, notes, created_at,
         organizations:supplier_org_id ( id, display_name, country, industry )`,
      )
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

const addInput = z.object({
  legal_name: z.string().trim().min(2).max(160),
  country: z.string().trim().max(80).default(""),
  industry: z.string().trim().max(120).default(""),
  category: z.string().trim().max(120).default(""),
  criticality: criticalityEnum.default("medium"),
  annual_spend_bucket: z.string().trim().max(60).default(""),
  lead_time_days: z.number().int().min(0).max(1000).nullable().optional(),
  notes: z.string().trim().max(600).default(""),
});

/** Declare a new supplier for the signed-in operator. Auto-links via canonical organisation. */
export const addSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => addInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: orgId, error: rpcErr } = await supabase.rpc(
      "upsert_organization",
      {
        _name: data.legal_name,
        _country: data.country,
        _industry: data.industry,
      },
    );
    if (rpcErr) throw rpcErr;
    if (!orgId) throw new Error("Failed to resolve organisation");

    const { data: row, error } = await supabase
      .from("suppliers")
      .insert({
        owner_id: userId,
        supplier_org_id: orgId as string,
        category: data.category,
        criticality: data.criticality,
        annual_spend_bucket: data.annual_spend_bucket,
        lead_time_days: data.lead_time_days ?? null,
        notes: data.notes,
      })
      .select("id")
      .single();

    if (error) {
      // duplicate unique (owner_id, supplier_org_id)
      if (error.code === "23505") {
        throw new Error("You've already declared this supplier.");
      }
      throw error;
    }
    return { id: row.id };
  });

const updateInput = z.object({
  id: z.string().uuid(),
  category: z.string().trim().max(120).optional(),
  criticality: criticalityEnum.optional(),
  annual_spend_bucket: z.string().trim().max(60).optional(),
  lead_time_days: z.number().int().min(0).max(1000).nullable().optional(),
  notes: z.string().trim().max(600).optional(),
});

export const updateSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...rest } = data;
    const { error } = await supabase
      .from("suppliers")
      .update(rest)
      .eq("id", id)
      .eq("owner_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const removeSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/** Return tier-1 + hidden tier-2 exposure for the signed-in operator. */
export const getMySupplyGraph = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.rpc("get_supply_graph", {
      _user_id: userId,
    });
    if (error) throw error;
    return data ?? [];
  });
