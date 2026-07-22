import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

/**
 * Public function to request a password reset.
 * Inserts a pending request into the password_reset_requests table.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ email: z.string().email().trim().toLowerCase() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Verify a profile with this email exists
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("work_email", data.email)
      .maybeSingle();

    if (!profile) {
      throw new Error("No account found with that email address.");
    }

    // 2. Insert request
    const { error } = await supabaseAdmin.from("password_reset_requests").insert({
      email: data.email,
      status: "pending",
    });

    if (error) throw error;
    return { success: true };
  });

/**
 * Admin function to list all password reset requests.
 */
export const listPasswordResetRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check admin
    await assertAdmin(supabaseAdmin, userId);

    const { data, error } = await supabaseAdmin
      .from("password_reset_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  });

/**
 * Admin function to approve a password reset request.
 * Sets the user's password in auth.users using supabaseAdmin and updates request state.
 */
export const approvePasswordResetRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ requestId: z.string().uuid(), tempPassword: z.string().min(6) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Check admin
    await assertAdmin(supabaseAdmin, userId);

    // 2. Fetch reset request details
    const { data: request } = await supabaseAdmin
      .from("password_reset_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!request) throw new Error("Request not found.");
    if (request.status !== "pending") throw new Error("Request already resolved.");

    // 3. Resolve target user by email
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("work_email", request.email)
      .maybeSingle();
    if (!userProfile) throw new Error("User profile not found.");

    // 4. Update password in auth.users via admin API
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userProfile.id, {
      password: data.tempPassword,
    });
    if (authErr) throw authErr;

    // 5. Update request row
    const { error: updateErr } = await supabaseAdmin
      .from("password_reset_requests")
      .update({
        status: "approved",
        temp_password: data.tempPassword,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (updateErr) throw updateErr;

    return { success: true };
  });

/**
 * Admin function to reject a password reset request.
 */
export const rejectPasswordResetRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ requestId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Check admin
    await assertAdmin(supabaseAdmin, userId);

    // 2. Update request row to rejected
    const { error } = await supabaseAdmin
      .from("password_reset_requests")
      .update({
        status: "rejected",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);

    if (error) throw error;
    return { success: true };
  });
