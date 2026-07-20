import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validatePassword } from "@/lib/password";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) throw new Error("Forbidden: admin only");
}

const roleEnum = z.enum(["admin", "operator"]);

const createInput = z.object({
  email: z.string().email(),
  password: z.string().refine((p) => !validatePassword(p), {
    message:
      "Password must be 8+ chars with uppercase, lowercase and a special character.",
  }),
  fullName: z.string().max(160).optional().default(""),
  legalName: z.string().max(200).optional().default(""),
  jobTitle: z.string().max(160).optional().default(""),
  hqCountry: z.string().max(120).optional().default(""),
  industry: z.string().max(160).optional().default(""),
  tierRole: z.string().max(40).optional().default(""),
  role: roleEnum.default("operator"),
  approve: z.boolean().default(true),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertAdmin(supabase, actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        legal_name: data.legalName,
        job_title: data.jobTitle,
        hq_country: data.hqCountry,
        industry: data.industry,
        tier_role: data.tierRole,
      },
    });
    if (error) throw error;
    const newId = created.user!.id;

    // trigger seeds profile + operator role; align approval + optional admin role
    await supabaseAdmin
      .from("profiles")
      .update({
        is_approved: data.approve,
        reviewed_at: new Date().toISOString(),
        reviewed_by: actorId,
      })
      .eq("id", newId);

    if (data.role === "admin") {
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newId, role: "admin" })
        .select();
    }

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: actorId,
      action: "user.create",
      target_type: "profile",
      target_id: newId,
      meta: { email: data.email, role: data.role },
    });

    return { ok: true, id: newId };
  });

const updateInput = z.object({
  userId: z.string().uuid(),
  fullName: z.string().max(160).optional(),
  legalName: z.string().max(200).optional(),
  jobTitle: z.string().max(160).optional(),
  hqCountry: z.string().max(120).optional(),
  industry: z.string().max(160).optional(),
  tierRole: z.string().max(40).optional(),
  role: roleEnum.optional(),
});

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertAdmin(supabase, actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const fieldMap: Record<string, string> = {
      fullName: "full_name",
      legalName: "legal_name",
      jobTitle: "job_title",
      hqCountry: "hq_country",
      industry: "industry",
      tierRole: "tier_role",
    };

    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("full_name, legal_name, job_title, hq_country, industry, tier_role, work_email")
      .eq("id", data.userId)
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
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(patch as any)
        .eq("id", data.userId);
      if (error) throw error;
    }

    let roleChange: { from: string; to: string } | null = null;
    if (data.role) {
      const { data: existingRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId);
      const wasAdmin = (existingRoles ?? []).some((r: any) => r.role === "admin");
      const willAdmin = data.role === "admin";
      if (wasAdmin !== willAdmin) {
        roleChange = {
          from: wasAdmin ? "admin" : "user",
          to: willAdmin ? "admin" : "user",
        };
      }
      if (willAdmin) {
        await supabaseAdmin
          .from("user_roles")
          .upsert(
            { user_id: data.userId, role: "admin" },
            { onConflict: "user_id,role" },
          );
      } else {
        await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", data.userId)
          .eq("role", "admin");
      }
    }

    if (Object.keys(changes).length) {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: actorId,
        action: "user.profile_update",
        target_type: "profile",
        target_id: data.userId,
        meta: { email: (prev as any)?.work_email ?? null, changes, by: "admin" },
      });
    }
    if (roleChange) {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: actorId,
        action: "user.role_change",
        target_type: "profile",
        target_id: data.userId,
        meta: { email: (prev as any)?.work_email ?? null, ...roleChange, by: "admin" },
      });
    }

    return { ok: true };
  });

const passwordInput = z.object({
  userId: z.string().uuid(),
  password: z.string().refine((p) => !validatePassword(p), {
    message:
      "Password must be 8+ chars with uppercase, lowercase and a special character.",
  }),
});

export const adminSetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => passwordInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertAdmin(supabase, actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("work_email")
      .eq("id", data.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { password: data.password },
    );
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: actorId,
      action: "user.password_reset",
      target_type: "profile",
      target_id: data.userId,
      meta: { email: (prev as any)?.work_email ?? null, by: "admin" },
    });
    return { ok: true };
  });

const deleteInput = z.object({ userId: z.string().uuid() });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId: actorId } = context;
    await assertAdmin(supabase, actorId);
    if (data.userId === actorId) throw new Error("You cannot delete yourself.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("work_email, full_name")
      .eq("id", data.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: actorId,
      action: "user.delete",
      target_type: "profile",
      target_id: data.userId,
      meta: {
        email: (prev as any)?.work_email ?? null,
        full_name: (prev as any)?.full_name ?? null,
        by: "admin",
      },
    });
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error }, { data: roles }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "id, full_name, job_title, work_email, legal_name, hq_country, industry, tier_role, note, is_approved, reviewed_at, rejection_reason, status, created_at",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (error) throw error;
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: { user_id: string; role: string }) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p: any) => ({
      ...p,
      roles: roleMap.get(p.id) ?? [],
      is_admin: (roleMap.get(p.id) ?? []).includes("admin"),
    }));
  });
