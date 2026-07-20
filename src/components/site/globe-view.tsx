import { useEffect, useMemo, useRef } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import * as THREE from "three";

type Node = {
  id: string;
  name: string;
  country: string;
  tier: 0 | 1 | 2;
  lat: number;
  lng: number;
  impact: number;
};
type Arc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  tier: 1 | 2;
  impact: number;
};

function colorForNode(n: Node): string {
  if (n.impact >= 4) return "#c1272d";
  if (n.impact >= 3) return "#d97a2e";
  if (n.impact >= 2) return "#c9a227";
  if (n.tier === 0) return "#1c2432";
  if (n.tier === 1) return "#2b7fc9";
  return "#8a94a6";
}
function colorForArc(a: Arc): string {
  if (a.impact >= 3) return "#c1272d";
  if (a.impact >= 2) return "#c9a227";
  return a.tier === 1 ? "#2b7fc9" : "#c2cad6";
}

export default function GlobeView({
  nodes,
  arcs,
  onSelect,
}: {
  nodes: Node[];
  arcs: Arc[];
  onSelect: (id: string) => void;
}) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const points = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        size: n.tier === 0 ? 0.9 : n.tier === 1 ? 0.55 : 0.35,
        color: colorForNode(n),
      })),
    [nodes],
  );

  const arcData = useMemo(
    () => arcs.map((a) => ({ ...a, color: colorForArc(a) })),
    [arcs],
  );

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.controls().autoRotate = true;
    g.controls().autoRotateSpeed = 0.35;
    const self = nodes.find((n) => n.tier === 0);
    if (self) g.pointOfView({ lat: self.lat, lng: self.lng, altitude: 2.2 }, 800);
  }, [nodes]);

  return (
    <div ref={wrapRef} className="h-full w-full">
      <Globe
        ref={globeRef}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere={false}
        globeImageUrl={null as unknown as string}
        showGlobe
        globeMaterial={
          // Minimalist white sphere; no textures, no glow.
          new (globalThisThree()).MeshPhongMaterial({
            color: "#f4f6fa",
            emissive: "#ffffff",
            emissiveIntensity: 0,
            shininess: 2,
          })
        }
        hexPolygonsData={[]}
        pointsData={points}
        pointLat={(d: any) => d.lat}
        pointLng={(d: any) => d.lng}
        pointColor={(d: any) => d.color}
        pointAltitude={(d: any) => 0.02 + d.size * 0.05}
        pointRadius={(d: any) => d.size}
        pointLabel={(d: any) =>
          `<div style="font-family:Inter,sans-serif;background:white;border:1px solid #e2e5ea;padding:6px 8px;border-radius:4px;color:#1c2432;font-size:12px"><b>${escapeHtml(d.name)}</b><br/><span style="color:#6b7280">${escapeHtml(d.country)} · Tier ${d.tier}</span></div>`
        }
        onPointClick={(d: any) => onSelect(d.id)}
        arcsData={arcData}
        arcColor={(d: any) => d.color}
        arcStroke={(d: any) => (d.impact >= 3 ? 0.7 : 0.4)}
        arcAltitudeAutoScale={0.35}
        arcDashLength={0.4}
        arcDashGap={0.15}
        arcDashAnimateTime={2600}
        width={wrapRef.current?.clientWidth ?? 700}
        height={560}
      />
    </div>
  );
}

// Grab the same THREE instance react-globe.gl bundles with, so materials
// registered against it render correctly.
function globalThisThree(): typeof import("three") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("three");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
