// Live risk ingestion from GDELT (news) and USGS (earthquakes).
// Server-only: never import from client bundles.

import { countryToLatLng, type LatLng } from "./country-coords";
import type { RiskSignal, Severity, SignalKind } from "./risk-signals";

/** FIPS 10-4 country code -> canonical name matching country-coords keys. */
const FIPS_TO_NAME: Record<string, string> = {
  US: "united states", UK: "united kingdom", GM: "germany", FR: "france",
  IT: "italy", SP: "spain", NL: "netherlands", BE: "belgium",
  SZ: "switzerland", SW: "sweden", NO: "norway", FI: "finland",
  DA: "denmark", PL: "poland", EI: "ireland", PO: "portugal",
  AU: "austria", GR: "greece", TU: "turkey", RS: "russia",
  UP: "ukraine", CH: "china", JA: "japan", KS: "south korea",
  IN: "india", PK: "pakistan", BG: "bangladesh", VM: "vietnam",
  TH: "thailand", ID: "indonesia", MY: "malaysia", SN: "singapore",
  RP: "philippines", TW: "taiwan", HK: "hong kong", AS: "australia",
  NZ: "new zealand", CA: "canada", MX: "mexico", BR: "brazil",
  AR: "argentina", CI: "chile", CO: "colombia", PE: "peru",
  SF: "south africa", NG: "nigeria", EG: "egypt", KE: "kenya",
  MO: "morocco", ET: "ethiopia", SA: "saudi arabia", AE: "uae",
  IS: "israel", IR: "iran", IZ: "iraq", QA: "qatar",
};

export type LiveEvent = RiskSignal & {
  source: "gdelt" | "usgs";
  sourceUrl?: string;
  lat: number;
  lng: number;
  occurredAt: string;
};

type OrgLite = { id: string; name: string; country: string };

const KEYWORD_TO_KIND: Array<[RegExp, SignalKind]> = [
  [/earthquake|seismic|tsunami/i, "climate"],
  [/flood|cyclone|typhoon|hurricane|storm|drought|wildfire|heatwave/i, "climate"],
  [/strike|protest|riot|unrest|coup|war|conflict|sanction|tariff|border|attack/i, "geopolitical"],
  [/port|shipping|freight|logistics|canal|rail|airport|closure|shutdown/i, "logistics"],
  [/ransomware|cyber|breach|hack|malware|phishing/i, "cyber"],
  [/regulation|compliance|audit|ban|export control|licence|license/i, "regulatory"],
];

function classifyKind(text: string): SignalKind {
  for (const [re, kind] of KEYWORD_TO_KIND) if (re.test(text)) return kind;
  return "geopolitical";
}

function normaliseCountry(name?: string | null): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return key || null;
}

/** Nearest country centroid within ~800km. */
function nearestCountry(
  lat: number,
  lng: number,
  candidates: string[],
): string | null {
  let best: { name: string; d: number } | null = null;
  for (const name of candidates) {
    const c = countryToLatLng(name);
    if (!c) continue;
    const d = haversine({ lat, lng }, c);
    if (!best || d < best.d) best = { name, d };
  }
  if (!best) return null;
  return best.d <= 800 ? best.name : null;
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function hoursSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 3_600_000));
}

/* ---------------- USGS earthquakes ---------------- */

type UsgsFeature = {
  id: string;
  properties: { mag: number; place: string; time: number; url: string; title: string };
  geometry: { coordinates: [number, number, number] };
};

async function fetchUsgs(): Promise<UsgsFeature[]> {
  try {
    const res = await fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: UsgsFeature[] };
    return json.features ?? [];
  } catch {
    return [];
  }
}

function usgsSeverity(mag: number): Severity {
  if (mag >= 7) return "critical";
  if (mag >= 6) return "high";
  if (mag >= 5) return "medium";
  return "low";
}

/* ---------------- GDELT news ---------------- */

type GdeltArticle = {
  url: string;
  title: string;
  seendate: string; // YYYYMMDDHHMMSS
  sourcecountry?: string; // FIPS 2-letter
  domain?: string;
  tone?: number | string;
};

function gdeltDateToIso(s: string): string {
  // 20250612143000 -> 2025-06-12T14:30:00Z
  if (!s || s.length < 14) return new Date().toISOString();
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
}

async function fetchGdelt(): Promise<GdeltArticle[]> {
  const query =
    '(strike OR protest OR sanctions OR "export ban" OR shutdown OR "port closure" OR earthquake OR flood OR cyclone OR ransomware OR "supply chain") sourcelang:eng';
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&maxrecords=75&timespan=3d&sort=datedesc`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.trim().startsWith("{")) return [];
    const json = JSON.parse(text) as { articles?: GdeltArticle[] };
    return json.articles ?? [];
  } catch {
    return [];
  }
}

function gdeltSeverity(tone: number | string | undefined, title: string): Severity {
  const t = typeof tone === "string" ? parseFloat(tone) : tone;
  const abs = Math.abs(t ?? 0);
  const strongWord = /war|attack|shutdown|ban|coup|earthquake|tsunami|catastroph/i.test(title);
  if (strongWord || abs > 8) return "critical";
  if (abs > 5) return "high";
  if (abs > 2.5) return "medium";
  return "low";
}

/* ---------------- Public ingestion API ---------------- */

/**
 * Fetch live GDELT + USGS events and map to the caller's supplier graph.
 * Only events whose country matches an org country are returned.
 */
export async function fetchLiveSignals(orgs: OrgLite[]): Promise<LiveEvent[]> {
  const orgByCountry = new Map<string, OrgLite[]>();
  const orgCountryKeys: string[] = [];
  orgs.forEach((o) => {
    const key = normaliseCountry(o.country);
    if (!key) return;
    if (!orgByCountry.has(key)) {
      orgByCountry.set(key, []);
      orgCountryKeys.push(key);
    }
    orgByCountry.get(key)!.push(o);
  });
  if (orgCountryKeys.length === 0) return [];

  const [usgs, gdelt] = await Promise.all([fetchUsgs(), fetchGdelt()]);
  const out: LiveEvent[] = [];

  /* --- USGS --- */
  for (const f of usgs) {
    const [lng, lat] = f.geometry.coordinates;
    const country = nearestCountry(lat, lng, orgCountryKeys);
    if (!country) continue;
    const affected = orgByCountry.get(country) ?? [];
    if (affected.length === 0) continue;
    const occurredAt = new Date(f.properties.time).toISOString();
    out.push({
      id: `usgs:${f.id}`,
      source: "usgs",
      sourceUrl: f.properties.url,
      country: titleCase(country),
      region: regionOf(country),
      kind: "climate",
      severity: usgsSeverity(f.properties.mag),
      headline: `M${f.properties.mag.toFixed(1)} · ${f.properties.place}`,
      detail: `USGS-detected seismic event near a supplier region. ${f.properties.title}.`,
      affectsOrgIds: affected.map((o) => o.id),
      hoursAgo: hoursSince(occurredAt),
      lat,
      lng,
      occurredAt,
    });
  }

  /* --- GDELT --- */
  for (const a of gdelt) {
    const fips = a.sourcecountry?.toUpperCase();
    const country = fips ? FIPS_TO_NAME[fips] : null;
    if (!country) continue;
    const affected = orgByCountry.get(country);
    if (!affected || affected.length === 0) continue;
    const coord = countryToLatLng(country);
    if (!coord) continue;
    const occurredAt = gdeltDateToIso(a.seendate);
    const kind = classifyKind(a.title);
    out.push({
      id: `gdelt:${a.url}`,
      source: "gdelt",
      sourceUrl: a.url,
      country: titleCase(country),
      region: regionOf(country),
      kind,
      severity: gdeltSeverity(a.tone, a.title),
      headline: a.title,
      detail: `Reported via ${a.domain ?? "GDELT"}. Region matches ${affected.length} supplier node${affected.length === 1 ? "" : "s"}.`,
      affectsOrgIds: affected.map((o) => o.id),
      hoursAgo: hoursSince(occurredAt),
      lat: coord.lat,
      lng: coord.lng,
      occurredAt,
    });
  }

  // Dedupe by (country, kind, headline) to avoid near-duplicate GDELT rows.
  const seen = new Set<string>();
  const deduped = out.filter((e) => {
    const key = `${e.country}|${e.kind}|${e.headline.slice(0, 80).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sevRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return deduped.sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity] || a.hoursAgo - b.hoursAgo,
  );
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function regionOf(country: string): string {
  const c = country.toLowerCase();
  if (["china", "japan", "korea", "taiwan", "hong kong", "vietnam", "thailand", "indonesia", "malaysia", "singapore", "philippines", "india", "pakistan", "bangladesh"].some((k) => c.includes(k))) return "APAC";
  if (["united states", "usa", "canada", "mexico"].some((k) => c.includes(k))) return "North America";
  if (["brazil", "argentina", "chile", "colombia", "peru"].some((k) => c.includes(k))) return "LATAM";
  if (["saudi", "uae", "emirates", "israel", "iran", "iraq", "qatar", "egypt", "turkey"].some((k) => c.includes(k))) return "MENA";
  if (["nigeria", "kenya", "south africa", "ethiopia", "morocco"].some((k) => c.includes(k))) return "Africa";
  return "EMEA";
}
