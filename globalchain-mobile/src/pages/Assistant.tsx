import React, { useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../context/AuthContext';
import { Bot, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';

// ─── Predefined questions with DB-backed answer logic ───────────────────────
interface Question {
  id: string;
  label: string;
  icon: string;
  description: string;
  fetch: (userId: string) => Promise<string>;
}

const QUESTIONS: Question[] = [
  {
    id: 'suppliers_count',
    label: 'How many suppliers do I have?',
    icon: '🏭',
    description: 'Total suppliers linked to your account',
    fetch: async (userId) => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, category, criticality, supplier_org:supplier_org_id(display_name, country)')
        .eq('owner_id', userId)
        .eq('is_stopped', false);
      if (error) throw error;
      const count = data?.length ?? 0;
      if (count === 0) return 'You have no active suppliers. Go to Suppliers to add your first.';
      const critical = data.filter((s: any) => s.criticality === 'critical').length;
      let msg = `You have **${count} active supplier${count !== 1 ? 's' : ''}**.`;
      if (critical > 0) msg += `\n\n⚠️ **${critical}** of them ${critical === 1 ? 'is' : 'are'} marked as **critical**.`;
      return msg;
    },
  },
  {
    id: 'low_stock',
    label: 'Which SKUs are low or critical stock?',
    icon: '📦',
    description: 'Inventory levels at or below reorder point',
    fetch: async (userId) => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('name, sku, current_stock, reorder_level, safety_stock')
        .eq('owner_id', userId);
      if (error) throw error;
      const items = data || [];
      const low = items.filter((i: any) => i.current_stock <= i.reorder_level);
      if (items.length === 0) return 'No inventory SKUs registered yet. Go to My SKUs to add items.';
      if (low.length === 0) return `All **${items.length} SKU${items.length !== 1 ? 's' : ''}** are above reorder level. Stock levels look healthy.`;
      let msg = `${low.length} of ${items.length} SKU${items.length !== 1 ? 's' : ''} need attention:\n\n`;
      low.forEach((i: any) => {
        const tag = i.current_stock <= i.safety_stock ? '🔴 CRITICAL' : '🟡 Low';
        msg += `${tag} — **${i.name}** (${i.sku}): ${i.current_stock} units (reorder at ${i.reorder_level})\n`;
      });
      const critical = low.filter((i: any) => i.current_stock <= i.safety_stock);
      if (critical.length > 0) msg += `\n⚠️ ${critical.length} item${critical.length !== 1 ? 's are' : ' is'} below safety stock — reorder immediately.`;
      return msg;
    },
  },
  {
    id: 'pending_requests',
    label: 'What trade requests are pending?',
    icon: '📋',
    description: 'Incoming requests waiting for your response',
    fetch: async (userId) => {
      const { data, error } = await supabase
        .from('trade_requests')
        .select('id, direction, product, quantity, from_user_id')
        .eq('to_user_id', userId)
        .eq('status', 'pending');
      if (error) throw error;
      if (!data || data.length === 0) return 'No pending incoming trade requests. Your inbox is clear.';
      
      // Fetch profiles manually
      const userIds = Array.from(new Set(data.map((r: any) => r.from_user_id).filter(Boolean)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, legal_name')
        .in('id', userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.legal_name]));

      let msg = `You have **${data.length} pending request${data.length !== 1 ? 's' : ''}**:\n\n`;
      data.forEach((r: any) => {
        const from = profileMap.get(r.from_user_id) || 'Unknown';
        const dir = r.direction === 'buy' ? 'wants to buy from you' : 'offers to sell to you';
        msg += `• **${from}** ${dir}: ${r.product}${r.quantity ? ` (${r.quantity})` : ''}\n`;
      });
      return msg;
    },
  },
  {
    id: 'active_alerts',
    label: 'Do I have any active alerts?',
    icon: '🔔',
    description: 'Risk signals and disruption alerts for your supply chain',
    fetch: async (userId) => {
      const { data, error } = await supabase
        .from('alerts')
        .select('id, headline, severity, kind, country')
        .eq('user_id', userId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      if (!data || data.length === 0) return 'No unread alerts at this time. Your supply chain looks stable.';
      const highs = data.filter((a: any) => a.severity === 'high' || a.severity === 'critical');
      let msg = `You have **${data.length} unread alert${data.length !== 1 ? 's' : ''}**`;
      if (highs.length > 0) msg += ` (${highs.length} high/critical)`;
      msg += ':\n\n';
      data.slice(0, 6).forEach((a: any) => {
        const sev = a.severity === 'high' || a.severity === 'critical' ? '🔴' : a.severity === 'medium' ? '🟡' : '🟢';
        msg += `${sev} **${a.headline}**`;
        if (a.country) msg += ` — ${a.country}`;
        msg += '\n';
      });
      if (data.length > 6) msg += `\n…and ${data.length - 6} more. View all in Alerts.`;
      return msg;
    },
  },
  {
    id: 'customers_count',
    label: 'How many customers do I have?',
    icon: '🤝',
    description: 'Accepted trade relationships where you supply',
    fetch: async (userId) => {
      const { data, error } = await supabase
        .from('trade_requests')
        .select('id, to_user_id')
        .eq('from_user_id', userId)
        .eq('status', 'accepted')
        .eq('direction', 'sell');
      if (error) throw error;
      const count = data?.length ?? 0;
      if (count === 0) return 'No accepted customer relationships yet. Use Customers → Propose to reach new buyers.';
      
      // Fetch profiles manually
      const userIds = Array.from(new Set(data.map((r: any) => r.to_user_id).filter(Boolean)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, legal_name')
        .in('id', userIds);
      const names = [...new Set((profiles || []).map((p: any) => p.legal_name).filter(Boolean))];

      let msg = `You have **${count} accepted supply relationship${count !== 1 ? 's' : ''}**.\n\n`;
      if (names.length > 0) msg += 'Companies buying from you:\n' + names.map((n) => `• ${n}`).join('\n');
      return msg;
    },
  },
  {
    id: 'warehouses_status',
    label: 'What are my warehouse locations?',
    icon: '🏗️',
    description: 'Active warehouses and their locations',
    fetch: async (userId) => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('name, country, city, capacity_units')
        .eq('owner_id', userId);
      if (error) throw error;
      if (!data || data.length === 0) return 'No warehouses registered. Go to Warehouses to add storage locations.';
      let msg = `You have **${data.length} warehouse${data.length !== 1 ? 's' : ''}**:\n\n`;
      data.forEach((w: any) => {
        msg += `• **${w.name}** — ${[w.city, w.country].filter(Boolean).join(', ')}`;
        if (w.capacity_units) msg += ` (${w.capacity_units} units capacity)`;
        msg += '\n';
      });
      return msg;
    },
  },
  {
    id: 'highest_risk_supplier',
    label: 'Which supplier is most critical?',
    icon: '⚠️',
    description: 'Critical and high-lead-time suppliers in your network',
    fetch: async (userId) => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('criticality, lead_time_days, category, product, supplier_org:supplier_org_id(display_name, country)')
        .eq('owner_id', userId)
        .eq('is_stopped', false)
        .order('lead_time_days', { ascending: false })
        .limit(5);
      if (error) throw error;
      if (!data || data.length === 0) return 'No suppliers registered yet. Add suppliers to track risk levels.';
      const criticals = (data as any[]).filter(s => s.criticality === 'critical');
      if (criticals.length === 0 && data.length === 0) return 'No suppliers with criticality data found.';
      let msg = '';
      if (criticals.length > 0) {
        msg += `You have **${criticals.length} critical supplier${criticals.length !== 1 ? 's' : ''}**:\n\n`;
        criticals.forEach((s: any) => {
          msg += `• **${s.supplier_org?.display_name || 'Unknown'}**${s.supplier_org?.country ? ` (${s.supplier_org.country})` : ''}`;
          if (s.product) msg += ` — ${s.product}`;
          if (s.lead_time_days) msg += ` — lead time: **${s.lead_time_days} days**`;
          msg += '\n';
        });
      } else {
        msg = 'No critical suppliers. ';
      }
      const highLead = (data as any[]).filter(s => s.lead_time_days && s.lead_time_days > 30);
      if (highLead.length > 0) {
        msg += `\n**${highLead.length} supplier${highLead.length !== 1 ? 's' : ''}** have lead times over 30 days — consider dual-sourcing.`;
      }
      return msg;
    },
  },
  {
    id: 'total_inventory',
    label: 'How much inventory do I have total?',
    icon: '📊',
    description: 'Aggregate SKU count and stock summary',
    fetch: async (userId) => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('name, current_stock, unit')
        .eq('owner_id', userId);
      if (error) throw error;
      if (!data || data.length === 0) return 'No inventory SKUs registered yet. Go to My SKUs to add items.';
      const total = data.reduce((sum: number, i: any) => sum + (i.current_stock || 0), 0);
      let msg = `You have **${data.length} SKU${data.length !== 1 ? 's' : ''}** with a total of **${total.toLocaleString()} units** in stock.\n\n`;
      msg += 'Top items by quantity:\n';
      [...data].sort((a: any, b: any) => (b.current_stock || 0) - (a.current_stock || 0)).slice(0, 5).forEach((i: any) => {
        msg += `• **${i.name}**: ${(i.current_stock || 0).toLocaleString()}${i.unit ? ' ' + i.unit : ' units'}\n`;
      });
      return msg;
    },
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export const Assistant: React.FC = () => {
  const { user } = useAuth();
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuestion = async (q: Question) => {
    if (!user) return;
    setActiveQuestion(q);
    setAnswer(null);
    setError(null);
    setLoading(true);
    try {
      const result = await q.fetch(user.id);
      setAnswer(result);
    } catch (e: any) {
      setError(e.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setActiveQuestion(null);
    setAnswer(null);
    setError(null);
  };

  // Render answer text with **bold** markdown support
  const renderAnswer = (text: string) => {
    return text.split('\n').map((line, i) => {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      return (
        <p key={i} className={`leading-relaxed ${line === '' ? 'h-2' : ''}`}>
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j} className="font-semibold text-foreground">{part}</strong> : part
          )}
        </p>
      );
    });
  };

  return (
    <div className="px-4 pb-8">
      {/* Header */}
      <div className="pt-6 pb-5 border-b border-border mb-5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center text-primary">
            <Bot size={17} />
          </div>
          <div>
            <div className="mono-label !text-primary">§ Supply Chain Assistant</div>
            <p className="text-[12px] text-muted-foreground">
              Select a question to get real-time data from your account
            </p>
          </div>
        </div>
      </div>

      {/* Answer panel */}
      {activeQuestion ? (
        <div>
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to questions
          </button>

          <div className="rounded-xl border border-border bg-card p-4 mb-4">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
              <span className="text-xl">{activeQuestion.icon}</span>
              <span className="text-[13.5px] font-medium">{activeQuestion.label}</span>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[13px]">Fetching your data…</span>
              </div>
            ) : error ? (
              <div className="text-[13px] text-destructive py-2">{error}</div>
            ) : answer ? (
              <div className="text-[13px] text-muted-foreground space-y-0.5">
                {renderAnswer(answer)}
              </div>
            ) : null}
          </div>

          {/* Ask another */}
          <div className="mt-6">
            <div className="mono-label mb-3">Ask another question</div>
            <div className="space-y-2">
              {QUESTIONS.filter(q => q.id !== activeQuestion.id).slice(0, 3).map(q => (
                <button
                  key={q.id}
                  onClick={() => handleQuestion(q)}
                  className="w-full flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:border-foreground/30 hover:bg-surface transition-all"
                >
                  <span className="text-base">{q.icon}</span>
                  <span className="flex-1 text-[12.5px] font-medium">{q.label}</span>
                  <ChevronRight size={14} className="text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="mono-label mb-3">What would you like to know?</div>
          {QUESTIONS.map((q) => (
            <button
              key={q.id}
              onClick={() => handleQuestion(q)}
              className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left hover:border-foreground/30 hover:bg-surface transition-all group"
            >
              <span className="text-xl">{q.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium text-foreground">{q.label}</div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5">{q.description}</div>
              </div>
              <ChevronRight size={15} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
