import { useQuery } from "@tanstack/react-query";
import {
  recommendAlternatives,
  type Recommendation,
} from "@/lib/recommendations.functions";

type Props = {
  title?: string;
  subtitle?: string;
  industry?: string;
  category?: string;
  avoidCountry?: string;
  excludeOrgId?: string | null;
  limit?: number;
  compact?: boolean;
};

/**
 * Shared cross-operator recommendation card. Automatically fetches suggestions
 * whenever the target industry/category/country changes.
 */
export function RecommendationsPanel({
  title = "Recommended alternatives",
  subtitle,
  industry = "",
  category = "",
  avoidCountry = "",
  excludeOrgId = null,
  limit = 5,
  compact = false,
}: Props) {
  const enabled = Boolean(industry || category || avoidCountry || excludeOrgId);
  const q = useQuery({
    queryKey: [
      "recommendations",
      { industry, category, avoidCountry, excludeOrgId, limit },
    ],
    queryFn: () =>
      recommendAlternatives({
        data: {
          industry,
          category,
          avoid_country: avoidCountry,
          exclude_org_id: excludeOrgId ?? null,
          limit,
        },
      }),
    enabled,
    staleTime: 30_000,
  });

  return (
    <div className={compact ? "" : "rounded-md border border-border bg-card p-5"}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="mono-label">{title}</div>
        {q.data && q.data.length > 0 && (
          <span className="mono-label">{q.data.length} match{q.data.length === 1 ? "" : "es"}</span>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>
      )}

      {!enabled ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Provide an industry, category, or affected country to see cross-operator matches.
        </p>
      ) : q.isLoading ? (
        <ul className="mt-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="h-14 animate-pulse rounded-md bg-surface" />
          ))}
        </ul>
      ) : q.error ? (
        <p className="mt-3 text-[13px] text-destructive">
          Couldn't load recommendations.
        </p>
      ) : !q.data || q.data.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          No cross-operator matches yet. As more operators declare suppliers in this category, alternates surface here automatically.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {q.data.map((r) => (
            <RecCard key={r.org_id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecCard({ r }: { r: Recommendation }) {
  return (
    <li className="rounded-md border border-border p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium">{r.name}</div>
          <div className="mono-label mt-0.5">
            {[r.country, r.industry].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <div className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
          fit {r.score}
        </div>
      </div>
      {r.reasons.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {r.reasons.map((why, i) => (
            <li
              key={i}
              className="rounded-sm bg-surface px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {why}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
