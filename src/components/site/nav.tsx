import { Link } from "@tanstack/react-router";
import { Mark } from "./mark";

const links = [
  { to: "/", label: "Platform" },
  { to: "/", label: "Intelligence", hash: "#intelligence" },
  { to: "/", label: "Method", hash: "#method" },
  { to: "/", label: "Enterprise", hash: "#enterprise" },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between px-6">
        <Link to="/" className="flex items-center">
          <Mark />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.hash ?? l.to}
              className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link
            to="/login"
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
          >
            Request access
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
