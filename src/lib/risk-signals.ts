// Deterministic mock risk signals derived from the current live supplier graph.
// In production these would come from live geopolitical / climate APIs.

export type Severity = "low" | "medium" | "high" | "critical";
export type SignalKind = "geopolitical" | "climate" | "logistics" | "cyber" | "regulatory";

export type RiskSignal = {
  id: string;
  country: string;
  region: string;
  kind: SignalKind;
  severity: Severity;
  headline: string;
  detail: string;
  affectsOrgIds: string[]; // organisation ids in the graph impacted
  hoursAgo: number;
};

const HEADLINES: Record<SignalKind, Array<[string, string]>> = {
  geopolitical: [
    ["Cross-border tariff review announced", "New duties on electronics and precision components under 90-day review."],
    ["Port workers vote to strike", "Union ballot passed 78/22; strike window opens in 14 days."],
    ["Sanctions expanded on dual-use goods", "Export licences now required for sensors and rare metals."],
  ],
  climate: [
    ["Category 3 cyclone tracking coast", "Landfall projected within 48h across key manufacturing corridor."],
    ["Drought advisory extended", "Reservoir levels 34% below seasonal norm; industrial water rationing likely."],
    ["Flash-flood warning inland", "Rail freight through the region suspended 24-72h."],
  ],
  logistics: [
    ["Container throughput down 22%", "Rolling equipment shortage compounding at transshipment hubs."],
    ["Air freight rates spike +18% WoW", "Belly capacity constrained by seasonal passenger demand."],
    ["Canal transit slot backlog", "Waiting time 4.2 days above 30-day median."],
  ],
  cyber: [
    ["Ransomware campaign targeting T2 fabricators", "Confirmed intrusions at three regional plants; ISAC alert."],
    ["Credential-stuffing wave on B2B portals", "Vendor logins rate-limited; expect order-entry lag."],
  ],
  regulatory: [
    ["Chemical import registry update", "New pre-shipment declaration required from next quarter."],
    ["Labour-rights audit mandated", "Facilities above 500 headcount added to compliance roster."],
  ],
};

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const KINDS: SignalKind[] = ["geopolitical", "climate", "logistics", "cyber", "regulatory"];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

/** Generate a deterministic feed of risk signals grounded in the operator's graph. */
export function generateSignals(
  orgs: Array<{ id: string; name: string; country: string }>,
  scenario?: { country?: string; severity?: Severity; kind?: SignalKind } | null,
): RiskSignal[] {
  const byCountry = new Map<string, Array<{ id: string; name: string }>>();
  orgs.forEach((o) => {
    const c = (o.country || "Unknown").trim();
    if (!c || c === "Unknown") return;
    if (!byCountry.has(c)) byCountry.set(c, []);
    byCountry.get(c)!.push({ id: o.id, name: o.name });
  });

  const out: RiskSignal[] = [];

  byCountry.forEach((orgList, country) => {
    const seed = hash(country);
    const count = 1 + (seed % 2); // 1-2 signals per country
    for (let i = 0; i < count; i++) {
      const kind = KINDS[(seed + i * 7) % KINDS.length];
      const sevIdx = (seed + i * 3) % SEVERITIES.length;
      const severity = SEVERITIES[sevIdx];
      const [headline, detail] = HEADLINES[kind][(seed + i) % HEADLINES[kind].length];
      out.push({
        id: `${country}-${kind}-${i}`,
        country,
        region: regionOf(country),
        kind,
        severity,
        headline,
        detail,
        affectsOrgIds: orgList.map((o) => o.id),
        hoursAgo: 1 + ((seed + i * 11) % 71),
      });
    }
  });

  // Add a simulated signal on top if scenario provided.
  if (scenario?.country) {
    const kind = scenario.kind ?? "geopolitical";
    const severity = scenario.severity ?? "high";
    const [headline, detail] = HEADLINES[kind][0];
    const affected = byCountry.get(scenario.country) ?? [];
    out.unshift({
      id: `sim-${scenario.country}`,
      country: scenario.country,
      region: regionOf(scenario.country),
      kind,
      severity,
      headline: `[Simulated] ${headline}`,
      detail,
      affectsOrgIds: affected.map((o) => o.id),
      hoursAgo: 0,
    });
  }

  const sevRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return out.sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity] || a.hoursAgo - b.hoursAgo,
  );
}

export function severityColor(sev: Severity): string {
  switch (sev) {
    case "critical":
      return "oklch(0.55 0.19 27)";
    case "high":
      return "oklch(0.65 0.17 45)";
    case "medium":
      return "oklch(0.72 0.15 65)";
    case "low":
      return "oklch(0.58 0.13 232)";
  }
}

export function severityLabel(sev: Severity): string {
  return sev.charAt(0).toUpperCase() + sev.slice(1);
}

function regionOf(country: string): string {
  const c = country.toLowerCase();
  if (["china", "japan", "south korea", "korea", "taiwan", "hong kong", "vietnam", "thailand", "indonesia", "malaysia", "singapore", "philippines", "india", "pakistan", "bangladesh"].some((k) => c.includes(k))) return "APAC";
  if (["united states", "usa", "canada", "mexico"].some((k) => c.includes(k))) return "North America";
  if (["brazil", "argentina", "chile", "colombia", "peru"].some((k) => c.includes(k))) return "LATAM";
  if (["saudi", "uae", "emirates", "israel", "iran", "iraq", "qatar", "egypt", "turkey"].some((k) => c.includes(k))) return "MENA";
  if (["nigeria", "kenya", "south africa", "ethiopia", "morocco"].some((k) => c.includes(k))) return "Africa";
  return "EMEA";
}
