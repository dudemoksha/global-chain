import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const directionEnum = z.enum(["buy", "sell"]);

/** Search registered organisations (approved users' companies) by name; returns up to 10. */
export const searchOrganizations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ q: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Source of truth: approved users' profiles (a supplier/customer must be a real user)
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, legal_name, hq_country, industry")
      .eq("is_approved", true)
      .neq("id", userId)
      .ilike("legal_name", `%${data.q}%`)
      .not("legal_name", "is", null)
      .limit(10);
    if (pErr) throw pErr;

    const results: Array<{
      id: string;
      display_name: string;
      country: string;
      industry: string;
    }> = [];

    for (const p of profiles ?? []) {
      const name = (p.legal_name ?? "").trim();
      if (!name) continue;
      const { data: orgId, error: uErr } = await supabaseAdmin.rpc("upsert_organization", {
        _name: name,
        _country: p.hq_country ?? "",
        _industry: p.industry ?? "",
      });
      if (uErr) continue;
      if (!orgId) continue;
      if (results.some((r) => r.id === orgId)) continue;
      results.push({
        id: orgId as string,
        display_name: name,
        country: p.hq_country ?? "",
        industry: p.industry ?? "",
      });
    }
    return results;
  });

/** List the products (SKUs) that a given organisation's owner sells. */
export const listOrgProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ org_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("list_org_products", {
      _org_id: data.org_id,
    });
    if (error) throw error;
    return (rows ?? []) as Array<{ sku: string; name: string; unit: string }>;
  });

/** Send a trade request to an organization. Direction: buy = "I want to buy from them". */
export const sendTradeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        to_org_id: z.string().uuid(),
        direction: directionEnum,
        product: z.string().trim().min(1).max(200),
        quantity: z.string().trim().max(80).default(""),
        category: z.string().trim().max(120).default(""),
        message: z.string().trim().max(800).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve the target user (owner of that org, if registered)
    const { data: targetUserId, error: resErr } = await supabaseAdmin.rpc(
      "get_user_for_org",
      { _org_id: data.to_org_id },
    );
    if (resErr) throw resErr;
    if (!targetUserId) {
      throw new Error(
        "That organisation isn't registered on Global-Chain yet — pick a company that has an approved account.",
      );
    }
    if (targetUserId === userId) {
      throw new Error("You can't send a trade request to your own organisation.");
    }

    // Resolve requester's own org via profile.legal_name
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("legal_name, hq_country, industry")
      .eq("id", userId)
      .maybeSingle();

    let fromOrgId: string | null = null;
    if (myProfile?.legal_name?.trim()) {
      const { data: orgId } = await supabaseAdmin.rpc("upsert_organization", {
        _name: myProfile.legal_name,
        _country: myProfile.hq_country ?? "",
        _industry: myProfile.industry ?? "",
      });
      fromOrgId = (orgId as string) ?? null;
    }

    const { data: row, error } = await supabase
      .from("trade_requests")
      .insert({
        from_user_id: userId,
        from_org_id: fromOrgId,
        to_org_id: data.to_org_id,
        to_user_id: targetUserId as string,
        direction: data.direction,
        product: data.product,
        quantity: data.quantity,
        category: data.category,
        message: data.message,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

/** Requests I sent (outgoing). */
export const listOutgoingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Query trade_requests with org joins only (not profile joins through auth.users)
    const { data, error } = await supabase
      .from("trade_requests")
      .select(
        `id, direction, product, quantity, category, message, status, created_at, responded_at,
         to_user_id,
         to_org:to_org_id ( id, display_name, country, industry )`,
      )
      .eq("from_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Separately resolve profiles for the to_user_ids
    const toUserIds = [...new Set((data ?? []).map((r) => r.to_user_id).filter(Boolean))] as string[];
    let profileMap = new Map<string, any>();
    if (toUserIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, legal_name, hq_country, industry")
        .in("id", toUserIds);
      profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    }

    return (data ?? []).map((r) => ({
      ...r,
      to_profile: profileMap.get(r.to_user_id) ?? null,
    }));
  });

/** Requests sent to me (incoming). */
export const listIncomingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Query trade_requests with org joins only (not profile joins through auth.users)
    const { data, error } = await supabase
      .from("trade_requests")
      .select(
        `id, direction, product, quantity, category, message, status, created_at, responded_at,
         from_user_id,
         from_org:from_org_id ( id, display_name, country, industry )`,
      )
      .eq("to_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Separately resolve profiles for the from_user_ids
    const fromUserIds = [...new Set((data ?? []).map((r) => r.from_user_id).filter(Boolean))] as string[];
    let profileMap = new Map<string, any>();
    if (fromUserIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, legal_name, hq_country, industry")
        .in("id", fromUserIds);
      profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    }

    return (data ?? []).map((r) => ({
      ...r,
      from_profile: profileMap.get(r.from_user_id) ?? null,
    }));
  });

/** Recipient responds to a pending request. On accept, create the supplier linkage. */
export const respondTradeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        accept: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load the request; RLS ensures only the recipient/sender can read it.
    const { data: req, error: rErr } = await supabase
      .from("trade_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!req) throw new Error("Request not found.");
    if (req.to_user_id !== userId) throw new Error("Not authorised.");
    if (req.status !== "pending") throw new Error("This request has already been resolved.");

    const nextStatus = data.accept ? "accepted" : "rejected";
    const { error: uErr } = await supabase
      .from("trade_requests")
      .update({ status: nextStatus, responded_at: new Date().toISOString() })
      .eq("id", data.id);
    if (uErr) throw uErr;

    if (data.accept) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Determine buyer and seller user IDs.
      // direction 'buy'  → from_user_id = buyer,  to_user_id = seller (the one accepting)
      // direction 'sell' → from_user_id = seller, to_user_id = buyer (the one accepting)
      const buyerUserId  = req.direction === "buy" ? req.from_user_id : req.to_user_id!;
      const sellerUserId = req.direction === "buy" ? req.to_user_id! : req.from_user_id;

      // Resolve seller org — prefer stored from_org_id / to_org_id, else upsert from profile
      let sellerOrgId: string | null =
        req.direction === "buy" ? req.to_org_id : req.from_org_id;

      if (!sellerOrgId && sellerUserId) {
        const { data: sellerProfile } = await supabaseAdmin
          .from("profiles")
          .select("legal_name, hq_country, industry")
          .eq("id", sellerUserId)
          .maybeSingle();

        if (sellerProfile?.legal_name?.trim()) {
          const { data: orgId } = await supabaseAdmin.rpc("upsert_organization", {
            _name: sellerProfile.legal_name,
            _country: sellerProfile.hq_country ?? "",
            _industry: sellerProfile.industry ?? "",
          });
          sellerOrgId = (orgId as string) ?? null;
        }
      }

      if (buyerUserId && sellerOrgId) {
        // Insert the seller as a supplier for the buyer (idempotent on conflict).
        await supabaseAdmin
          .from("suppliers")
          .insert({
            owner_id: buyerUserId,
            supplier_org_id: sellerOrgId,
            category: req.category || "",
            criticality: "medium",
            annual_spend_bucket: "",
            product: req.product || "",
            notes: req.product
              ? `Auto-linked via trade request: ${req.product}${req.quantity ? ` × ${req.quantity}` : ""}`
              : "Auto-linked via accepted trade request",
          })
          .then((r) => {
            if (r.error && r.error.code !== "23505") throw r.error;
          });
      }
    }

    return { ok: true, status: nextStatus };
  });

/** List my customers — users who have declared *my* organisation as their supplier. */
export const listMyCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve my org via legal_name
    const { data: profile } = await supabase
      .from("profiles")
      .select("legal_name")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.legal_name?.trim()) return [];

    const { data: norm } = await supabaseAdmin.rpc("normalize_org_name", {
      _name: profile.legal_name,
    });
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("name_norm", norm as string)
      .maybeSingle();
    if (!org) return [];

    // Find everyone who buys from me
    const { data: rows, error } = await supabaseAdmin
      .from("suppliers")
      .select("id, owner_id, category, criticality, notes, created_at")
      .eq("supplier_org_id", org.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!rows?.length) return [];

    const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id)));
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, legal_name, hq_country, industry, work_email")
      .in("id", ownerIds);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    return rows.map((r) => ({
      id: r.id,
      category: r.category,
      criticality: r.criticality,
      notes: r.notes,
      created_at: r.created_at,
      customer: byId.get(r.owner_id) ?? null,
    }));
  });
