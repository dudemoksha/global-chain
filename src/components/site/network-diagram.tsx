/**
 * Editorial supply-chain network diagram.
 * Pure SVG, no gradients, no glow. Uses animated dashed strokes and pulse rings.
 */
export function NetworkDiagram() {
  const nodes = {
    A: { x: 90, y: 180, label: "You · Tier 0" },
    B1: { x: 260, y: 90, label: "Supplier · B₁" },
    B2: { x: 260, y: 270, label: "Supplier · B₂" },
    C1: { x: 430, y: 50, label: "Tier 2 · C₁" },
    C2: { x: 430, y: 150, label: "Tier 2 · C₂" },
    C3: { x: 430, y: 240, label: "Tier 2 · C₃" },
    C4: { x: 430, y: 330, label: "Tier 2 · C₄" },
  } as const;

  const edges: Array<[keyof typeof nodes, keyof typeof nodes, boolean?]> = [
    ["A", "B1"],
    ["A", "B2"],
    ["B1", "C1"],
    ["B1", "C2", true], // at-risk hidden dependency
    ["B2", "C3"],
    ["B2", "C4"],
  ];

  return (
    <div className="relative w-full">
      <svg
        viewBox="0 0 520 380"
        className="h-auto w-full"
        role="img"
        aria-label="Multi-tier supplier network"
      >
        {/* Column labels */}
        <g className="mono-label" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="currentColor" opacity="0.55">
          <text x="90" y="26" textAnchor="middle" letterSpacing="2">YOUR VIEW</text>
          <text x="260" y="26" textAnchor="middle" letterSpacing="2">TIER 1</text>
          <text x="430" y="26" textAnchor="middle" letterSpacing="2">TIER 2 · HIDDEN</text>
        </g>
        <line x1="175" y1="34" x2="175" y2="360" stroke="currentColor" strokeOpacity="0.08" />
        <line x1="345" y1="34" x2="345" y2="360" stroke="currentColor" strokeOpacity="0.08" />

        {/* Edges */}
        {edges.map(([a, b, risk], i) => {
          const p1 = nodes[a];
          const p2 = nodes[b];
          const mx = (p1.x + p2.x) / 2;
          const d = `M ${p1.x} ${p1.y} C ${mx} ${p1.y}, ${mx} ${p2.y}, ${p2.x} ${p2.y}`;
          return (
            <g key={i}>
              <path
                d={d}
                fill="none"
                stroke={risk ? "var(--destructive)" : "currentColor"}
                strokeOpacity={risk ? 0.9 : 0.35}
                strokeWidth={risk ? 1.25 : 1}
                className={risk ? "animate-dash" : ""}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {(Object.entries(nodes) as Array<[keyof typeof nodes, (typeof nodes)[keyof typeof nodes]]>).map(
          ([k, n]) => {
            const isYou = k === "A";
            const isRisk = k === "C2";
            return (
              <g key={k} transform={`translate(${n.x} ${n.y})`}>
                {isRisk && (
                  <circle
                    r="6"
                    fill="none"
                    stroke="var(--destructive)"
                    strokeWidth="1"
                    className="animate-pulse-ring"
                    style={{ transformOrigin: "center" }}
                  />
                )}
                <circle
                  r={isYou ? 7 : 4.5}
                  fill={isYou ? "var(--foreground)" : "var(--background)"}
                  stroke={isRisk ? "var(--destructive)" : isYou ? "var(--foreground)" : "var(--foreground)"}
                  strokeWidth={isYou ? 1 : 1}
                />
                {isYou && <circle r="2.2" fill="var(--background)" />}
                <text
                  x={isYou ? -12 : 10}
                  y="3"
                  textAnchor={isYou ? "end" : "start"}
                  fontFamily="JetBrains Mono, monospace"
                  fontSize="8.5"
                  fill="currentColor"
                  opacity="0.85"
                  letterSpacing="0.5"
                >
                  {n.label}
                </text>
              </g>
            );
          },
        )}

        {/* Risk annotation callout */}
        <g transform="translate(430 150)">
          <line x1="14" y1="0" x2="52" y2="-38" stroke="var(--destructive)" strokeWidth="0.75" />
          <g transform="translate(56 -84)">
            <rect
              x="0"
              y="0"
              width="60"
              height="42"
              fill="var(--background)"
              stroke="var(--destructive)"
              strokeWidth="0.75"
            />
            <text x="6" y="12" fontSize="6.5" fontFamily="JetBrains Mono, monospace" fill="var(--destructive)" letterSpacing="1">
              SIGNAL · 04
            </text>
            <text x="6" y="24" fontSize="7" fontFamily="Inter" fill="currentColor">
              Port strike
            </text>
            <text x="6" y="34" fontSize="6.5" fontFamily="Inter" fill="currentColor" opacity="0.7">
              +14d lead time
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
