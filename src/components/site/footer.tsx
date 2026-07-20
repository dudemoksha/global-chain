import { Mark } from "./mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Mark />
          <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            Multi-tier supply chain risk intelligence for operations teams that
            cannot afford to be surprised.
          </p>
          <p className="mono-label mt-6">SOC 2 · ISO 27001 · GDPR</p>
        </div>

        {[
          { h: "Platform", i: ["Network graph", "Risk signals", "Simulation", "Alerts"] },
          { h: "Company", i: ["About", "Careers", "Press", "Contact"] },
          { h: "Legal", i: ["Privacy", "Terms", "Data handling", "Security"] },
        ].map((col) => (
          <div key={col.h}>
            <div className="mono-label">{col.h}</div>
            <ul className="mt-4 space-y-2">
              {col.i.map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className="text-[13px] text-foreground transition-colors hover:text-primary"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4">
          <p className="text-[12px] text-muted-foreground">
            © {new Date().getFullYear()} Global-Chain Systems. All rights reserved.
          </p>
          <p className="mono-label">Build 0.1 · Preview</p>
        </div>
      </div>
    </footer>
  );
}
