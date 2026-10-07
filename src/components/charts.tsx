"use client";

import type { BandwidthSample, ProbeStage } from "@/lib/types";
import { areaPath, clamp, sparklinePath } from "@/lib/format";

function toneColor(tone: string) {
  switch (tone) {
    case "good":
      return "#45f0b0";
    case "warn":
      return "#ffc857";
    case "bad":
      return "#ff6b8b";
    case "info":
      return "#6cc7ff";
    default:
      return "var(--accent)";
  }
}

export function Sparkline({
  values,
  height = 44,
  stroke = "var(--accent)",
  fill = true,
  max,
}: {
  values: number[];
  height?: number;
  stroke?: string;
  fill?: boolean;
  max?: number;
}) {
  const width = 240;
  const safe = values.length ? values : [0, 0];
  const scaled = max ? safe.map((value) => (value / max) * 100) : safe;
  const line = sparklinePath(scaled, width, height);
  const area = areaPath(scaled, width, height);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id={`spark-${stroke.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={area} fill={`url(#spark-${stroke.replace(/[^a-z0-9]/gi, "")})`} /> : null}
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TrafficChart({ samples, height = 150 }: { samples: BandwidthSample[]; height?: number }) {
  const width = 720;
  const rx = samples.map((sample) => sample.rx);
  const tx = samples.map((sample) => sample.tx);
  const max = Math.max(...rx, ...tx, 1000);
  const rxLine = sparklinePath(rx.map((value) => clamp(value, 0, max)), width, height);
  const txLine = sparklinePath(tx.map((value) => clamp(value, 0, max)), width, height);
  const rxArea = areaPath(rx.map((value) => clamp(value, 0, max)), width, height);
  const gridLines = [0.25, 0.5, 0.75];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="rx-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridLines.map((ratio) => (
        <line
          key={ratio}
          x1="0"
          x2={width}
          y1={height * ratio}
          y2={height * ratio}
          stroke="var(--line)"
          strokeDasharray="3 6"
        />
      ))}
      {samples.length ? (
        <>
          <path d={rxArea} fill="url(#rx-fill)" />
          <path d={rxLine} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
          <path d={txLine} fill="none" stroke="#22d3ee" strokeWidth="1.4" strokeDasharray="4 3" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  );
}

export function Bars({ values, tones, labels }: { values: number[]; tones?: string[]; labels?: string[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-24 items-end gap-1.5">
      {values.map((value, index) => (
        <div key={index} className="group relative flex-1">
          <div
            className="w-full rounded-t-md transition-all duration-500 group-hover:opacity-100"
            style={{
              height: `${Math.max(4, (value / max) * 84)}px`,
              background: `linear-gradient(180deg, ${toneColor(tones?.[index] ?? "accent")}, transparent)`,
              opacity: 0.85,
            }}
          />
          {labels?.[index] ? (
            <span className="mt-1 block truncate text-center text-[9px]" style={{ color: "var(--text-faint)" }}>
              {labels[index]}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function RadialOrb({
  state,
  latency,
  size = 220,
  onToggle,
  busy,
}: {
  state: string;
  latency?: number | null;
  size?: number;
  onToggle?: () => void;
  busy?: boolean;
}) {
  const tone = state === "connected" ? "good" : state === "degraded" ? "warn" : state === "error" ? "bad" : state === "connecting" ? "info" : "muted";
  const color = toneColor(tone);
  const radius = size / 2 - 18;
  const circumference = 2 * Math.PI * radius;
  const progress = state === "connected" ? 0.92 : state === "degraded" ? 0.55 : state === "connecting" ? 0.3 : 0.08;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      className="relative grid place-items-center rounded-full transition disabled:opacity-80"
      style={{ width: size, height: size, cursor: onToggle ? "pointer" : "default" }}
      aria-label="Toggle tunnel"
    >
      <span className="absolute inset-0 rounded-full breathe" style={{ background: `radial-gradient(circle, ${color}22, transparent 68%)` }} />
      {["connected", "connecting"].includes(state)
        ? [0, 1, 2].map((index) => (
            <span
              key={index}
              className="absolute rounded-full ring"
              style={{
                width: size * 0.72,
                height: size * 0.72,
                border: `1px solid ${color}`,
                animationDelay: `${index * 0.85}s`,
              }}
            />
          ))
        : null}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${circumference * progress} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-700"
          style={{ filter: `drop-shadow(0 0 12px ${color})` }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius - 22}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1"
          strokeDasharray="2 8"
          className={state === "connecting" ? "spin-slow" : ""}
          style={{ transformOrigin: "center" }}
        />
      </svg>
      <span className="relative z-10 flex flex-col items-center">
        <span className="eyebrow">{state.replace("disconnected", "idle")}</span>
        <span className="num mt-1 text-2xl font-semibold" style={{ color }}>
          {latency ? `${latency}ms` : state === "connected" ? "—" : "off"}
        </span>
        <span className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
          {onToggle ? (state === "connected" || state === "degraded" ? "tap to disconnect" : "tap to connect") : "control plane"}
        </span>
      </span>
    </button>
  );
}

export function Radar({ axes, size = 220 }: { axes: { axis: string; value: number }[]; size?: number }) {
  const center = size / 2;
  const radius = center - 34;
  const points = axes.map((axis, index) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const distance = (clamp(axis.value, 0, 100) / 100) * radius;
    return {
      x: center + Math.cos(angle) * distance,
      y: center + Math.sin(angle) * distance,
      ax: center + Math.cos(angle) * radius,
      ay: center + Math.sin(angle) * radius,
      label: axis.axis,
      value: axis.value,
    };
  });
  const polygon = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[260px]">
      {[0.33, 0.66, 1].map((step) => (
        <polygon
          key={step}
          points={points.map((point) => `${center + (point.ax - center) * step},${center + (point.ay - center) * step}`).join(" ")}
          fill="none"
          stroke="var(--line)"
        />
      ))}
      {points.map((point) => (
        <line key={point.label} x1={center} y1={center} x2={point.ax} y2={point.ay} stroke="var(--line)" />
      ))}
      <polygon points={polygon} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.6" />
      {points.map((point) => (
        <g key={`${point.label}-dot`}>
          <circle cx={point.x} cy={point.y} r="2.6" fill="var(--accent)" />
          <text x={point.ax * 0.92 + center * 0.08} y={point.ay * 0.92 + center * 0.08} fontSize="9" fill="var(--text-faint)" textAnchor="middle">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Donut({ value, size = 130, label, sublabel }: { value: number; size?: number; label?: string; sublabel?: string }) {
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const tone = value >= 85 ? "good" : value >= 65 ? "warn" : "bad";
  const color = toneColor(tone);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth="9" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(clamp(value, 0, 100) / 100) * circumference} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 10px ${color})`, transition: "stroke-dasharray 0.7s ease" }}
        />
      </svg>
      <span className="relative z-10 text-center">
        <span className="num block text-2xl font-semibold" style={{ color }}>
          {label ?? Math.round(value)}
        </span>
        {sublabel ? (
          <span className="block text-[10px] uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>
            {sublabel}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function Gauge({ value, max, unit, label }: { value: number; max: number; unit: string; label: string }) {
  const pct = clamp((value / (max || 1)) * 100, 0, 100);
  const angle = -90 + (pct / 100) * 180;
  const color = pct < 45 ? "#45f0b0" : pct < 75 ? "#ffc857" : "#ff6b8b";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 70" className="w-32">
        <path d="M10 62a50 50 0 0 1 100 0" fill="none" stroke="var(--line)" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M10 62a50 50 0 0 1 100 0"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 157} 157`}
        />
        <line x1="60" y1="62" x2={60 + 34 * Math.cos((angle * Math.PI) / 180)} y2={62 + 34 * Math.sin((angle * Math.PI) / 180)} stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="60" cy="62" r="3.5" fill="var(--accent)" />
      </svg>
      <p className="num -mt-2 text-sm font-semibold">
        {Math.round(value)} <span className="text-[10px]">{unit}</span>
      </p>
      <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>
        {label}
      </p>
    </div>
  );
}

export function TraceTimeline({ stages }: { stages: ProbeStage[] }) {
  if (!stages.length) return null;
  const total = stages.reduce((sum, stage) => sum + stage.durationMs, 0) || 1;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(148,163,184,0.14)" }}>
        {stages.map((stage, index) => (
          <span
            key={`${stage.stage}-${index}`}
            title={`${stage.label}: ${stage.durationMs}ms`}
            style={{
              width: `${Math.max(2, (stage.durationMs / total) * 100)}%`,
              background: stage.status === "ok" ? "linear-gradient(90deg, var(--accent), var(--accent-2))" : stage.status === "fail" ? "#ff6b8b" : "rgba(148,163,184,0.4)",
            }}
          />
        ))}
      </div>
      <ul className="space-y-1.5">
        {stages.map((stage, index) => (
          <li key={`${stage.stage}-row-${index}`} className="flex items-start justify-between gap-3 rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--line)" }}>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                <span className="num mr-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {stage.stage}
                </span>
                {stage.label}
              </p>
              {stage.detail ? (
                <p className="mt-0.5 break-words text-[11px]" style={{ color: "var(--text-dim)" }}>
                  {stage.detail}
                </p>
              ) : null}
            </div>
            <span className="num shrink-0 text-[11px]">
              {stage.status === "ok" ? <span className="tone-good">ok</span> : stage.status === "fail" ? <span className="tone-bad">fail</span> : <span className="tone-warn">skip</span>}{" "}
              {stage.durationMs}ms
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TunnelDiagram({
  state,
  profileName,
  core,
  transport,
  security,
  endpoint,
}: {
  state: string;
  profileName?: string;
  core?: string;
  transport?: string;
  security?: string;
  endpoint?: string;
}) {
  const active = state === "connected" || state === "degraded";
  const path = "M 40 70 C 150 20, 250 120, 360 70 S 560 20, 660 70";
  const nodes = [
    { x: 40, y: 70, label: "device" },
    { x: 240, y: 70, label: core ?? "core" },
    { x: 440, y: 70, label: transport ?? "transport" },
    { x: 660, y: 70, label: "endpoint" },
  ];

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border p-3" style={{ borderColor: "var(--line)", background: "rgba(4,6,14,0.35)" }}>
      <svg viewBox="0 0 700 140" className="h-36 w-full">
        <defs>
          <linearGradient id="tunnel-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={active ? 0.9 : 0.25} />
            <stop offset="100%" stopColor="var(--accent-2)" stopOpacity={active ? 0.9 : 0.25} />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#tunnel-line)" strokeWidth="2.5" strokeDasharray="6 6" opacity={active ? 1 : 0.5} />
        {[0, 1, 2, 3].map((index) => (
          <g key={index}>
            <circle r="4.5" fill="var(--accent-2)">
              <animateMotion dur={`${3.2 + index * 0.4}s`} repeatCount="indefinite" path={path} begin={`${index * 0.8}s`} />
              <animate attributeName="opacity" values={active ? "0;1;1;0" : "0;0.25;0.25;0"} dur={`${3.2 + index * 0.4}s`} repeatCount="indefinite" begin={`${index * 0.8}s`} />
            </circle>
          </g>
        ))}
        {nodes.map((node) => (
          <g key={node.label}>
            <rect
              x={node.x - 34}
              y={node.y - 26}
              width="68"
              height="52"
              rx="12"
              fill="rgba(255,255,255,0.05)"
              stroke="var(--line-strong)"
            />
            <text x={node.x} y={node.y - 4} fontSize="10" fill="var(--text)" textAnchor="middle">
              {node.label}
            </text>
            <text x={node.x} y={node.y + 12} fontSize="8.5" fill="var(--text-faint)" textAnchor="middle">
              {node.label === "endpoint" ? (endpoint ?? "unresolved") : node.label === "device" ? "nora client" : "supervised"}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs">
          <span className="eyebrow mr-2">active profile</span>
          <span className="font-medium">{profileName ?? "none selected"}</span>
        </p>
        <p className="chip">
          {security ?? "none"} · {transport ?? "tcp"} · {core ?? "n/a"}
        </p>
      </div>
    </div>
  );
}
