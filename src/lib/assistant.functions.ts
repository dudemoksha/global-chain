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
    const { supabase, userId } = context;

    // Pull compact, privacy-respecting context: user's suppliers, inventory, factories, and alerts
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

    const suppliersList = (sup.data ?? []).map((s: any) => ({
      name: s.organizations?.display_name || "Unknown Supplier",
      country: s.organizations?.country || "N/A",
      industry: s.organizations?.industry || "N/A",
      category: s.category || "General",
      criticality: s.criticality || "medium",
      lead_time_days: s.lead_time_days || 0,
    }));

    const inventoryList = (inv.data ?? []).map((i: any) => ({
      sku: i.sku,
      name: i.name,
      current_stock: Number(i.current_stock || 0),
      safety_stock: Number(i.safety_stock || 0),
      reorder_level: Number(i.reorder_level || 0),
      warehouse: i.warehouse || "Default Warehouse",
    }));

    const factoriesList = (fac.data ?? []).map((f: any) => ({
      name: f.name,
      country: f.country || "N/A",
      city: f.city || "N/A",
      capacity_units: Number(f.capacity_units || 0),
      products: f.products || [],
    }));

    const unreadAlerts = alerts.count ?? 0;

    const ctx = {
      suppliers: suppliersList,
      inventory: inventoryList,
      factories: factoriesList,
      unread_alerts: unreadAlerts,
    };

    // Check environment variables for available LLM API keys
    const lovableKey = process.env.LOVABLE_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    let apiUrl = "";
    let apiKey = "";
    let modelName = "";

    if (lovableKey) {
      apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      apiKey = lovableKey;
      modelName = "google/gemini-2.5-flash";
    } else if (openaiKey) {
      apiUrl = "https://api.openai.com/v1/chat/completions";
      apiKey = openaiKey;
      modelName = "gpt-4o-mini";
    } else if (openrouterKey) {
      apiUrl = "https://openrouter.ai/api/v1/chat/completions";
      apiKey = openrouterKey;
      modelName = "google/gemini-2.5-flash";
    } else if (groqKey) {
      apiUrl = "https://api.groq.com/openai/v1/chat/completions";
      apiKey = groqKey;
      modelName = "llama-3.3-70b-versatile";
    } else if (geminiKey) {
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
      apiKey = geminiKey;
      modelName = "gemini-1.5-flash";
    }

    // If an external LLM API key is present, invoke it
    if (apiKey && apiUrl) {
      const system = `You are the Global-Chain assistant, an enterprise supply-chain risk analyst.
Answer briefly and concretely. Use bullets. Cite country and category when relevant.
Privacy rule: the user only sees their direct suppliers; never infer or expose hidden tier-2+ identities.
User context (JSON): ${JSON.stringify(ctx).slice(0, 8000)}`;

      const messages = [
        { role: "system", content: system },
        ...data.history,
        { role: "user", content: data.question },
      ];

      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages,
            temperature: 0.3,
          }),
        });

        if (res.status === 429) throw new Error("Rate limited. Please retry shortly.");
        if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings.");
        if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
        const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
        return { answer: json.choices?.[0]?.message?.content ?? "" };
      } catch (err: any) {
        console.error("LLM API call failed, falling back to local analysis engine:", err);
      }
    }

    // --- Local Data-Driven Risk Engine Fallback (no API key needed) ---
    const qLower = data.question.toLowerCase();

    // 1. Highest risk supplier / critical supplier query
    if (qLower.includes("risk") || qLower.includes("critical") || qLower.includes("supplier")) {
      const highCriticality = suppliersList.filter(
        (s) => String(s.criticality).toLowerCase() === "high" || String(s.criticality).toLowerCase() === "critical"
      );
      const longLeadTime = [...suppliersList].sort((a, b) => b.lead_time_days - a.lead_time_days);

      if (suppliersList.length === 0) {
        return {
          answer: `• No suppliers are currently linked to your account.\n• Add suppliers under the Suppliers tab to begin risk analysis.`,
        };
      }

      let bullets = [];
      if (highCriticality.length > 0) {
        bullets.push(
          `• **Highest-Risk / Critical Suppliers** (${highCriticality.length}):\n` +
            highCriticality
              .map((s) => `  - **${s.name}** (${s.country}) · Category: ${s.category} · Lead time: ${s.lead_time_days} days`)
              .join("\n")
        );
      } else {
        bullets.push(`• **Total Suppliers Monitored**: ${suppliersList.length} supplier(s) active.`);
      }

      if (longLeadTime.length > 0) {
        bullets.push(
          `• **Longest Lead Times**:\n` +
            longLeadTime
              .slice(0, 3)
              .map((s) => `  - **${s.name}** (${s.country}): ${s.lead_time_days} days lead time`)
              .join("\n")
        );
      }

      if (unreadAlerts > 0) {
        bullets.push(`• **Active Alerts**: You have ${unreadAlerts} unread supply chain risk alert(s).`);
      }

      return { answer: bullets.join("\n\n") };
    }

    // 2. Inventory / Replenishment query
    if (qLower.includes("inventory") || qLower.includes("replenish") || qLower.includes("stock")) {
      if (inventoryList.length === 0) {
        return {
          answer: `• No inventory items found in your warehouses.\n• Add items under the Inventory tab to enable stock tracking.`,
        };
      }

      const lowStock = inventoryList.filter(
        (i) => i.current_stock <= i.reorder_level || i.current_stock <= i.safety_stock
      );

      if (lowStock.length > 0) {
        return {
          answer:
            `• **Items Requiring Immediate Replenishment** (${lowStock.length}):\n` +
            lowStock
              .map(
                (i) =>
                  `  - **${i.name}** (SKU: ${i.sku}): Current stock = ${i.current_stock} units (Safety level: ${i.safety_stock}, Reorder level: ${i.reorder_level}) at ${i.warehouse}`
              )
              .join("\n"),
        };
      }

      return {
        answer:
          `• **Inventory Health**: All ${inventoryList.length} item(s) are currently above safety & reorder levels.\n` +
          `• Total tracked inventory items across warehouses: ${inventoryList.length}.`,
      };
    }

    // 3. Disruption / Geographic scenario query (e.g. Japan, earthquake, flood)
    const countriesMentioned = ["japan", "china", "germany", "russia", "usa", "taiwan", "india", "korea", "vietnam", "mexico"];
    const targetCountry = countriesMentioned.find((c) => qLower.includes(c));

    if (targetCountry || qLower.includes("earthquake") || qLower.includes("disruption") || qLower.includes("what if")) {
      const matchCountry = targetCountry || "";
      const affectedSuppliers = suppliersList.filter((s) => s.country.toLowerCase().includes(matchCountry));
      const affectedFactories = factoriesList.filter((f) => f.country.toLowerCase().includes(matchCountry));

      if (affectedSuppliers.length === 0 && affectedFactories.length === 0) {
        return {
          answer:
            `• **Disruption Impact Analysis**:\n` +
            `  - No active suppliers or factories are currently registered in ${matchCountry ? matchCountry.toUpperCase() : "the specified region"}.\n` +
            `  - Direct operations and Tier-1 procurement appear insulated from this geographic disruption.`,
        };
      }

      return {
        answer:
          `• **Disruption Impact Analysis for ${matchCountry ? matchCountry.toUpperCase() : "Regional Event"}**:\n` +
          (affectedSuppliers.length > 0
            ? `  - **Affected Suppliers** (${affectedSuppliers.length}):\n` +
              affectedSuppliers.map((s) => `    * ${s.name} (${s.category}, ${s.criticality} criticality)`).join("\n") +
              "\n"
            : "  - No direct Tier-1 suppliers located in this zone.\n") +
          (affectedFactories.length > 0
            ? `  - **Affected Facilities** (${affectedFactories.length}):\n` +
              affectedFactories.map((f) => `    * ${f.name} in ${f.city} (${f.capacity_units} unit capacity)`).join("\n")
            : "  - No owned factories in this zone."),
      };
    }

    // 4. Default general summary answer
    return {
      answer:
        `• **Supply Chain Overview**:\n` +
        `  - **Suppliers**: ${suppliersList.length} active supplier(s) registered.\n` +
        `  - **Inventory**: ${inventoryList.length} SKU(s) tracked across your facilities.\n` +
        `  - **Factories**: ${factoriesList.length} manufacturing site(s).\n` +
        `  - **Alerts**: ${unreadAlerts} pending unread alert(s).\n\n` +
        `*Tip: You can set an \`OPENAI_API_KEY\`, \`GEMINI_API_KEY\`, or \`LOVABLE_API_KEY\` in your \`.env\` file for full conversational AI responses.*`,
    };
  });
