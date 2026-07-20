export function Mark({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        fill="none"
        aria-hidden
        className="text-primary"
      >
        <circle cx="11" cy="11" r="9.5" stroke="currentColor" strokeWidth="1" />
        <ellipse cx="11" cy="11" rx="4" ry="9.5" stroke="currentColor" strokeWidth="1" />
        <line x1="1.5" y1="11" x2="20.5" y2="11" stroke="currentColor" strokeWidth="1" />
        <circle cx="11" cy="11" r="1.6" fill="currentColor" />
        <circle cx="6.5" cy="7" r="1" fill="currentColor" />
        <circle cx="15.5" cy="15" r="1" fill="currentColor" />
      </svg>
      <span className="font-display text-[15px] font-semibold tracking-tight text-foreground">
        Global<span className="text-primary">·</span>Chain
      </span>
    </div>
  );
}
