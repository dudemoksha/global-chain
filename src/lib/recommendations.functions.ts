import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const input = z.object({
  industry: z.string().trim().max(120).default(""),
  category: z.string().trim().max(120).default(""),
  avoid_country: z.string().trim().max(80).default(""),
  exclude_org_id: z.string().uuid().nullable().optional(),
  limit: z.number().int().min(1).max(12).default(5),
});

export type Recommendation = {
  org_id: string;
  name: string;
  country: string;
  industry: string;
  categories: string[];
  operator_count: number;
  score: number;
  reasons: string[];
};

/**
 * Cross-operator recommendation engine. Given a target industry/category and
 * a country to avoid, returns candidate alternate organisations drawn from
 * every operator's declared suppliers on Global-Chain. Identities of the
 * declaring operators are never exposed — only aggregated stats.
 */
export const recommendAlternatives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pull cross-operator supplier records (admin, RLS-bypass — but we only
    // return aggregates + organisation metadata, never owner_id).
    const { data: rows, error } = await supabaseAdmin
      .from("suppliers")
      .select(
        `owner_id, category, criticality,
         organizations:supplier_org_id ( id, display_name, country, industry )`,
      )
      .limit(2000);
    if (error) throw error;

    // Also exclude the caller's own tier-1 orgs.
    const { data: own } = await supabaseAdmin
      .from("suppliers")
      .select("supplier_org_id")
      .eq("owner_id", userId);
    const ownSet = new Set((own ?? []).map((r) => r.supplier_org_id).filter(Boolean));

    // Exclude the user's own organization itself
    const { data: myProfile } = await supabaseAdmin
      .from("profiles")
      .select("legal_name")
      .eq("id", userId)
      .maybeSingle();
    if (myProfile?.legal_name) {
      const norm = myProfile.legal_name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const { data: myOrg } = await supabaseAdmin
        .from("organizations")
        .select("id")
        .eq("name_norm", norm)
        .maybeSingle();
      if (myOrg) {
        ownSet.add(myOrg.id);
      }
    }

    type Agg = {
      org_id: string;
      name: string;
      country: string;
      industry: string;
      categories: Set<string>;
      operators: Set<string>;
    };
    const byOrg = new Map<string, Agg>();
    for (const r of rows ?? []) {
      const o = r.organizations;
      if (!o) continue;
      if (ownSet.has(o.id)) continue;
      if (data.exclude_org_id && o.id === data.exclude_org_id) continue;

      // Exclude by name comparison
      if (myProfile?.legal_name) {
        const myNameNorm = myProfile.legal_name.toLowerCase().replace(/[^a-z0-9]/g, "");
        const otherNameNorm = o.display_name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (myNameNorm === otherNameNorm || o.display_name.toLowerCase().includes(myProfile.legal_name.toLowerCase())) {
          continue;
        }
      }
      let agg = byOrg.get(o.id);
      if (!agg) {
        agg = {
          org_id: o.id,
          name: o.display_name,
          country: o.country ?? "",
          industry: o.industry ?? "",
          categories: new Set(),
          operators: new Set(),
        };
        byOrg.set(o.id, agg);
      }
      if (r.category) agg.categories.add(r.category);
      agg.operators.add(r.owner_id);
    }

    const wantIndustry = data.industry.trim().toLowerCase();
    const wantCategory = data.category.trim().toLowerCase();
    // Support comma-separated list of countries to avoid (e.g. "India,Russia")
    const avoidSet = new Set(
      data.avoid_country
        .split(",")
        .map((c: string) => c.trim().toLowerCase())
        .filter(Boolean),
    );

    const scored: Recommendation[] = [];
    for (const a of byOrg.values()) {
      // Hard-exclude any org located inside ANY of the disruption zones
      if (avoidSet.size > 0 && a.country && avoidSet.has(a.country.toLowerCase())) {
        continue;
      }

      const reasons: string[] = [];
      let score = 0;
      if (wantIndustry && a.industry.toLowerCase() === wantIndustry) {
        score += 3;
        reasons.push(`Same industry (${a.industry})`);
      }
      if (wantCategory) {
        const hit = [...a.categories].some(
          (c) => c.toLowerCase() === wantCategory,
        );
        if (hit) {
          score += 2;
          reasons.push(`Serves category: ${data.category}`);
        }
      }
      if (avoidSet.size > 0 && a.country) {
        score += 1;
        reasons.push(`Located in ${a.country} — outside disruption zone`);
      }
      if (a.operators.size >= 2) {
        score += 1;
        reasons.push(`Trusted by ${a.operators.size} operators`);
      }
      if (score <= 0) continue;
      scored.push({
        org_id: a.org_id,
        name: a.name,
        country: a.country,
        industry: a.industry,
        categories: [...a.categories].slice(0, 4),
        operator_count: a.operators.size,
        score,
        reasons,
      });
    }

    scored.sort(
      (x, y) => y.score - x.score || y.operator_count - x.operator_count,
    );
    return scored.slice(0, data.limit);
  });
