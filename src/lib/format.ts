export function formatBytes(bytes: number, digits = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : digits)} ${units[index]}`;
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds % 60));
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

export function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return "never";
  const date = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - date.getTime();
  const seconds = Math.round(diff / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toISOString().slice(0, 10);
}

export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function latencyTone(ms: number | null | undefined): "good" | "warn" | "bad" | "unknown" {
  if (ms === null || ms === undefined) return "unknown";
  if (ms <= 90) return "good";
  if (ms <= 200) return "warn";
  return "bad";
}

export function sparklinePath(values: number[], width: number, height: number): string {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function areaPath(values: number[], width: number, height: number): string {
  const line = sparklinePath(values, width, height);
  if (!line) return "";
  return `${line} L${width},${height} L0,${height} Z`;
}

export function deterministicSeed(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function statusTone(status: string): "good" | "warn" | "bad" | "info" | "muted" {
  switch (status) {
    case "connected":
    case "valid":
    case "ok":
      return "good";
    case "connecting":
    case "warnings":
    case "partial":
    case "degraded":
      return "warn";
    case "error":
    case "invalid":
    case "fail":
    case "blocked":
      return "bad";
    case "disconnecting":
      return "info";
    default:
      return "muted";
  }
}
