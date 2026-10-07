"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FALLBACK_SNAPSHOT, useTunnel, TunnelProvider } from "@/components/tunnel-context";
import { useToast, ToastProvider } from "@/components/toast";
import { NotificationBell } from "@/components/notification-bell";
import { THEME_PRESETS, useTheme } from "@/components/theme-provider";
import { Badge, Dot, Icon } from "@/components/ui";
import type { TunnelSnapshot } from "@/lib/snapshot";
import { formatBytes, formatClock } from "@/lib/format";

const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: string; hint: string }[] }[] = [
  {
    label: "Tunnel",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard", hint: "Live tunnel state" },
      { href: "/profiles", label: "Profiles", icon: "layers", hint: "Import, validate, templates" },
      { href: "/routing", label: "Routing Studio", icon: "route", hint: "Rules + decision simulator" },
      { href: "/apps", label: "Split Tunnel", icon: "command", hint: "Per-app proxy / direct / block" },
    ],
  },
  {
    label: "Observe",
    items: [
      { href: "/network-lab", label: "Network Lab", icon: "pulse", hint: "DNS, TCP, TLS, latency" },
      { href: "/speed-test", label: "Speed Test", icon: "bolt", hint: "Real throughput measurement" },
      { href: "/notifications", label: "Alerts", icon: "alert", hint: "State-derived notifications" },
      { href: "/logs", label: "Logs", icon: "terminal", hint: "Audit trail" },
      { href: "/history", label: "History", icon: "clock", hint: "Sessions + aggregates" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/security", label: "Security", icon: "shield", hint: "Posture + redaction lab" },
      { href: "/appearance", label: "Appearance", icon: "sun", hint: "Theme studio, 8 presets" },
      { href: "/apk", label: "APK & Phone", icon: "download", hint: "GitHub Actions → install" },
      { href: "/settings", label: "Settings", icon: "gear", hint: "Workspace defaults" },
    ],
  },
];

const NAV = NAV_GROUPS.flatMap((group) => group.items);



function stateTone(state: string) {
  if (state === "connected") return "good" as const;
  if (state === "degraded" || state === "connecting") return "warn" as const;
  if (state === "error") return "bad" as const;
  return "muted" as const;
}

export function Shell({
  initial,
  settings,
  unreadAlerts,
  children,
}: {
  initial: TunnelSnapshot;
  settings: { operatorName: string; theme: string; accent: string };
  unreadAlerts: number;
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <TunnelProvider initial={initial}>
        <ShellInner settings={settings} unreadAlerts={unreadAlerts}>
          {children}
        </ShellInner>
      </TunnelProvider>
    </ToastProvider>
  );
}

function ShellInner({ settings, unreadAlerts, children }: { settings: { operatorName: string; theme: string; accent: string }; unreadAlerts: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { snapshot: liveSnapshot, busy, toggle, refresh } = useTunnel();
  const snapshot = liveSnapshot ?? FALLBACK_SNAPSHOT;
  const { push } = useToast();
  const { applyPreset, save, appearance, setThemeMode: setThemeState } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [theme, setTheme] = useState(settings.theme);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const state = snapshot.state;
  const tone = stateTone(state);
  const rx = snapshot.rxBytes;
  const tx = snapshot.txBytes;

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // keep the appearance provider in step with the persisted theme mode
  useEffect(() => {
    setThemeState(theme === "dark" ? "dark" : "light");
  }, [theme, setThemeState]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const saveSettings = useCallback(async (patch: Record<string, unknown>) => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    router.refresh();
  }, [router]);

  const runDiagnostic = useCallback(
    async (kind: string) => {
      setRunning(kind);
      try {
        const response = await fetch("/api/diagnostics", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, profileId: snapshot.activeProfile?.id ?? null }),
        });
        const json = (await response.json()) as { ok: boolean; payload?: { status: string; target: string; stages: { durationMs: number }[] }; error?: string };
        if (json.ok && json.payload) {
          const total = json.payload.stages.reduce((sum, stage) => sum + stage.durationMs, 0);
          push({
            title: `${kind.toUpperCase()} probe ${json.payload.status}`,
            detail: `${json.payload.target} · ${total}ms across ${json.payload.stages.length} stages`,
            tone: json.payload.status === "ok" ? "good" : "warn",
          });
          router.refresh();
        } else {
          push({ title: "Probe failed", detail: json.error ?? "unknown error", tone: "bad" });
        }
      } finally {
        setRunning(null);
      }
    },
    [snapshot.activeProfile?.id, push, router],
  );

  const copyActiveLink = useCallback(async () => {
    if (!snapshot.activeProfile?.id) {
      push({ title: "No active profile", detail: "Connect or select a profile first.", tone: "warn" });
      return;
    }
    const response = await fetch(`/api/profiles/export?id=${snapshot.activeProfile.id}&format=links`);
    const link = await response.text();
    try {
      await navigator.clipboard.writeText(link);
      push({ title: "Share link copied", detail: "Treat share links as secrets.", tone: "good" });
    } catch {
      push({ title: "Clipboard blocked", detail: link.slice(0, 60), tone: "warn" });
    }
  }, [snapshot.activeProfile?.id, push]);

  type Command = { id: string; label: string; hint: string; icon: string; run: () => void | Promise<void>; group: string };

  const commands: Command[] = useMemo(
    () => [
      ...NAV.map((item) => ({
        id: `nav-${item.href}`,
        label: item.label,
        hint: item.hint,
        icon: item.icon,
        group: "Navigate",
        run: () => router.push(item.href),
      })),
      {
        id: "tunnel-toggle",
        label: state === "connected" || state === "degraded" ? "Disconnect tunnel" : "Connect best profile",
        hint: "Runs the full handshake pipeline",
        icon: "power",
        group: "Tunnel",
        run: () => toggle(),
      },
      {
        id: "tunnel-refresh",
        label: "Refresh telemetry now",
        hint: "Tick the control-plane clock",
        icon: "refresh",
        group: "Tunnel",
        run: () => refresh(true),
      },
      {
        id: "diag-path",
        label: "Run full path probe",
        hint: "DNS → TCP → TLS → latency",
        icon: "pulse",
        group: "Diagnostics",
        run: () => runDiagnostic("path"),
      },
      {
        id: "diag-egress",
        label: "Run egress identity check",
        hint: "See what a remote peer sees",
        icon: "globe",
        group: "Diagnostics",
        run: () => runDiagnostic("egress"),
      },
      {
        id: "copy-link",
        label: "Copy active share link",
        hint: "Exports the vless/trojan/ss link",
        icon: "copy",
        group: "Profiles",
        run: () => copyActiveLink(),
      },
      {
        id: "theme",
        label: `Switch theme (${theme === "dark" ? "light" : "dark"})`,
        hint: "Applied workspace-wide",
        icon: theme === "dark" ? "sun" : "moon",
        group: "Workspace",
        run: async () => {
          const next = theme === "dark" ? "light" : "dark";
          setTheme(next);
          await saveSettings({ theme: next });
        },
      },
      {
        id: "preset",
        label: "Cycle appearance preset",
        hint: `8 looks · current: ${appearance.presetName}`,
        icon: "bolt",
        group: "Workspace",
        run: async () => {
          const index = Math.max(0, THEME_PRESETS.findIndex((preset) => preset.name === appearance.presetName));
          const next = THEME_PRESETS[(index + 1) % THEME_PRESETS.length];
          applyPreset(next);
          await save();
          await saveSettings({ theme: next.theme });
          push({ title: `${next.emoji} ${next.name}`, detail: "Preset applied and saved.", tone: "good" });
        },
      },
      {
        id: "appearance",
        label: "Open appearance studio",
        hint: "Colour, glass, density, radius, type",
        icon: "layers",
        group: "Workspace",
        run: () => router.push("/appearance"),
      },
      {
        id: "speedtest",
        label: "Run a speed test",
        hint: "Real streamed throughput measurement",
        icon: "bolt",
        group: "Diagnostics",
        run: () => router.push("/speed-test"),
      },
      {
        id: "apps",
        label: "Split tunnel by app",
        hint: "Proxy / direct / block per package",
        icon: "command",
        group: "Profiles",
        run: () => router.push("/apps"),
      },
      {
        id: "alerts",
        label: "Open notification centre",
        hint: "State-derived alerts",
        icon: "alert",
        group: "Workspace",
        run: () => router.push("/notifications"),
      },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        hint: "Show cheat sheet",
        icon: "command",
        group: "Workspace",
        run: () => setShortcutsOpen(true),
      },
    ],
    [router, state, toggle, refresh, runDiagnostic, copyActiveLink, theme, saveSettings, appearance, applyPreset, save, push],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => `${command.label} ${command.hint} ${command.group}`.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        setQuery("");
        setCursor(0);
      }
      if (event.key === "?" && !paletteOpen) {
        setShortcutsOpen(true);
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void runDiagnostic("path");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen, runDiagnostic]);

  useEffect(() => {
    if (paletteOpen) setTimeout(() => inputRef.current?.focus(), 40);
  }, [paletteOpen]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] gap-4 px-3 py-4 md:px-5">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[248px] shrink-0 flex-col gap-3 border-r p-3 transition-transform md:sticky md:top-4 md:z-0 md:h-[calc(100vh-2rem)] md:translate-x-0 md:border-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "rgba(5,7,16,0.92)", backdropFilter: "blur(20px)", borderColor: "var(--line)" }}
      >
        <Link href="/" className="glass flex items-center gap-3 rounded-2xl px-3 py-3">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "#05060f" }}
          >
            <Icon name="shield" className="h-4.5 w-4.5" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-wide">NORA TUNNEL</span>
            <span className="block text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--text-faint)" }}>
              web control plane
            </span>
          </span>
        </Link>

        <nav className="glass flex-1 space-y-1 overflow-y-auto rounded-2xl p-2 scroll-thin">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-0.5">
              <p className="nav-group-label">{group.label}</p>
              {group.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} className="nav-item" data-active={active}>
                    <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.href === "/notifications" ? <span className="num text-[10px]" style={{ color: "var(--text-faint)" }}>{unreadAlerts}</span> : null}
                    {item.href === "/" && snapshot.state !== "disconnected" ? <Dot tone="good" pulse /> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="glass rounded-2xl p-3">
          <p className="eyebrow">operator</p>
          <p className="mt-1 truncate text-sm font-medium">{settings.operatorName}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="accent">{snapshot.settings.dnsMode} dns</Badge>
            <Badge tone={snapshot.settings.strictValidation ? "good" : "warn"}>strict {snapshot.settings.strictValidation ? "on" : "off"}</Badge>
          </div>
          <div className="mt-3">
            <p className="eyebrow mb-1.5">quick tint</p>
            <div className="flex flex-wrap gap-1.5">
              {THEME_PRESETS.slice(0, 5).map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  title={preset.name}
                  className="quick-dot"
                  style={{ background: `linear-gradient(135deg, ${preset.values.accentHex}, ${preset.values.accent2Hex})` }}
                  onClick={() => {
                    applyPreset(preset);
                    void save();
                    void saveSettings({ theme: preset.theme });
                    push({ title: `${preset.name} applied`, detail: "Preset saved to the workspace.", tone: "good" });
                  }}
                />
              ))}
              <Link href="/appearance" className="btn px-2 py-1 text-[10px]">
                studio
              </Link>
            </div>
          </div>
          <div className="hairline my-3" />
          <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-faint)" }}>
            <span className="num">rx {formatBytes(rx)}</span>
            <span className="num">tx {formatBytes(tx)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]" style={{ color: "var(--text-faint)" }}>
            <span className="num">up {formatClock(snapshot.uptimeSec)}</span>
            <span className="num">{snapshot.rules.active} rules</span>
          </div>
        </div>
      </aside>

      {navOpen ? <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setNavOpen(false)} aria-hidden /> : null}

      <div className="min-w-0 flex-1">
        <header className="glass-strong sticky top-4 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl p-2.5">
          <button type="button" className="btn px-2 py-2 md:hidden" onClick={() => setNavOpen((open) => !open)} aria-label="Menu">
            <Icon name="menu" />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <Dot tone={tone} pulse={state === "connecting"} />
            <span className="truncate text-sm font-medium">{snapshot.activeProfile?.name ?? "No active profile"}</span>
            <span className="chip hidden sm:inline-flex">
              {snapshot.activeProfile ? `${snapshot.activeProfile.core} · ${snapshot.activeProfile.transport}` : "idle"}
            </span>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="num chip">
              {snapshot.latencyMs ? `${snapshot.latencyMs}ms` : "—"} rtt · {formatClock(snapshot.uptimeSec)} up
            </span>
            <NotificationBell initialUnread={unreadAlerts} />
            <Link href="/appearance" className="btn px-2.5 py-1.5" title={`Appearance studio — ${appearance.presetName}`}>
              <Icon name="layers" className="h-3.5 w-3.5" />
            </Link>
            <button type="button" className="btn px-2.5 py-1.5" onClick={() => setPaletteOpen(true)} title="Command palette (⌘K)">
              <Icon name="command" className="h-3.5 w-3.5" />
              <span className="hidden text-[11px] lg:inline">⌘K</span>
            </button>
            <button
              type="button"
              className="btn px-2.5 py-1.5"
              onClick={() => runDiagnostic("path")}
              disabled={running !== null}
              title="Run path probe (⌘⇧D)"
            >
              <Icon name={running === "path" ? "refresh" : "pulse"} className={`h-3.5 w-3.5 ${running ? "spin-slow" : ""}`} />
            </button>
            <button
              type="button"
              className="btn px-2.5 py-1.5"
              onClick={async () => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                setThemeState(next);
                await saveSettings({ theme: next });
              }}
              title="Toggle dark / light"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={state === "connected" || state === "degraded" ? "btn btn-danger" : "btn btn-primary"}
              onClick={() => void toggle()}
              disabled={busy}
            >
              <Icon name={state === "connected" || state === "degraded" ? "stop" : "play"} className="h-3.5 w-3.5" />
              {busy ? "working" : state === "connected" || state === "degraded" ? "disconnect" : "connect"}
            </button>
          </div>
        </header>

        <main className="pb-10">{children}</main>

        <footer className="glass mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
          <span>
            NORA TUNNEL web control plane · validation-first · no custom cryptography · upstream cores: Xray, sing-box, wireguard-go, OpenVPN3
          </span>
          <span className="num">state={state} stage={snapshot.stage}</span>
        </footer>
      </div>

      {paletteOpen ? (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setPaletteOpen(false)}>
          <div className="glass-strong rise w-full max-w-xl overflow-hidden rounded-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
              <Icon name="search" className="h-4 w-4" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") setCursor((value) => Math.min(filtered.length - 1, value + 1));
                  if (event.key === "ArrowUp") setCursor((value) => Math.max(0, value - 1));
                  if (event.key === "Enter" && filtered[cursor]) {
                    void filtered[cursor].run();
                    setPaletteOpen(false);
                  }
                }}
                placeholder="Search commands, screens and actions…"
                className="w-full bg-transparent text-sm outline-none"
              />
              <span className="chip">esc</span>
            </div>
            <ul className="max-h-[52vh] overflow-y-auto p-2 scroll-thin">
              {filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-faint)" }}>
                  No matching command.
                </li>
              ) : null}
              {filtered.map((command, index) => (
                <li key={command.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => {
                      void command.run();
                      setPaletteOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition"
                    style={index === cursor ? { background: "var(--accent-soft)" } : undefined}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-lg border" style={{ borderColor: "var(--line)" }}>
                      <Icon name={command.icon} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{command.label}</span>
                      <span className="block truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {command.hint}
                      </span>
                    </span>
                    <span className="chip">{command.group}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {shortcutsOpen ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShortcutsOpen(false)}>
          <div className="glass-strong rise w-full max-w-md rounded-2xl p-5" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold">Keyboard shortcuts</h3>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                ["⌘K / Ctrl K", "Open command palette"],
                ["⌘⇧D", "Run full path probe"],
                ["?", "Show this cheat sheet"],
                ["Esc", "Close overlays"],
              ].map(([keys, label]) => (
                <li key={keys} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ borderColor: "var(--line)" }}>
                  <span style={{ color: "var(--text-dim)" }}>{label}</span>
                  <span className="num chip">{keys}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px]" style={{ color: "var(--text-faint)" }}>
              The connect control never reports connected unless a real control connection to the endpoint succeeded.
            </p>
            <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => setShortcutsOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


