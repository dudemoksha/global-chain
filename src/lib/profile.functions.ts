import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Load the signed-in user's profile + role. */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: profile, error: pErr }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, job_title, work_email, legal_name, hq_country, industry, tier_role, is_approved, created_at",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (pErr) throw pErr;

    return {
      profile,
      isAdmin: (roles ?? []).some((r) => r.role === "admin"),
    };
  });

/** Admin: list every profile (used by the approval queue). */
export const listAllProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: adminRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (adminRows ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, job_title, work_email, legal_name, hq_country, industry, tier_role, note, is_approved, reviewed_at, rejection_reason, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
  });

const decisionInput = z.object({
  userId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

/** Admin: approve or reject a profile. */
export const decideProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decisionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId: reviewerId } = context;

    const { data: adminRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", reviewerId);
    const isAdmin = (adminRows ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { error } = await supabase
      .from("profiles")
      .update({
        is_approved: data.decision === "approve",
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewerId,
        rejection_reason: data.decision === "reject" ? (data.reason ?? "") : null,
      })
      .eq("id", data.userId);

    if (error) throw error;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("work_email")
      .eq("id", data.userId)
      .maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: reviewerId,
      action: data.decision === "approve" ? "user.approved" : "user.rejected",
      target_type: "profile",
      target_id: data.userId,
      meta: {
        email: (target as any)?.work_email ?? null,
        reason: data.reason ?? null,
        by: "admin",
      },
    });

    return { ok: true };
  });

const selfProfileInput = z.object({
  fullName: z.string().max(160).optional(),
  legalName: z.string().max(200).optional(),
  jobTitle: z.string().max(160).optional(),
  hqCountry: z.string().max(120).optional(),
  industry: z.string().max(160).optional(),
  tierRole: z.string().max(40).optional(),
});

/** Self-service: update your own profile (logged to audit_logs). */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => selfProfileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const fieldMap: Record<string, string> = {
      fullName: "full_name",
      legalName: "legal_name",
      jobTitle: "job_title",
      hqCountry: "hq_country",
      industry: "industry",
      tierRole: "tier_role",
    };

    const { data: prev } = await supabase
      .from("profiles")
      .select("full_name, legal_name, job_title, hq_country, industry, tier_role, work_email")
      .eq("id", userId)
      .maybeSingle();

    const patch: Record<string, string> = {};
    const changes: Record<string, { from: string; to: string }> = {};
    for (const [k, col] of Object.entries(fieldMap)) {
      const v = (data as any)[k];
      if (v === undefined) continue;
      patch[col] = v;
      const before = (prev as any)?.[col] ?? "";
      if (String(before) !== String(v)) {
        changes[col] = { from: String(before), to: String(v) };
      }
    }

    if (Object.keys(patch).length) {
      const { error } = await supabase.from("profiles").update(patch as any).eq("id", userId);
      if (error) throw error;
    }

    if (Object.keys(changes).length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        action: "user.profile_update",
        target_type: "profile",
        target_id: userId,
        meta: { email: (prev as any)?.work_email ?? null, changes, by: "self" },
      });
    }
    return { ok: true };
  });

const selfPasswordInput = z.object({ password: z.string().min(8) });

/** Self-service: change your own password (logged to audit_logs). */
export const updateMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => selfPasswordInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (error) throw error;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("work_email")
      .eq("id", userId)
      .maybeSingle();
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "user.password_change",
      target_type: "profile",
      target_id: userId,
      meta: { email: (prev as any)?.work_email ?? null, by: "self" },
    });
    return { ok: true };
  });
