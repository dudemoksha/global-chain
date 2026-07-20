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
    return { ok: true };
  });
