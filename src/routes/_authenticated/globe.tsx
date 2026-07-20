import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { AppShell } from "@/components/site/app-shell";
import { getMyProfile } from "@/lib/profile.functions";
import { getMySupplyGraph, listMySuppliers } from "@/lib/suppliers.functions";
import { getLiveEvents } from "@/lib/live-signals.functions";
import { countryToLatLng, jitter } from "@/lib/country-coords";
import { generateSignals, severityColor } from "@/lib/risk-signals";


const GlobeView = lazy(() => import("@/components/site/globe-view"));

const meQuery = queryOptions({ queryKey: ["me"], queryFn: () => getMyProfile() });
const suppliersQuery = queryOptions({
  queryKey: ["suppliers", "mine"],
  queryFn: () => listMySuppliers(),
});
const graphQuery = queryOptions({
  queryKey: ["suppliers", "graph"],
  queryFn: () => getMySupplyGraph(),
});

export const Route = createFileRoute("/_authenticated/globe")({
  head: () => ({
    meta: [
      { title: "Globe · Global-Chain" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (me.profile?.is_approved || me.isAdmin) {
      await Promise.all([
        context.queryClient.ensureQueryData(suppliersQuery).catch(() => []),
        context.queryClient.ensureQueryData(graphQuery).catch(() => []),
      ]);
    }
    return null;
  },
  component: GlobePage,
});

function GlobePage() {
  const { data: me } = useSuspenseQuery(meQuery);

  if (!me.profile) return null;

  if (!me.profile.is_approved && !me.isAdmin) {
    return (
      <AppShell isAdmin={me.isAdmin} email={me.profile.work_email}>
        <UnderReview />
      </AppShell>
    );
  }

  return (
    <AppShell isAdmin={me.isAdmin} email={me.profile.work_email}>
      <GlobeBody selfName={me.profile.legal_name || "Your organisation"} />
    </AppShell>
  );
}

function GlobeBody({ selfName }: { selfName: string }) {
  const { data: suppliers } = useSuspenseQuery(suppliersQuery);
  const { data: graph } = useSuspenseQuery(graphQuery);
  const liveQ = useQuery({
    queryKey: ["live-events"],
    queryFn: () => getLiveEvents(),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  const [focus, setFocus] = useState<string | null>(null);


  // Build node & arc datasets.
  const { nodes, arcs, signals } = useMemo(() => {
    const nodeMap = new Map<string, {
      id: string;
      name: string;
      country: string;
      tier: 0 | 1 | 2;
      lat: number;
      lng: number;
    }>();

    // Self node — anchor at first supplier country or generic centre.
    const anchor = countryToLatLng(suppliers[0]?.organizations?.country ?? null) ?? { lat: 20, lng: 0 };
    const selfLoc = jitter({ lat: anchor.lat + 8, lng: anchor.lng - 8 }, selfName);
    nodeMap.set("self", { id: "self", name: selfName, country: "You", tier: 0, ...selfLoc });

    suppliers.forEach((s) => {
      const org = s.organizations;
      if (!org) return;
      const base = countryToLatLng(org.country);
      if (!base) return;
      const loc = jitter(base, org.id);
      nodeMap.set(org.id, {
        id: org.id,
        name: org.display_name,
        country: org.country || "—",
        tier: 1,
        ...loc,
      });
    });

    graph
      .filter((g) => g.tier === 2)
      .forEach((g) => {
        if (nodeMap.has(g.supplier_org_id)) return;
        const base = countryToLatLng(g.supplier_country);
        if (!base) return;
        const loc = jitter(base, g.supplier_org_id);
        nodeMap.set(g.supplier_org_id, {
          id: g.supplier_org_id,
          name: g.supplier_name,
          country: g.supplier_country || "—",
          tier: 2,
          ...loc,
        });
      });

    // Signals feed grounded in nodes.
    const signalOrgs = Array.from(nodeMap.values())
      .filter((n) => n.tier !== 0)
      .map((n) => ({ id: n.id, name: n.name, country: n.country }));
    const mockSignals = generateSignals(signalOrgs);

    // Fold in live GDELT/USGS events touching these nodes.
    const liveSignals = (liveQ.data ?? []).map((e) => ({
      id: e.id,
      country: e.country,
      region: e.region,
      kind: e.kind as ReturnType<typeof generateSignals>[number]["kind"],
      severity: e.severity as ReturnType<typeof generateSignals>[number]["severity"],
      headline: e.headline,
      detail: e.detail,
      affectsOrgIds: e.affectsOrgIds,
      hoursAgo: e.hoursAgo,
    }));
    const signals = [...liveSignals, ...mockSignals];

    // Map impacted org → worst severity.
    const impactRank: Record<string, number> = {};
    const sevScore: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    signals.forEach((s) => {
      s.affectsOrgIds.forEach((oid) => {
        const cur = impactRank[oid] ?? 0;
        const sc = sevScore[s.severity];
        if (sc > cur) impactRank[oid] = sc;
      });
    });


    const nodeList = Array.from(nodeMap.values()).map((n) => ({
      ...n,
      impact: impactRank[n.id] ?? 0,
    }));

    // Arcs: self → tier1
    const arcs: Array<{
      startLat: number;
      startLng: number;
      endLat: number;
      endLng: number;
      tier: 1 | 2;
      impact: number;
    }> = [];
    suppliers.forEach((s) => {
      const target = s.organizations && nodeMap.get(s.organizations.id);
      if (!target) return;
      arcs.push({
        startLat: selfLoc.lat,
        startLng: selfLoc.lng,
        endLat: target.lat,
        endLng: target.lng,
        tier: 1,
        impact: impactRank[target.id] ?? 0,
      });
    });
    // Arcs: tier1 → tier2
    graph
      .filter((g) => g.tier === 2 && g.parent_org_id)
      .forEach((g) => {
        const parent = nodeMap.get(g.parent_org_id!);
        const child = nodeMap.get(g.supplier_org_id);
        if (!parent || !child) return;
        arcs.push({
          startLat: parent.lat,
          startLng: parent.lng,
          endLat: child.lat,
          endLng: child.lng,
          tier: 2,
          impact: impactRank[child.id] ?? 0,
        });
      });

    return { nodes: nodeList, arcs, signals };
  }, [suppliers, graph, selfName, liveQ.data]);

  const focused = focus ? nodes.find((n) => n.id === focus) : null;
  const focusedSignals = focused
    ? signals.filter((s) => s.affectsOrgIds.includes(focused.id))
    : [];

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-10">
      <div className="mono-label">§ Network globe</div>
      <h1 className="mt-3 font-display text-[32px] font-medium tracking-tight">
        Your supply chain, projected on Earth.
      </h1>
      <p className="mt-2 max-w-2xl text-[13.5px] text-muted-foreground">
        Only your declared partners and their auto-resolved downstream nodes are
        rendered. Colour reflects the worst active risk signal touching each node.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="relative overflow-hidden rounded-md border border-border bg-surface">
          <div className="h-[560px] w-full">
            <ClientOnly fallback={<GlobeSkeleton />}>
              <Suspense fallback={<GlobeSkeleton />}>
                <GlobeView nodes={nodes} arcs={arcs} onSelect={setFocus} />
              </Suspense>
            </ClientOnly>
          </div>
          <Legend />
        </div>

        <aside className="space-y-4">
          <Panel title="Selection">
            {focused ? (
              <div>
                <div className="text-[14px] font-medium">{focused.name}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {focused.country} · Tier {focused.tier}
                </div>
                <div className="mt-4 mono-label">Active signals</div>
                {focusedSignals.length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    No active signals touching this node.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {focusedSignals.slice(0, 3).map((s) => (
                      <li key={s.id} className="rounded-md border border-border p-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: severityColor(s.severity) }}
                          />
                          <span className="text-[12px] font-medium capitalize">
                            {s.severity} · {s.kind}
                          </span>
                        </div>
                        <div className="mt-1 text-[13px]">{s.headline}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Click a node on the globe to inspect its signals and tier.
              </p>
            )}
          </Panel>

          <Panel title="Coverage">
            <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Tier-1 nodes</dt>
              <dd className="text-right">{nodes.filter((n) => n.tier === 1).length}</dd>
              <dt className="text-muted-foreground">Tier-2 nodes</dt>
              <dd className="text-right">{nodes.filter((n) => n.tier === 2).length}</dd>
              <dt className="text-muted-foreground">Active signals</dt>
              <dd className="text-right">{signals.length}</dd>
            </dl>
            <Link
              to="/signals"
              className="mt-4 inline-flex text-[12.5px] font-medium text-primary hover:underline"
            >
              Open signal feed →
            </Link>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="mono-label">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md border border-border bg-background/95 px-3 py-2 text-[11px]">
      <LegendDot color="oklch(0.18 0.01 250)" label="You" />
      <LegendDot color="oklch(0.58 0.13 232)" label="Tier-1" />
      <LegendDot color="oklch(0.72 0.05 250)" label="Tier-2 (hidden)" />
      <LegendDot color="oklch(0.55 0.19 27)" label="At-risk" />
    </div>
  );
}
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function GlobeSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center text-[12px] text-muted-foreground">
      Loading globe…
    </div>
  );
}

function UnderReview() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24">
      <div className="mono-label !text-primary">§ Under review</div>
      <h1 className="mt-3 font-display text-[28px] font-medium">
        The globe unlocks once your organisation is approved.
      </h1>
      <Link
        to="/dashboard"
        className="mt-6 inline-flex text-[13px] font-medium text-primary"
      >
        Back to dashboard →
      </Link>
    </div>
  );
}
