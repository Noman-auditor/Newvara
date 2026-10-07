"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { ACCENT_PALETTE, DEFAULT_APPEARANCE, THEME_PRESETS, mixHex, rgba, useTheme, type Appearance, type ThemePreset } from "@/components/theme-provider";
import { Badge, CopyButton, Icon, KV, Panel, SectionTitle } from "@/components/ui";

const RADIUS = [
  { id: "sharp", label: "Sharp", hint: "6px — terminal feel" },
  { id: "compact", label: "Compact", hint: "11px — dense panels" },
  { id: "default", label: "Default", hint: "18px — balanced" },
  { id: "round", label: "Round", hint: "26px — soft, mobile-first" },
];

const DENSITY = [
  { id: "compact", label: "Compact", hint: "tighter rows, more data" },
  { id: "comfortable", label: "Comfortable", hint: "default spacing" },
  { id: "roomy", label: "Roomy", hint: "large touch targets" },
];

const FONTS = [
  { id: "sans", label: "Inter Sans", hint: "neutral UI face" },
  { id: "mono", label: "Mono Terminal", hint: "tabular, engineer vibe" },
  { id: "display", label: "Serif Display", hint: "editorial headings" },
  { id: "grotesk", label: "Grotesk", hint: "wide geometric" },
];

const PATTERNS = [
  { id: "grid", label: "Grid" },
  { id: "dots", label: "Dots" },
  { id: "diagonal", label: "Diagonal" },
  { id: "mesh", label: "Mesh glow" },
  { id: "none", label: "None" },
];

const MOTION = [
  { id: "full", label: "Full motion" },
  { id: "calm", label: "Calm" },
  { id: "off", label: "Off" },
];

export function AppearanceView({ initialTheme }: { initialTheme: "dark" | "light" }) {
  const { appearance, themeMode, update, setThemeMode, applyPreset, save, reset, dirty, saving } = useTheme();
  const { push } = useToast();
  const router = useRouter();
  const [restoreText, setRestoreText] = useState("");
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [report, setReport] = useState<{ restored: Record<string, number>; skipped: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = useRef(initialTheme);
  saved.current = themeMode;

  const persist = useCallback(
    async (silent = false) => {
      await save();
      if (!silent) push({ title: "Appearance saved", detail: "Tokens stored in PostgreSQL and applied everywhere.", tone: "good" });
      router.refresh();
    },
    [save, push, router],
  );

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void persist(true), 1100);
    return () => clearTimeout(timer);
  }, [appearance, themeMode, dirty, persist]);

  const cssSnippet = `:root {
  --accent: ${appearance.accentHex};
  --accent-2: ${appearance.accent2Hex};
  --accent-3: ${appearance.accent3Hex};
  --glass-blur: ${appearance.glassBlur}px;
  --glass-alpha: ${(appearance.glassAlpha / 100).toFixed(3)};
  --aurora-opacity: ${(appearance.auroraIntensity / 100).toFixed(2)};
  --grid-opacity: ${(appearance.gridOpacity / 100).toFixed(2)};
}
/* html data attributes */
[data-theme="${themeMode}"][data-radius="${appearance.radiusScale}"][data-density="${appearance.density}"][data-font="${appearance.fontFamily}"][data-pattern="${appearance.bgPattern}"][data-motion="${appearance.motionLevel}"]`;

  const importWorkspace = async () => {
    setBusy(true);
    try {
      const parsed = JSON.parse(restoreText || "{}") as Record<string, unknown>;
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: parsed, mode: restoreMode }),
      });
      const json = (await response.json()) as { ok: boolean; report?: { restored: Record<string, number>; skipped: string[] }; error?: string };
      if (json.ok && json.report) {
        setReport(json.report);
        push({
          title: "Workspace restored",
          detail: `${json.report.restored.profiles ?? 0} profiles · ${json.report.restored.rules ?? 0} rules · ${json.report.restored.settings ?? 0} settings`,
          tone: "good",
        });
        router.refresh();
      } else {
        push({ title: "Restore rejected", detail: json.error ?? "invalid payload", tone: "bad" });
      }
    } catch (error) {
      push({ title: "Restore failed", detail: (error as Error).message, tone: "bad" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Panel strong>
          <SectionTitle
            eyebrow="theme presets"
            title="Eight ready looks"
            description="Presets set colours, geometry, density, typography, background and motion in one click — then fine-tune anything below."
            action={dirty ? <Badge tone="warn">unsaved</Badge> : <Badge tone="good">saved</Badge>}
          />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {THEME_PRESETS.map((preset: ThemePreset) => {
              const active = appearance.presetName === preset.name;
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-2xl border p-3 text-left transition hover:-translate-y-0.5"
                  style={{
                    borderColor: active ? "var(--line-strong)" : "var(--line)",
                    background: active ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {preset.emoji} {preset.name}
                    </span>
                    {active ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                  </div>
                  <div className="mt-2 flex gap-1">
                    {[preset.values.accentHex, preset.values.accent2Hex, preset.values.accent3Hex].map((hex) => (
                      <span key={hex} className="h-4 w-4 rounded-full border" style={{ background: hex, borderColor: "var(--line-strong)" }} />
                    ))}
                  </div>
                  <p className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {preset.theme} · {preset.values.fontFamily} · {preset.values.radiusScale}
                  </p>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="colour" title="Accent trio" description="Accent drives buttons and focus, the second colour drives gradients and charts, the third powers glows." />
          <div className="grid gap-4 sm:grid-cols-3">
            {([
              { key: "accentHex" as const, label: "Accent" },
              { key: "accent2Hex" as const, label: "Secondary" },
              { key: "accent3Hex" as const, label: "Glow" },
            ]).map((slot) => (
              <div key={slot.key} className="rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
                <span className="label">{slot.label}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={appearance[slot.key]}
                    onChange={(event) => update({ [slot.key]: event.target.value } as Partial<Appearance>)}
                    className="h-9 w-12 cursor-pointer rounded-lg border bg-transparent"
                    style={{ borderColor: "var(--line-strong)" }}
                    aria-label={`${slot.label} colour`}
                  />
                  <input
                    className="input num"
                    value={appearance[slot.key]}
                    onChange={(event) => {
                      const value = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;
                      update({ [slot.key]: value } as Partial<Appearance>);
                    }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ACCENT_PALETTE.slice(0, 6).map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className="quick-dot"
                      title={hex}
                      style={{ background: hex }}
                      onClick={() => update({ [slot.key]: hex } as Partial<Appearance>)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => update({ accent2Hex: mixHex(appearance.accentHex, "#ffffff", 0.45) })}>
              <Icon name="bolt" className="h-3.5 w-3.5" />
              Auto-match secondary
            </button>
            <button type="button" className="btn" onClick={() => update({ accent3Hex: mixHex(appearance.accentHex, "#000000", 0.35) })}>
              <Icon name="bolt" className="h-3.5 w-3.5" />
              Auto-match glow
            </button>
            <CopyButton value={cssSnippet} label="Copy CSS tokens" />
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="surfaces" title="Glass, aurora & backdrop" description="Tune depth without touching code. Extra blur costs GPU time on low-end phones." />
          {([
            { key: "glassBlur" as const, label: "Glass blur", min: 0, max: 40, unit: "px" },
            { key: "glassAlpha" as const, label: "Glass opacity", min: 0, max: 20, unit: "%" },
            { key: "auroraIntensity" as const, label: "Aurora glow", min: 0, max: 100, unit: "%" },
            { key: "gridOpacity" as const, label: "Backdrop pattern", min: 0, max: 100, unit: "%" },
          ]).map((slider) => (
            <div key={slider.key} className="mb-3">
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--text-dim)" }}>{slider.label}</span>
                <span className="num">
                  {appearance[slider.key]}
                  {slider.unit}
                </span>
              </div>
              <input
                type="range"
                className="range mt-2"
                min={slider.min}
                max={slider.max}
                value={appearance[slider.key]}
                onChange={(event) => update({ [slider.key]: Number(event.target.value) } as Partial<Appearance>)}
              />
            </div>
          ))}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="label">Backdrop pattern</span>
              <div className="flex flex-wrap gap-1.5">
                {PATTERNS.map((pattern) => (
                  <button
                    key={pattern.id}
                    type="button"
                    className="btn px-2.5 py-1 text-[11px]"
                    style={appearance.bgPattern === pattern.id ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                    onClick={() => update({ bgPattern: pattern.id })}
                  >
                    {pattern.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Motion</span>
              <div className="flex flex-wrap gap-1.5">
                {MOTION.map((motion) => (
                  <button
                    key={motion.id}
                    type="button"
                    className="btn px-2.5 py-1 text-[11px]"
                    style={appearance.motionLevel === motion.id ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                    onClick={() => update({ motionLevel: motion.id })}
                  >
                    {motion.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="geometry" title="Radius, density & typography" />
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <span className="label">Corner radius</span>
              <div className="grid gap-1.5">
                {RADIUS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="btn w-full justify-between px-2.5 py-1.5 text-[11px]"
                    style={appearance.radiusScale === item.id ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                    onClick={() => update({ radiusScale: item.id })}
                  >
                    <span>{item.label}</span>
                    <span style={{ color: "var(--text-faint)" }}>{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Density</span>
              <div className="grid gap-1.5">
                {DENSITY.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="btn w-full justify-between px-2.5 py-1.5 text-[11px]"
                    style={appearance.density === item.id ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                    onClick={() => update({ density: item.id })}
                  >
                    <span>{item.label}</span>
                    <span style={{ color: "var(--text-faint)" }}>{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Typography</span>
              <div className="grid gap-1.5">
                {FONTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="btn w-full justify-between px-2.5 py-1.5 text-[11px]"
                    style={appearance.fontFamily === item.id ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                    onClick={() => update({ fontFamily: item.id })}
                  >
                    <span>{item.label}</span>
                    <span style={{ color: "var(--text-faint)" }}>{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <span className="label">Base theme</span>
            <div className="flex gap-2">
              {(["dark", "light"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="btn px-3 py-1.5 text-[11px]"
                  style={themeMode === mode ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                  onClick={() => setThemeMode(mode)}
                >
                  <Icon name={mode === "dark" ? "moon" : "sun"} className="h-3.5 w-3.5" />
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel strong>
          <SectionTitle eyebrow="live preview" title="Sample components" description="Everything on this panel reacts instantly — no reload, no rebuild." />
          <div className="space-y-3">
            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--line)", background: "linear-gradient(135deg, " + rgba(appearance.accentHex, 0.18) + ", transparent)" }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Zurich Reality Edge</p>
                <Badge tone="good">connected</Badge>
              </div>
              <p className="num mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
                vless · xray/tcp · reality · 1.1.1.1:443
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary px-3 py-1.5 text-[11px]">
                  <Icon name="play" className="h-3.5 w-3.5" />
                  Connect
                </button>
                <button type="button" className="btn px-3 py-1.5 text-[11px]">
                  <Icon name="pulse" className="h-3.5 w-3.5" />
                  Diagnose
                </button>
                <span className="chip">42ms rtt</span>
                <span className="chip">jitter 3ms</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[appearance.accentHex, appearance.accent2Hex, appearance.accent3Hex].map((hex, index) => (
                <div key={`${hex}-${index}`} className="rounded-xl border p-2 text-center" style={{ borderColor: "var(--line)" }}>
                  <div className="h-10 w-full rounded-lg" style={{ background: `linear-gradient(135deg, ${hex}, ${rgba(hex, 0.35)})` }} />
                  <p className="num mt-1 text-[10px]">{hex}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <input className="input num" placeholder="accent-tinted input focus" />
              <div className="h-16 w-full overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)" }}>
                <svg viewBox="0 0 240 64" preserveAspectRatio="none" className="h-full w-full">
                  <defs>
                    <linearGradient id="preview-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={appearance.accentHex} stopOpacity="0.5" />
                      <stop offset="100%" stopColor={appearance.accentHex} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,52 C30,30 55,44 80,26 C110,4 140,40 170,22 C200,6 220,30 240,16 L240,64 L0,64 Z" fill="url(#preview-fill)" />
                  <path d="M0,52 C30,30 55,44 80,26 C110,4 140,40 170,22 C200,6 220,30 240,16" fill="none" stroke={appearance.accentHex} strokeWidth="2" />
                  <path d="M0,58 C30,46 60,56 90,40 C120,26 150,54 180,38 C210,24 226,42 240,32" fill="none" stroke={appearance.accent2Hex} strokeWidth="1.4" strokeDasharray="4 3" />
                </svg>
              </div>
              <div className="flex gap-2">
                <span className="chip">badge</span>
                <span className="pill tone-good" style={{ background: "rgba(69,240,176,0.12)" }}>healthy</span>
                <span className="pill tone-warn" style={{ background: "rgba(255,200,87,0.12)" }}>degraded</span>
                <span className="pill tone-bad" style={{ background: "rgba(255,107,139,0.12)" }}>blocked</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void persist()} disabled={saving}>
              <Icon name={saving ? "refresh" : "check"} className={`h-3.5 w-3.5 ${saving ? "spin-slow" : ""}`} />
              {saving ? "Saving…" : "Save appearance"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                reset();
                push({ title: "Reset to defaults", detail: DEFAULT_APPEARANCE.presetName, tone: "info" });
              }}
            >
              <Icon name="refresh" className="h-3.5 w-3.5" />
              Reset
            </button>
            <a className="btn" href="/settings">
              <Icon name="gear" className="h-3.5 w-3.5" />
              Workspace settings
            </a>
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="backup" title="Workspace export & restore" description="One JSON file with profiles, routing rules, settings, sessions, diagnostics, logs, speed tests and alerts. Choose whether secrets are included." />
          <div className="flex flex-wrap gap-2">
            <a className="btn" href="/api/workspace?download=1">
              <Icon name="download" className="h-3.5 w-3.5" />
              Export (secrets redacted)
            </a>
            <a className="btn btn-danger" href="/api/workspace?download=1&secrets=1">
              <Icon name="lock" className="h-3.5 w-3.5" />
              Export with secrets
            </a>
          </div>
          <div className="mt-3">
            <span className="label">Restore from JSON</span>
            <textarea
              className="textarea num"
              rows={5}
              value={restoreText}
              onChange={(event) => setRestoreText(event.target.value)}
              placeholder='Paste a workspace export here: { "profiles": [...], "rules": [...], ... }'
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5">
                {(["merge", "replace"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="btn px-2.5 py-1 text-[11px]"
                    style={restoreMode === mode ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                    onClick={() => setRestoreMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void importWorkspace()} disabled={busy || !restoreText.trim()}>
                <Icon name={busy ? "refresh" : "download"} className={`h-3.5 w-3.5 ${busy ? "spin-slow" : ""}`} />
                {busy ? "Restoring…" : "Restore workspace"}
              </button>
            </div>
            <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
              {restoreMode === "merge"
                ? "Merge keeps existing records and skips duplicate ids — safest option."
                : "Replace deletes existing profiles and rules before inserting the backup."}
            </p>
          </div>
          {report ? (
            <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
              <p className="eyebrow">restore report</p>
              <div className="mt-2 grid gap-1">
                {Object.entries(report.restored).map(([key, value]) => (
                  <KV key={key} label={key} value={String(value)} />
                ))}
                <KV label="skipped" value={String(report.skipped.length)} tone={report.skipped.length ? "tone-warn" : ""} />
              </div>
              {report.skipped.length ? (
                <ul className="mt-2 space-y-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {report.skipped.slice(0, 6).map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
