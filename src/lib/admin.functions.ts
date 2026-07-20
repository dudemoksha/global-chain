import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

export const setCompanyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      status: z.enum(["active", "suspended"]),
      reason: z.string().max(400).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertAdmin(supabase, actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: actorId,
      action: data.status === "suspended" ? "company.suspend" : "company.activate",
      target_type: "profile",
      target_id: data.userId,
      meta: { reason: data.reason ?? "" },
    });
    return { ok: true };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, actor_id, action, target_type, target_id, meta, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const platformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: companies }, { count: approved }, { count: suppliers }, { count: alerts }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("is_approved", true),
        supabaseAdmin.from("suppliers").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("alerts").select("id", { count: "exact", head: true }),
      ]);
    return {
      companies: companies ?? 0,
      approved: approved ?? 0,
      suppliers: suppliers ?? 0,
      alerts: alerts ?? 0,
    };
  });
