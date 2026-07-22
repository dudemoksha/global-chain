import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({
    meta: [
      { title: "Assistant · Global-Chain" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(meQuery);
    return null;
  },
  component: AssistantPage,
});

// ─── Predefined Q&A ─────────────────────────────────────────────────────────

type SB = typeof supabase;

interface Question {
  id: string;
  label: string;
  icon: string;
  description: string;
  fetch: (userId: string, sb: SB) => Promise<string>;
}

const QUESTIONS: Question[] = [
  {
    id: "suppliers_count",
    label: "How many suppliers do I have?",
    icon: "🏭",
    description: "Total active suppliers linked to your account",
    fetch: async (userId, sb) => {
      const { data, error } = await sb
        .from("suppliers")
        .select("id, criticality, supplier_org:supplier_org_id(display_name, country)")
        .eq("owner_id", userId)
        .eq("is_stopped", false);
      if (error) throw error;
      const count = data?.length ?? 0;
      if (count === 0) return "You have no active suppliers. Go to Suppliers to add your first.";
      const critical = data.filter((s: any) => s.criticality === "critical").length;
      let msg = `You have **${count} active supplier${count !== 1 ? "s" : ""}**.`;
      if (critical > 0) msg += `\n\n⚠️ **${critical}** ${critical === 1 ? "is" : "are"} marked as **critical**.`;
      return msg;
    },
  },
  {
    id: "low_stock",
    label: "Which SKUs are low or critical stock?",
    icon: "📦",
    description: "Inventory levels at or below reorder point",
    fetch: async (userId, sb) => {
      const { data, error } = await sb
        .from("inventory_items")
        .select("name, sku, current_stock, reorder_level, safety_stock")
        .eq("owner_id", userId);
      if (error) throw error;
      const items = data || [];
      const low = items.filter((i: any) => i.current_stock <= i.reorder_level);
      if (items.length === 0) return "No inventory SKUs registered yet.";
      if (low.length === 0) return `All **${items.length} SKU${items.length !== 1 ? "s" : ""}** are above reorder level. Stock levels look healthy.`;
      let msg = `${low.length} of ${items.length} SKUs need attention:\n\n`;
      low.forEach((i: any) => {
        const tag = i.current_stock <= i.safety_stock ? "🔴 CRITICAL" : "🟡 Low";
        msg += `${tag} — **${i.name}** (${i.sku}): ${i.current_stock} units (reorder at ${i.reorder_level})\n`;
      });
      return msg;
    },
  },
  {
    id: "pending_requests",
    label: "What trade requests are pending?",
    icon: "📋",
    description: "Incoming requests awaiting your response",
    fetch: async (userId, sb) => {
      const { data, error } = await sb
        .from("trade_requests")
        .select("id, direction, product, quantity, from_user_id")
        .eq("to_user_id", userId)
        .eq("status", "pending");
      if (error) throw error;
      if (!data || data.length === 0) return "No pending incoming trade requests. Your inbox is clear.";

      // Fetch profiles manually
      const userIds = Array.from(new Set(data.map((r: any) => r.from_user_id).filter(Boolean)));
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, legal_name")
        .in("id", userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.legal_name]));

      let msg = `You have **${data.length} pending request${data.length !== 1 ? "s" : ""}**:\n\n`;
      data.forEach((r: any) => {
        const from = profileMap.get(r.from_user_id) || "Unknown";
        const dir = r.direction === "buy" ? "wants to buy from you" : "offers to sell to you";
        msg += `• **${from}** ${dir}: ${r.product}${r.quantity ? ` (${r.quantity})` : ""}\n`;
      });
      return msg;
    },
  },
  {
    id: "active_alerts",
    label: "Do I have any active alerts?",
    icon: "🔔",
    description: "Unread risk signals and disruption alerts",
    fetch: async (userId, sb) => {
      const { data, error } = await sb
        .from("alerts")
        .select("id, headline, severity, kind, country")
        .eq("user_id", userId)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      if (!data || data.length === 0) return "No unread alerts. Your supply chain looks stable.";
      const highs = data.filter((a: any) => a.severity === "high" || a.severity === "critical");
      let msg = `You have **${data.length} unread alert${data.length !== 1 ? "s" : ""}**`;
      if (highs.length > 0) msg += ` (${highs.length} high/critical)`;
      msg += ":\n\n";
      data.slice(0, 6).forEach((a: any) => {
        const sev = a.severity === "high" || a.severity === "critical" ? "🔴" : a.severity === "medium" ? "🟡" : "🟢";
        msg += `${sev} **${a.headline}**`;
        if (a.country) msg += ` — ${a.country}`;
        msg += "\n";
      });
      if (data.length > 6) msg += `\n…and ${data.length - 6} more.`;
      return msg;
    },
  },
  {
    id: "customers_count",
    label: "How many customers do I have?",
    icon: "🤝",
    description: "Accepted relationships where you supply",
    fetch: async (userId, sb) => {
      const { data, error } = await sb
        .from("trade_requests")
        .select("id, to_user_id")
        .eq("from_user_id", userId)
        .eq("status", "accepted")
        .eq("direction", "sell");
      if (error) throw error;
      const count = data?.length ?? 0;
      if (count === 0) return "No accepted customer relationships yet. Use Customers → Propose to reach new buyers.";

      // Fetch profiles manually
      const userIds = Array.from(new Set(data.map((r: any) => r.to_user_id).filter(Boolean)));
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, legal_name")
        .in("id", userIds);
      const names = [...new Set((profiles || []).map((p: any) => p.legal_name).filter(Boolean))];

      let msg = `You have **${count} accepted supply relationship${count !== 1 ? "s" : ""}**.\n\n`;
      if (names.length > 0) msg += "Companies buying from you:\n" + names.map((n) => `• ${n}`).join("\n");
      return msg;
    },
  },
  {
    id: "warehouses_status",
    label: "What are my warehouse locations?",
    icon: "🏗️",
    description: "Active warehouses and their locations",
    fetch: async (userId, sb) => {
      const { data, error } = await sb
        .from("warehouses")
        .select("name, country, city, capacity_units")
        .eq("owner_id", userId);
      if (error) throw error;
      if (!data || data.length === 0) return "No warehouses registered. Go to Warehouses to add storage locations.";
      let msg = `You have **${data.length} warehouse${data.length !== 1 ? "s" : ""}**:\n\n`;
      data.forEach((w: any) => {
        msg += `• **${w.name}** — ${[w.city, w.country].filter(Boolean).join(", ")}`;
        if (w.capacity_units) msg += ` (${w.capacity_units} units capacity)`;
        msg += "\n";
      });
      return msg;
    },
  },
  {
    id: "highest_risk_supplier",
    label: "Which supplier is most critical?",
    icon: "⚠️",
    description: "Critical and long-lead-time suppliers in your network",
    fetch: async (userId, sb) => {
      const { data, error } = await sb
        .from("suppliers")
        .select("criticality, lead_time_days, category, product, supplier_org:supplier_org_id(display_name, country)")
        .eq("owner_id", userId)
        .eq("is_stopped", false)
        .order("lead_time_days", { ascending: false })
        .limit(5);
      if (error) throw error;
      if (!data || data.length === 0) return "No suppliers registered yet.";
      const criticals = (data as any[]).filter((s) => s.criticality === "critical");
      let msg = "";
      if (criticals.length > 0) {
        msg += `You have **${criticals.length} critical supplier${criticals.length !== 1 ? "s" : ""}**:\n\n`;
        criticals.forEach((s: any) => {
          msg += `• **${s.supplier_org?.display_name || "Unknown"}**${s.supplier_org?.country ? ` (${s.supplier_org.country})` : ""}`;
          if (s.product) msg += ` — ${s.product}`;
          if (s.lead_time_days) msg += ` — lead time: **${s.lead_time_days} days**`;
          msg += "\n";
        });
      } else {
        msg = "No critical suppliers. ";
      }
      const highLead = (data as any[]).filter((s) => s.lead_time_days && s.lead_time_days > 30);
      if (highLead.length > 0)
        msg += `\n**${highLead.length} supplier${highLead.length !== 1 ? "s" : ""}** have lead times over 30 days.`;
      return msg;
    },
  },
  {
    id: "total_inventory",
    label: "How much inventory do I have total?",
    icon: "📊",
    description: "Aggregate SKU count and stock summary",
    fetch: async (userId, sb) => {
      const { data, error } = await sb
        .from("inventory_items")
        .select("name, current_stock, unit")
        .eq("owner_id", userId);
      if (error) throw error;
      if (!data || data.length === 0) return "No inventory SKUs registered yet.";
      const total = data.reduce((sum: number, i: any) => sum + (i.current_stock || 0), 0);
      let msg = `You have **${data.length} SKU${data.length !== 1 ? "s" : ""}** with **${total.toLocaleString()} total units** in stock.\n\n`;
      msg += "Top items by quantity:\n";
      [...data]
        .sort((a: any, b: any) => (b.current_stock || 0) - (a.current_stock || 0))
        .slice(0, 5)
        .forEach((i: any) => {
          msg += `• **${i.name}**: ${(i.current_stock || 0).toLocaleString()}${i.unit ? " " + i.unit : " units"}\n`;
        });
      return msg;
    },
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

function AssistantPage() {
  const { data: me } = useSuspenseQuery(meQuery);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const userId = me.profile?.id ?? "";

  const handleQuestion = async (q: Question) => {
    if (!userId) return;
    setActiveQuestion(q);
    setAnswer(null);
    setErr(null);
    setLoading(true);
    try {
      const result = await q.fetch(userId, supabaseClient);
      setAnswer(result);
    } catch (e) {
      setErr((e as Error).message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setActiveQuestion(null);
    setAnswer(null);
    setErr(null);
  };

  const renderAnswer = (text: string) =>
    text.split("\n").map((line, i) => {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      return (
        <p key={i} className={`leading-relaxed ${line === "" ? "h-3" : ""}`}>
          {parts.map((part, j) =>
            j % 2 === 1 ? (
              <strong key={j} className="font-semibold text-foreground">
                {part}
              </strong>
            ) : (
              part
            ),
          )}
        </p>
      );
    });

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile?.work_email ?? ""}>
      <div className="mx-auto max-w-[860px] px-6 pb-16 pt-10">
        {/* Header */}
        <div className="mb-8">
          <div className="mono-label">§ Supply Chain Assistant</div>
          <h1 className="mt-2 font-display text-[30px] font-medium tracking-tight">Assistant</h1>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            Select a question below to get real-time answers from your supply chain data. No typing required.
          </p>
        </div>

        {activeQuestion ? (
          <div>
            <button
              onClick={reset}
              className="mb-6 flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to questions
            </button>

            {/* Answer card */}
            <div className="rounded-md border border-border bg-card p-6 mb-6">
              <div className="flex items-start gap-3 border-b border-border pb-4 mb-4">
                <span className="text-2xl">{activeQuestion.icon}</span>
                <div>
                  <div className="font-medium text-[15px]">{activeQuestion.label}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">{activeQuestion.description}</div>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[13.5px]">Fetching your data…</span>
                </div>
              ) : err ? (
                <div className="text-[13.5px] text-destructive">{err}</div>
              ) : answer ? (
                <div className="text-[13.5px] text-muted-foreground space-y-1">{renderAnswer(answer)}</div>
              ) : null}
            </div>

            <div>
              <div className="mono-label mb-3">Ask another question</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {QUESTIONS.filter((q) => q.id !== activeQuestion.id)
                  .slice(0, 4)
                  .map((q) => (
                    <button
                      key={q.id}
                      onClick={() => handleQuestion(q)}
                      className="flex items-center gap-3 rounded-md border border-border bg-card p-4 text-left hover:border-foreground/40 transition-colors group"
                    >
                      <span className="text-lg">{q.icon}</span>
                      <span className="flex-1 text-[13px] font-medium">{q.label}</span>
                      <span className="text-muted-foreground group-hover:translate-x-0.5 transition-transform">→</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {QUESTIONS.map((q) => (
              <button
                key={q.id}
                onClick={() => handleQuestion(q)}
                className="flex items-center gap-4 rounded-md border border-border bg-card p-5 text-left hover:border-foreground/40 hover:shadow-sm transition-all group"
              >
                <span className="text-2xl">{q.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-foreground">{q.label}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">{q.description}</div>
                </div>
                <span className="text-muted-foreground group-hover:translate-x-0.5 transition-transform">→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
