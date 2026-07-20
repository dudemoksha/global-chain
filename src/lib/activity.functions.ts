import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

const eventInput = z.object({
  kind: z.enum(["login", "logout"]),
  userAgent: z.string().max(400).optional().default(""),
  platform: z.string().max(120).optional().default(""),
  language: z.string().max(40).optional().default(""),
  timezone: z.string().max(80).optional().default(""),
  screen: z.string().max(40).optional().default(""),
});

export const logAuthEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => eventInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: data.kind === "login" ? "auth.login" : "auth.logout",
      target_type: "session",
      target_id: userId,
      meta: {
        user_agent: data.userAgent,
        platform: data.platform,
        language: data.language,
        timezone: data.timezone,
        screen: data.screen,
        device: detectDevice(data.userAgent),
        by: "self",
      },
    });
    return { ok: true };
  });

function detectDevice(ua: string) {
  const s = (ua || "").toLowerCase();
  if (/ipad|tablet/.test(s)) return "Tablet";
  if (/mobile|iphone|android/.test(s)) return "Mobile";
  if (/mac|windows|linux|cros/.test(s)) return "Desktop";
  return "Unknown";
}

export const adminGetUserActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("audit_logs")
      .select("id, action, actor_id, target_id, target_type, meta, created_at")
      .or(`actor_id.eq.${data.userId},target_id.eq.${data.userId}`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return rows ?? [];
  });
