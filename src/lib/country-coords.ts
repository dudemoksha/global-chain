// Rough centroid lat/lng for common countries + a fallback lookup.
// Not authoritative; sufficient for globe visualisation.

export type LatLng = { lat: number; lng: number };

const RAW: Record<string, LatLng> = {
  "united states": { lat: 39.5, lng: -98.35 },
  usa: { lat: 39.5, lng: -98.35 },
  "united kingdom": { lat: 54, lng: -2 },
  uk: { lat: 54, lng: -2 },
  germany: { lat: 51.16, lng: 10.45 },
  france: { lat: 46.6, lng: 2.2 },
  italy: { lat: 41.87, lng: 12.56 },
  spain: { lat: 40.46, lng: -3.74 },
  netherlands: { lat: 52.13, lng: 5.29 },
  belgium: { lat: 50.5, lng: 4.47 },
  switzerland: { lat: 46.82, lng: 8.23 },
  sweden: { lat: 60.13, lng: 18.64 },
  norway: { lat: 60.47, lng: 8.47 },
  finland: { lat: 61.92, lng: 25.75 },
  denmark: { lat: 56.26, lng: 9.5 },
  poland: { lat: 51.92, lng: 19.15 },
  ireland: { lat: 53.14, lng: -7.69 },
  portugal: { lat: 39.4, lng: -8.22 },
  austria: { lat: 47.52, lng: 14.55 },
  greece: { lat: 39.07, lng: 21.82 },
  turkey: { lat: 38.96, lng: 35.24 },
  russia: { lat: 61.52, lng: 105.32 },
  ukraine: { lat: 48.38, lng: 31.17 },
  china: { lat: 35.86, lng: 104.2 },
  japan: { lat: 36.2, lng: 138.25 },
  "south korea": { lat: 35.91, lng: 127.77 },
  korea: { lat: 35.91, lng: 127.77 },
  india: { lat: 20.59, lng: 78.96 },
  pakistan: { lat: 30.37, lng: 69.35 },
  bangladesh: { lat: 23.68, lng: 90.36 },
  vietnam: { lat: 14.06, lng: 108.28 },
  thailand: { lat: 15.87, lng: 100.99 },
  indonesia: { lat: -0.79, lng: 113.92 },
  malaysia: { lat: 4.21, lng: 101.98 },
  singapore: { lat: 1.35, lng: 103.82 },
  philippines: { lat: 12.88, lng: 121.77 },
  taiwan: { lat: 23.7, lng: 120.96 },
  "hong kong": { lat: 22.32, lng: 114.17 },
  australia: { lat: -25.27, lng: 133.78 },
  "new zealand": { lat: -40.9, lng: 174.89 },
  canada: { lat: 56.13, lng: -106.35 },
  mexico: { lat: 23.63, lng: -102.55 },
  brazil: { lat: -14.24, lng: -51.93 },
  argentina: { lat: -38.42, lng: -63.62 },
  chile: { lat: -35.68, lng: -71.54 },
  colombia: { lat: 4.57, lng: -74.3 },
  peru: { lat: -9.19, lng: -75.02 },
  "south africa": { lat: -30.56, lng: 22.94 },
  nigeria: { lat: 9.08, lng: 8.68 },
  egypt: { lat: 26.82, lng: 30.8 },
  kenya: { lat: -0.02, lng: 37.91 },
  morocco: { lat: 31.79, lng: -7.09 },
  ethiopia: { lat: 9.15, lng: 40.49 },
  "saudi arabia": { lat: 23.89, lng: 45.08 },
  uae: { lat: 23.42, lng: 53.85 },
  "united arab emirates": { lat: 23.42, lng: 53.85 },
  israel: { lat: 31.05, lng: 34.85 },
  iran: { lat: 32.43, lng: 53.69 },
  iraq: { lat: 33.22, lng: 43.68 },
  qatar: { lat: 25.35, lng: 51.18 },
};

export function countryToLatLng(name: string | null | undefined): LatLng | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (RAW[key]) return RAW[key];
  // partial match
  const hit = Object.keys(RAW).find((k) => key.includes(k) || k.includes(key));
  return hit ? RAW[hit] : null;
}

// Deterministic jitter so co-located orgs don't overlap perfectly.
export function jitter(base: LatLng, seed: string): LatLng {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = ((h & 0xff) / 255 - 0.5) * 4;
  const b = (((h >> 8) & 0xff) / 255 - 0.5) * 4;
  return { lat: base.lat + a, lng: base.lng + b };
}
