"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* ---------------------------------- icons --------------------------------- */

const ICON_PATHS: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6l7-3z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18H14a4 4 0 0 0 4-4V8.5" />
      <path d="M15.5 6H10a4 4 0 0 0-4 4v5.5" strokeDasharray="2 3" />
    </>
  ),
  pulse: <path d="M2 12h4l2.5-6 3 12 2.5-6h8" />,
  lock: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="3" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
      <circle cx="12" cy="15" r="1.4" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 9.5l2.5 2.5L7 14.5" />
      <path d="M12.5 15h4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.2 7.5l2.2 1.3M17.6 15.2l2.2 1.3M4.2 16.5l2.2-1.3M17.6 8.8l2.2-1.3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14" />
    </>
  ),
  play: <path d="M8 5.5l10 6.5-10 6.5v-13z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="3" />,
  download: (
    <>
      <path d="M12 4v10" />
      <path d="M8 10.5l4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.5 6" />
      <path d="M20 5v6h-6" />
    </>
  ),
  check: <path d="M5 13l4 4L19 7" />,
  alert: (
    <>
      <path d="M12 4l8.5 15h-17L12 4z" />
      <path d="M12 10v4.5M12 16.6v.1" />
    </>
  ),
  bolt: <path d="M13 3L6 13h5l-1 8 7-10h-5l1-8z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14 0 17-2.5-3-2.5-14.4 0-17z" />
    </>
  ),
  filter: <path d="M4 6h16l-6 7v5l-4 2v-7L4 6z" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  star: <path d="M12 4.5l2.4 5 5.6.8-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.6-.8L12 4.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  command: (
    <>
      <path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H9V6.5zM9 17.5A2.5 2.5 0 1 1 6.5 15H9v2.5zM15 6.5A2.5 2.5 0 1 1 17.5 9H15V6.5zM15 17.5A2.5 2.5 0 1 0 17.5 15H15v2.5z" />
      <path d="M9 9h6v6H9z" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  power: (
    <>
      <path d="M12 4v7" />
      <path d="M7.5 7a7 7 0 1 0 9 0" />
    </>
  ),
  wifi: (
    <>
      <path d="M3.5 9.5a13 13 0 0 1 17 0" />
      <path d="M6.8 13a8.5 8.5 0 0 1 10.4 0" />
      <circle cx="12" cy="17.5" r="1.3" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" />
      <path d="M4 13l8 4.5 8-4.5" />
    </>
  ),
};

export function Icon({ name, className = "h-4 w-4", strokeWidth = 1.6 }: { name: string; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {ICON_PATHS[name] ?? ICON_PATHS.dashboard}
    </svg>
  );
}

/* --------------------------------- surfaces -------------------------------- */

export function Panel({
  children,
  className = "",
  strong = false,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  padded?: boolean;
}) {
  return (
    <section className={`${strong ? "glass-strong" : "glass"} rounded-2xl ${padded ? "p-4 md:p-5" : ""} ${className}`}>
      {children}
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  action,
  description,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-1 text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-xs" style={{ color: "var(--text-dim)" }}>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  stats,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  stats?: { label: string; value: string; tone?: string }[];
}) {
  return (
    <header className="rise mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm" style={{ color: "var(--text-dim)" }}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {stats?.length ? (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <Panel key={stat.label} className="py-3">
              <p className="eyebrow">{stat.label}</p>
              <p className={`num mt-1 text-lg font-semibold ${stat.tone ?? ""}`}>{stat.value}</p>
            </Panel>
          ))}
        </div>
      ) : null}
    </header>
  );
}

export function Badge({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: "good" | "warn" | "bad" | "info" | "muted" | "accent";
  className?: string;
}) {
  const tones: Record<string, string> = {
    good: "tone-good",
    warn: "tone-warn",
    bad: "tone-bad",
    info: "tone-info",
    accent: "",
    muted: "",
  };
  const backgrounds: Record<string, string> = {
    good: "rgba(69, 240, 176, 0.12)",
    warn: "rgba(255, 200, 87, 0.12)",
    bad: "rgba(255, 107, 139, 0.12)",
    info: "rgba(108, 199, 255, 0.12)",
    accent: "var(--accent-soft)",
    muted: "rgba(148, 163, 184, 0.1)",
  };
  return (
    <span className={`pill ${tones[tone]} ${className}`} style={{ background: backgrounds[tone], color: tone === "accent" ? "var(--text)" : undefined }}>
      {children}
    </span>
  );
}

export function Dot({ tone = "muted", pulse = false }: { tone?: "good" | "warn" | "bad" | "info" | "muted"; pulse?: boolean }) {
  const colors: Record<string, string> = {
    good: "var(--color-nora-good)",
    warn: "var(--color-nora-warn)",
    bad: "var(--color-nora-bad)",
    info: "var(--color-nora-info)",
    muted: "var(--text-faint)",
  };
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse ? (
        <span className="absolute inline-flex h-full w-full rounded-full ring" style={{ background: colors[tone], opacity: 0.4 }} />
      ) : null}
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: colors[tone] }} />
    </span>
  );
}

/* --------------------------------- controls -------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition hover:bg-white/5 disabled:opacity-50"
      style={{ borderColor: "var(--line)", background: checked ? "var(--accent-soft)" : "transparent" }}
    >
      <span>
        {label ? <span className="block text-sm">{label}</span> : null}
        {hint ? (
          <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-faint)" }}>
            {hint}
          </span>
        ) : null}
      </span>
      <span
        className="relative h-5 w-9 shrink-0 rounded-full transition"
        style={{ background: checked ? "var(--accent)" : "rgba(148,163,184,0.28)" }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
          style={{ left: checked ? 18 : 2 }}
        />
      </span>
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] tone-bad">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px]" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-xl border p-0.5" style={{ borderColor: "var(--line)", background: "rgba(4,6,14,0.35)" }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-[0.6rem] transition ${size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"}`}
          style={
            value === option.value
              ? { background: "linear-gradient(120deg, var(--accent), var(--accent-2))", color: "#05060f", fontWeight: 600 }
              : { color: "var(--text-dim)" }
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-3xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm md:items-center">
      <div className={`glass-strong rise w-full ${width} rounded-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b p-4" style={{ borderColor: "var(--line)" }}>
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            {description ? (
              <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn px-2 py-1.5" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 scroll-thin">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t p-4" style={{ borderColor: "var(--line)" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CopyButton({ value, label = "Copy", size = "md" }: { value: string; label?: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${size === "sm" ? "px-2 py-1 text-[11px]" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} className="h-3.5 w-3.5" />
      {copied ? "Copied" : label}
    </button>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line-strong)" }}>
      <Icon name="layers" className="h-6 w-6" />
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-md text-xs" style={{ color: "var(--text-dim)" }}>
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}

export function Meter({ value, max = 100, tone = "accent" }: { value: number; max?: number; tone?: "accent" | "good" | "warn" | "bad" }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const colors: Record<string, string> = {
    accent: "linear-gradient(90deg, var(--accent), var(--accent-2))",
    good: "linear-gradient(90deg, #45f0b0, #22d3ee)",
    warn: "linear-gradient(90deg, #ffc857, #fb923c)",
    bad: "linear-gradient(90deg, #ff6b8b, #f43f5e)",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(148,163,184,0.18)" }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: colors[tone] }} />
    </div>
  );
}

export function KV({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2 last:border-0" style={{ borderColor: "var(--line)" }}>
      <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      <span className={`num text-xs ${tone ?? ""}`}>{value}</span>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 border-b pb-2" style={{ borderColor: "var(--line)" }}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className="rounded-lg px-3 py-1.5 text-xs transition"
          style={
            value === tab.value
              ? { background: "var(--accent-soft)", color: "var(--text)", border: "1px solid var(--line-strong)" }
              : { color: "var(--text-dim)", border: "1px solid transparent" }
          }
        >
          {tab.label}
          {tab.count !== undefined ? <span className="num ml-2 opacity-70">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function useAutoRefresh(callback: () => void, intervalMs: number, enabled = true) {
  const ref = useRef(callback);

  useEffect(() => {
    ref.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => ref.current(), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
