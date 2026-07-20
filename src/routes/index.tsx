import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/site/nav";
import { SiteFooter } from "@/components/site/footer";
import { NetworkDiagram } from "@/components/site/network-diagram";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <Hero />
      <Ticker />
      <Method />
      <Intelligence />
      <Simulation />
      <Enterprise />
      <ClosingCTA />
      <SiteFooter />
    </div>
  );
}

/* ─────────────────────────── HERO ─────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" aria-hidden />
      <div className="relative mx-auto grid max-w-[1240px] gap-12 px-6 py-20 md:grid-cols-[1.05fr_1fr] md:py-28">
        <div className="animate-rise">
          <div className="mono-label flex items-center gap-3">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            Rev 01 · Supply Chain Intelligence
          </div>
          <h1 className="mt-6 font-display text-[44px] font-500 leading-[1.05] tracking-tight md:text-[64px]">
            See the suppliers
            <br />
            <span className="text-muted-foreground">behind your suppliers.</span>
          </h1>
          <p className="mt-6 max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
            Global-Chain reconstructs the hidden N-tier network beneath your
            procurement graph — then forecasts disruption from live
            geopolitical, climate, and logistics signals before it reaches your
            production floor.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/register"
              className="group inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
            >
              Request enterprise access
              <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-surface"
            >
              Operator sign-in
            </Link>
          </div>

          <dl className="mt-14 grid grid-cols-3 gap-6 border-t border-border pt-6">
            {[
              ["4.6M", "Supplier links mapped"],
              ["187", "Risk signal sources"],
              ["23 min", "Median alert lead-time"],
            ].map(([v, l]) => (
              <div key={l as string}>
                <dt className="mono-label">{l}</dt>
                <dd className="mt-1 font-display text-[22px] font-500 tracking-tight">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Right — network diagram card */}
        <div className="animate-fade">
          <div className="relative rounded-md border border-border bg-card p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                <span className="mono-label !text-destructive">Live · 1 signal</span>
              </div>
              <span className="mono-label">Network · Acme Robotics</span>
            </div>
            <div className="text-foreground">
              <NetworkDiagram />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3">
              {[
                { k: "Tier depth", v: "3" },
                { k: "Exposed nodes", v: "1" },
                { k: "Alt. sources", v: "4 ready" },
              ].map((it) => (
                <div key={it.k}>
                  <div className="mono-label">{it.k}</div>
                  <div className="mt-0.5 text-[13px] font-medium">{it.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── TICKER ─────────────────────────── */

function Ticker() {
  const items = [
    "Yangshan Port · congestion index 78",
    "Red Sea corridor · reroute in effect",
    "Taiwan Strait · elevated advisory",
    "Rotterdam · labour negotiations continue",
    "Panama Canal · draft restrictions eased",
    "Kyushu · seismic activity monitored",
    "Chennai · monsoon delays 3–5d",
    "Rhine · water-level advisory lifted",
  ];
  return (
    <section aria-label="Live risk feed" className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-[1240px] items-center gap-6 px-6 py-3">
        <div className="mono-label flex shrink-0 items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          Live feed
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-surface to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-surface to-transparent" />
          <div className="flex animate-[gc-scan_60s_linear_infinite] gap-10 whitespace-nowrap">
            {[...items, ...items].map((t, i) => (
              <span key={i} className="text-[12px] text-muted-foreground">
                <span className="mr-2 text-primary">◇</span>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── METHOD ─────────────────────────── */

function Method() {
  const steps = [
    {
      n: "01",
      h: "Declare only what you know",
      p: "Each operator uploads their own tier-1 relationships. Nothing more is required. Your commercial data never leaves your namespace.",
    },
    {
      n: "02",
      h: "The graph resolves itself",
      p: "When your supplier is also an operator on Global-Chain, our resolver silently links your view to theirs — without exposing either party's private detail.",
    },
    {
      n: "03",
      h: "Signals cascade downstream",
      p: "Live geopolitical, climate, and logistics events are matched to nodes at every tier. Impact scores propagate upstream to reach you.",
    },
    {
      n: "04",
      h: "Act before the loss lands",
      p: "You receive a specific, ranked alert with pre-qualified alternate suppliers matched to your quality and volume envelope.",
    },
  ];
  return (
    <section id="method" className="border-b border-border">
      <div className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
          <div className="md:sticky md:top-24 md:self-start">
            <div className="mono-label">§ Method</div>
            <h2 className="mt-4 font-display text-[36px] font-500 leading-[1.1] tracking-tight md:text-[42px]">
              Private at the surface. <br />
              Connected underneath.
            </h2>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
              A protocol that respects commercial confidentiality while still
              revealing the systemic dependencies that create risk.
            </p>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            {steps.map((s) => (
              <li key={s.n} className="grid gap-6 py-8 md:grid-cols-[80px_1fr]">
                <div className="font-mono text-[12px] tracking-widest text-primary">{s.n}</div>
                <div>
                  <h3 className="font-display text-[20px] font-500 tracking-tight">{s.h}</h3>
                  <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                    {s.p}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── INTELLIGENCE ─────────────────────────── */

function Intelligence() {
  const feeds = [
    { k: "GEO", n: "Geopolitical", d: "Sanctions, advisories, conflict zones, export controls" },
    { k: "CLM", n: "Climate & weather", d: "Cyclones, floods, wildfire, drought, seismic activity" },
    { k: "LOG", n: "Logistics", d: "Port congestion, canal draft, air cargo capacity, labour" },
    { k: "REG", n: "Regulatory", d: "Tariffs, customs, emissions rules, product recalls" },
    { k: "FIN", n: "Financial", d: "Counterparty distress, credit downgrades, insolvency filings" },
    { k: "OPS", n: "Operational", d: "Utility outages, cyber incidents, facility disruption" },
  ];
  return (
    <section id="intelligence" className="border-b border-border bg-surface">
      <div className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="mono-label">§ Intelligence</div>
            <h2 className="mt-4 max-w-2xl font-display text-[36px] font-500 leading-[1.1] tracking-tight md:text-[42px]">
              Six signal families, continuously reconciled to your graph.
            </h2>
          </div>
          <p className="hidden max-w-xs text-[13px] text-muted-foreground md:block">
            Every event is spatially and semantically joined to the entities in
            your dependency tree — not to a generic country risk score.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 border-t border-l border-border md:grid-cols-2 lg:grid-cols-3">
          {feeds.map((f) => (
            <div
              key={f.k}
              className="group relative border-b border-r border-border bg-card p-6 transition-colors hover:bg-accent"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[11px] tracking-widest text-primary">
                  {f.k}
                </span>
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
                  ACTIVE
                </span>
              </div>
              <h3 className="mt-6 font-display text-[19px] font-500 tracking-tight">
                {f.n}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {f.d}
              </p>
              <div className="mt-6 h-px w-8 bg-foreground transition-all group-hover:w-16" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── SIMULATION ─────────────────────────── */

function Simulation() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-[1240px] gap-14 px-6 py-24 md:grid-cols-[1fr_1.05fr]">
        <div className="rounded-md border border-border bg-surface p-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <span className="mono-label">Scenario · Sandbox</span>
            <span className="mono-label !text-primary">Not affecting production</span>
          </div>
          <div className="space-y-4 py-5">
            {[
              ["Region", "Southeast Asia"],
              ["Trigger", "Typhoon · Category 3"],
              ["Duration", "9 days"],
              ["Confidence", "72%"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] items-center gap-4">
                <span className="mono-label">{k}</span>
                <div className="h-px flex-1 bg-border" />
                <span className="text-[13px] font-medium">{v}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
            {[
              ["Impacted", "12 nodes"],
              ["Delay", "+11 days"],
              ["Revenue at risk", "$4.2M"],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="mono-label">{k}</div>
                <div className="mt-1 font-display text-[18px] font-500">{v}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-foreground bg-foreground px-4 py-2.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Re-run simulation
            <span aria-hidden>↻</span>
          </button>
        </div>

        <div className="md:pt-6">
          <div className="mono-label">§ What-if</div>
          <h2 className="mt-4 font-display text-[36px] font-500 leading-[1.1] tracking-tight md:text-[42px]">
            Rehearse the disruption. Keep the ledger untouched.
          </h2>
          <p className="mt-5 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            The simulation surface behaves exactly like a live incident — same
            propagation model, same alerts, same alternate-supplier ranking —
            but nothing you do here writes to your operational record.
          </p>
          <ul className="mt-8 space-y-3 border-t border-border pt-6 text-[14px]">
            {[
              "Model regional shocks, single-node failures, or cascading multi-tier events.",
              "Compare mitigation strategies side-by-side with revenue-at-risk deltas.",
              "Export scenario briefings for board and continuity review.",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-2 h-px w-4 shrink-0 bg-primary" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── ENTERPRISE ─────────────────────────── */

function Enterprise() {
  return (
    <section id="enterprise" className="border-b border-border bg-surface">
      <div className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="grid gap-12 md:grid-cols-3">
          <div className="md:col-span-1">
            <div className="mono-label">§ Enterprise</div>
            <h2 className="mt-4 font-display text-[36px] font-500 leading-[1.1] tracking-tight">
              Built for the operators who cannot afford surprise.
            </h2>
          </div>
          <div className="md:col-span-2">
            <dl className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
              {[
                {
                  h: "Namespace isolation",
                  p: "Your uploaded relationships remain visible only to you. Linking happens through a resolver that never returns counterparties in plaintext.",
                },
                {
                  h: "Human-vetted onboarding",
                  p: "Every organisation is reviewed and approved by the Global-Chain trust desk before entering the resolver graph.",
                },
                {
                  h: "Auditable alerts",
                  p: "Every signal you receive is traceable to its source event, the impacted node, and the propagation path — never a black box.",
                },
                {
                  h: "Deployable in weeks",
                  p: "CSV, ERP connectors, or API. Minimum viable graph in a fortnight; complete dependency map inside a quarter.",
                },
              ].map((f) => (
                <div key={f.h}>
                  <dt className="font-display text-[17px] font-500 tracking-tight">
                    {f.h}
                  </dt>
                  <dd className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                    {f.p}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── CTA ─────────────────────────── */

function ClosingCTA() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-8 px-6 py-20 md:flex-row md:items-end">
        <div>
          <div className="mono-label">§ Access</div>
          <h2 className="mt-4 max-w-2xl font-display text-[36px] font-500 leading-[1.05] tracking-tight md:text-[48px]">
            Enrolment is by review. <br />
            <span className="text-muted-foreground">
              Submit your organisation for approval.
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-3 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Request access →
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
