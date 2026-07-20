import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, sku, name, warehouse, current_stock, safety_stock, reorder_level, unit, updated_at")
      .eq("owner_id", userId)
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

const invInput = z.object({
  sku: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(160),
  warehouse: z.string().trim().max(120).default(""),
  current_stock: z.number().int().min(0).max(100_000_000).default(0),
  safety_stock: z.number().int().min(0).max(100_000_000).default(0),
  reorder_level: z.number().int().min(0).max(100_000_000).default(0),
  unit: z.string().trim().max(20).default("unit"),
});

export const upsertInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => invInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("inventory_items")
      .upsert({ owner_id: userId, ...data }, { onConflict: "owner_id,sku" });
    if (error) throw error;
    return { ok: true };
  });

export const updateInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    invInput.partial().extend({ id: z.string().uuid() }).parse(d),
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
