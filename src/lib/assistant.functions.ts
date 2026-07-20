import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const askInput = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .default([]),
});

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => askInput.parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { supabase, userId } = context;

    // Pull compact, privacy-respecting context: only this user's tier-1 suppliers,
    // their own inventory, own factories, and their unread alerts count.
    const [sup, inv, fac, alerts] = await Promise.all([
      supabase
        .from("suppliers")
        .select("category, criticality, lead_time_days, organizations:supplier_org_id(display_name, country, industry)")
        .eq("owner_id", userId)
        .limit(30),
      supabase
        .from("inventory_items")
        .select("sku, name, current_stock, safety_stock, reorder_level, warehouse")
        .eq("owner_id", userId)
        .limit(30),
      supabase
        .from("factories")
        .select("name, country, city, capacity_units, products")
        .eq("owner_id", userId)
        .limit(20),
      supabase.from("alerts").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);

    const ctx = {
      suppliers: (sup.data ?? []).map((s: any) => ({
        name: s.organizations?.display_name,
        country: s.organizations?.country,
        industry: s.organizations?.industry,
        category: s.category,
        criticality: s.criticality,
        lead_time_days: s.lead_time_days,
      })),
      inventory: inv.data ?? [],
      factories: fac.data ?? [],
      unread_alerts: alerts.count ?? 0,
    };

    const system = `You are the Global-Chain assistant, an enterprise supply-chain risk analyst.
Answer briefly and concretely. Use bullets. Cite country and category when relevant.
Privacy rule: the user only sees their direct suppliers; never infer or expose hidden tier-2+ identities.
User context (JSON): ${JSON.stringify(ctx).slice(0, 8000)}`;

    const messages = [
      { role: "system", content: system },
      ...data.history,
      { role: "user", content: data.question },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.3,
      }),
    });

    if (res.status === 429) throw new Error("Rate limited. Please retry shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings.");
    if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return { answer: json.choices?.[0]?.message?.content ?? "" };
  });
