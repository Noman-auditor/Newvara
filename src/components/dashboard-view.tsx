"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTunnel } from "@/components/tunnel-context";
import { useToast } from "@/components/toast";
import { Bars, Donut, Gauge, RadialOrb, Sparkline, TraceTimeline, TrafficChart, TunnelDiagram } from "@/components/charts";
import { Badge, Dot, EmptyState, Icon, KV, Meter, Panel, SectionTitle, Segmented } from "@/components/ui";
import { formatBytes, formatClock, formatDuration, formatRate, latencyTone, relativeTime, statusTone } from "@/lib/format";
import type { NotificationRow } from "@/db/schema";
import type { DashboardStats, SecurityPosture } from "@/lib/store";
import type { DiagnosticRow, LogRow, ProfileRow, SessionRow } from "@/db/schema";

const KINDS = ["dns", "tcp", "tls", "latency", "http", "path", "egress"] as const;

export function DashboardView({
  stats,
  sessions,
  diagnostics,
  logs,
  profiles,
  posture,
  alerts,
  activeDiag,
}: {
  stats: DashboardStats;
  sessions: SessionRow[];
  diagnostics: DiagnosticRow[];
  logs: LogRow[];
  profiles: ProfileRow[];
  posture: SecurityPosture;
  alerts: NotificationRow[];
  activeDiag: { stages: { stage: string; label: string; status: string; durationMs: number; detail?: string }[]; payload: string | null; kind: string | null };
}) {
  const { snapshot, busy, toggle, connect, refresh } = useTunnel();
  const { push } = useToast();
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [selectedDiag, setSelectedDiag] = useState<string | null>(activeDiag.kind);
  const [trace, setTrace] = useState(activeDiag.stages);
  const [range, setRange] = useState<"rx" | "tx">("rx");

  const samples = snapshot.samples;
  const rates = samples.map((sample) => (range === "rx" ? sample.rx : sample.tx));
  const lastRate = rates.at(-1) ?? 0;
  const peakRate = Math.max(...rates, 1);
  const latest = samples.at(-1);
  const isActive = snapshot.state === "connected" || snapshot.state === "degraded";

  const candidates = useMemo(
    () => profiles.filter((profile) => profile.validationStatus !== "invalid").slice(0, 6),
    [profiles],
  );

  useEffect(() => setTrace(activeDiag.stages), [activeDiag.stages]);

  const runProbe = useCallback(
    async (kind: string) => {
      setRunning(kind);
      setSelectedDiag(kind);
      try {
        const response = await fetch("/api/diagnostics", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, profileId: snapshot.activeProfile?.id ?? null }),
        });
        const json = (await response.json()) as {
          ok: boolean;
          payload?: { status: string; target: string; stages: { stage: string; label: string; status: string; durationMs: number; detail?: string }[]; notes: string[] };
          error?: string;
        };
        if (json.ok && json.payload) {
          setTrace(json.payload.stages);
          const total = json.payload.stages.reduce((sum, stage) => sum + stage.durationMs, 0);
          push({
            title: `${kind.toUpperCase()} probe ${json.payload.status}`,
            detail: `${json.payload.target} · ${total}ms`,
            tone: json.payload.status === "ok" ? "good" : "warn",
          });
          router.refresh();
        } else {
          push({ title: "Probe failed", detail: json.error ?? "unknown error", tone: "bad" });
        }
      } catch (error) {
        push({ title: "Probe failed", detail: (error as Error).message, tone: "bad" });
      } finally {
        setRunning(null);
      }
    },
    [snapshot.activeProfile?.id, push, router],
  );

  const capBytes = snapshot.settings.dataCapGb * 1024 ** 3;
  const capPct = capBytes ? (snapshot.rxBytes / capBytes) * 100 : 0;
  const latencyAlarm = snapshot.settings.latencyAlarmMs;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel strong className="scan relative overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">control plane</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-[1.7rem]">
                {isActive ? "Session in progress" : "Tunnel workspace ready"}
              </h1>
              <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--text-dim)" }}>
                Validation-first orchestration for WireGuard, VLESS/Reality, Trojan, VMess, Shadowsocks, Hysteria2 and TUIC profiles.
                Probes are real; counters are labelled telemetry samples.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={snapshot.state === "connected" ? "good" : snapshot.state === "degraded" ? "warn" : "muted"}>
                <Dot tone={snapshot.state === "connected" ? "good" : snapshot.state === "degraded" ? "warn" : "muted"} pulse={isActive} />
                {snapshot.state}
              </Badge>
              <Badge tone={snapshot.telemetry.deviceReporting ? "good" : "warn"}>
                {snapshot.telemetry.deviceReporting ? `device-measured · ${snapshot.telemetry.deviceModel ?? "android"}` : "control-plane samples"}
              </Badge>
              <Badge tone="info">stage {snapshot.stage}</Badge>
              {snapshot.activeProfile ? <Badge tone="accent">{snapshot.activeProfile.securityLayer} · {snapshot.activeProfile.transport}</Badge> : null}
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <div className="mx-auto">
              <RadialOrb state={snapshot.state} latency={snapshot.latencyMs} onToggle={() => void toggle()} busy={busy} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="downlink" value={formatRate(lastRate)} tone="tone-good" />
              <Metric label="uplink" value={formatRate(samples.at(-1)?.tx ?? 0)} />
              <Metric label="session clock" value={formatClock(snapshot.uptimeSec)} />
              <Metric label="rtt" value={snapshot.latencyMs ? `${snapshot.latencyMs}ms` : "—"} tone={latencyTone(snapshot.latencyMs) === "bad" ? "tone-bad" : latencyTone(snapshot.latencyMs) === "warn" ? "tone-warn" : "tone-good"} />
              <Metric label="jitter" value={snapshot.jitterMs ? `${snapshot.jitterMs}ms` : "—"} />
              <Metric label="drops" value={String(snapshot.drops)} />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Segmented
                value={range}
                onChange={setRange}
                size="sm"
                options={[
                  { value: "rx", label: "Downlink" },
                  { value: "tx", label: "Uplink" },
                ]}
              />
              <span className="num text-[11px]" style={{ color: "var(--text-faint)" }}>
                peak {formatRate(peakRate)} · {samples.length} samples · cap {snapshot.settings.dataCapGb} GB ({capPct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-32 w-full rounded-xl border p-1" style={{ borderColor: "var(--line)", background: "rgba(4,6,14,0.35)" }}>
              <TrafficChart samples={samples} />
            </div>
            <div className="mt-2 h-14">
              <Sparkline values={rates} stroke={range === "rx" ? "var(--accent)" : "#22d3ee"} />
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <SectionTitle
              eyebrow="path"
              title="Endpoint pipeline"
              action={
                <button type="button" className="btn px-2.5 py-1.5" onClick={() => void refresh(true)}>
                  <Icon name="refresh" className="h-3.5 w-3.5" />
                </button>
              }
            />
            <TunnelDiagram
              state={snapshot.state}
              profileName={snapshot.activeProfile?.name}
              core={snapshot.activeProfile?.core}
              transport={snapshot.activeProfile?.transport}
              security={snapshot.activeProfile?.securityLayer}
              endpoint={snapshot.endpointIp ?? snapshot.activeProfile?.serverAddress}
            />
            <div className="mt-3 grid gap-1">
              <KV label="server" value={snapshot.activeProfile ? `${snapshot.activeProfile.serverAddress}:${snapshot.activeProfile.serverPort}` : "—"} />
              <KV label="endpoint ip" value={snapshot.endpointIp ?? "unresolved"} />
              <KV label="control egress" value={snapshot.controlEgressIp ?? "—"} />
              <KV label="dns" value={`${snapshot.settings.dnsPrimary} · ${snapshot.settings.dnsMode}`} />
              <KV label="validation" value={snapshot.activeProfile ? `${snapshot.activeProfile.validationStatus} · ${snapshot.activeProfile.validationScore}` : "—"} tone={statusTone(snapshot.activeProfile?.validationStatus ?? "unknown") === "good" ? "tone-good" : "tone-warn"} />
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="quick start" title="Connect a validated profile" description="Invalid profiles are refused while strict validation is on." />
            <div className="grid gap-2">
              {candidates.length === 0 ? (
                <EmptyState title="No importable profiles" action={<Link href="/profiles" className="btn btn-primary mt-2">Open profiles</Link>} />
              ) : null}
              {candidates.map((profile, index) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => void connect(profile.id)}
                  disabled={busy}
                  className="flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition hover:bg-white/5 disabled:opacity-60"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[11px]" style={{ borderColor: "var(--line-strong)" }}>
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm">{profile.name}</span>
                      {profile.favorite ? <Icon name="star" className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {profile.protocol} · {profile.core}/{profile.transport} · {profile.serverAddress}:{profile.serverPort}
                    </span>
                  </span>
                  <Badge tone={profile.validationStatus === "valid" ? "good" : profile.validationStatus === "invalid" ? "bad" : "warn"}>
                    {profile.validationScore}
                  </Badge>
                  <Icon name="play" className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <Panel>
          <SectionTitle eyebrow="traffic" title="Lifetime totals" />
          <div className="grid grid-cols-2 gap-3">
            <Metric label="downloaded" value={formatBytes(stats.totalRx)} tone="tone-good" />
            <Metric label="uploaded" value={formatBytes(stats.totalTx)} />
            <Metric label="sessions" value={String(stats.sessionCount)} />
            <Metric label="connected time" value={formatDuration(stats.totalSeconds)} />
          </div>
          <div className="mt-4">
            <p className="eyebrow mb-2">7-day usage</p>
            <Bars
              values={stats.usageTrend.map((day) => day.rx)}
              tones={stats.usageTrend.map((_, index) => (index > 4 ? "good" : "accent"))}
              labels={stats.usageTrend.map((day) => day.day.slice(5))}
            />
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="health" title="Network quality" />
          <div className="flex flex-wrap items-center justify-around gap-3">
            <Gauge value={snapshot.latencyMs ?? stats.avgLatency ?? 0} max={Math.max(latencyAlarm * 2, 300)} unit="ms" label="rtt" />
            <Gauge value={snapshot.jitterMs ?? stats.avgJitter ?? 0} max={60} unit="ms" label="jitter" />
          </div>
          <div className="mt-3 grid gap-1">
            <KV label="avg rtt (history)" value={stats.avgLatency ? `${stats.avgLatency}ms` : "—"} />
            <KV label="worst rtt" value={stats.worstLatency ? `${stats.worstLatency}ms` : "—"} tone={stats.worstLatency && stats.worstLatency > latencyAlarm ? "tone-bad" : ""} />
            <KV label="latency alarm" value={`${latencyAlarm}ms`} />
            <KV label="packets in/out" value={`${snapshot.packetsIn}/${snapshot.packetsOut}`} />
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="routing" title="Decision table" />
          <div className="flex items-center justify-between gap-4">
            <Donut value={Math.round(((snapshot.rules.proxy + snapshot.rules.block) / Math.max(1, snapshot.rules.active)) * 100)} sublabel="steered" label={`${snapshot.rules.proxy + snapshot.rules.block}`} />
            <div className="flex-1 space-y-2">
              <Row label="proxy" value={snapshot.rules.proxy} tone="good" />
              <Row label="direct" value={snapshot.rules.direct} tone="info" />
              <Row label="block" value={snapshot.rules.block} tone="bad" />
              <Row label="disabled" value={snapshot.rules.total - snapshot.rules.active} tone="muted" />
            </div>
          </div>
          <Link href="/routing" className="btn mt-4 w-full">
            <Icon name="route" className="h-3.5 w-3.5" />
            Open routing studio
          </Link>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="security" title="Posture" />
          <div className="flex items-center justify-between gap-4">
            <Donut value={posture.score} label={`${posture.score}`} sublabel={`grade ${posture.grade}`} />
            <div className="flex-1 space-y-2">
              {posture.checks.filter((check) => check.status !== "pass").slice(0, 3).map((check) => (
                <div key={check.id} className="rounded-xl border p-2" style={{ borderColor: "var(--line)" }}>
                  <p className="flex items-center gap-2 text-xs">
                    <Dot tone={check.status === "fail" ? "bad" : "warn"} />
                    {check.title}
                  </p>
                  <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {check.detail.slice(0, 90)}…
                  </p>
                </div>
              ))}
              {posture.checks.every((check) => check.status === "pass") ? (
                <p className="text-xs tone-good">All posture checks passing.</p>
              ) : null}
            </div>
          </div>
          <Link href="/security" className="btn mt-4 w-full">
            <Icon name="shield" className="h-3.5 w-3.5" />
            Security centre
          </Link>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <SectionTitle eyebrow="capacity" title="Session quota" />
          <div className="flex items-center justify-around gap-2">
            <Gauge value={capPct} max={100} unit="%" label="of cap" />
            <div className="flex-1 grid gap-1">
              <KV label="used" value={formatBytes(snapshot.rxBytes + snapshot.txBytes)} />
              <KV label="cap" value={`${snapshot.settings.dataCapGb} GB`} />
              <KV label="remaining" value={formatBytes(Math.max(0, capBytes - snapshot.rxBytes))} />
              <KV label="packets" value={`${snapshot.packetsIn + snapshot.packetsOut}`} />
            </div>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
            Counters are control-plane telemetry samples; the cap is a policy threshold that also drives alerts.
          </p>
        </Panel>

        <Panel>
          <SectionTitle
            eyebrow="alerts"
            title="Notification centre"
            action={<Link href="/notifications" className="btn px-2.5 py-1.5 text-[11px]">Open</Link>}
          />
          <div className="space-y-2">
            {alerts.slice(0, 4).map((alert) => (
              <div key={alert.id} className="rounded-xl border p-2.5" style={{ borderColor: "var(--line)", background: alert.read ? undefined : "var(--accent-soft)" }}>
                <p className="flex items-center gap-2 text-xs">
                  <Dot tone={alert.level === "critical" ? "bad" : alert.level === "warn" ? "warn" : "info"} pulse={alert.level === "critical"} />
                  <span className="truncate">{alert.title}</span>
                </p>
                <p className="mt-0.5 line-clamp-2 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                  {alert.body}
                </p>
                <p className="num mt-1 text-[9.5px]" style={{ color: "var(--text-faint)" }}>{relativeTime(alert.createdAt)}</p>
              </div>
            ))}
            {alerts.length === 0 ? <EmptyState title="No alerts" description="The engine has nothing to flag." /> : null}
          </div>
        </Panel>

        <Panel>
          <SectionTitle
            eyebrow="ranking"
            title="Latency leaderboard"
            action={<Link href="/speed-test" className="btn px-2.5 py-1.5 text-[11px]">Speed test</Link>}
          />
          <div className="space-y-2">
            {[...profiles]
              .sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))
              .slice(0, 6)
              .map((profile, index) => {
                const tone = latencyTone(profile.latencyMs);
                return (
                  <div key={profile.id} className="flex items-center gap-3 rounded-xl border px-3 py-2" style={{ borderColor: "var(--line)" }}>
                    <span className="num text-[11px]" style={{ color: "var(--text-faint)" }}>{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{profile.name}</span>
                      <span className="num block text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {profile.protocol} · {profile.core}/{profile.transport}
                      </span>
                    </span>
                    <span className={`num text-xs ${tone === "good" ? "tone-good" : tone === "warn" ? "tone-warn" : tone === "bad" ? "tone-bad" : ""}`}>
                      {profile.latencyMs ? `${profile.latencyMs}ms` : "—"}
                    </span>
                    <button
                      type="button"
                      className="btn px-2 py-1 text-[10px]"
                      disabled={busy}
                      onClick={() => void connect(profile.id)}
                    >
                      <Icon name="play" className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            {profiles.length === 0 ? <EmptyState title="No profiles yet" /> : null}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <SectionTitle
            eyebrow="network lab"
            title="Diagnostics console"
            description="Each probe opens a real connection from the control plane. Nothing is simulated except the label."
            action={
              <div className="flex flex-wrap gap-1.5">
                {KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="btn px-2 py-1 text-[11px]"
                    onClick={() => void runProbe(kind)}
                    disabled={running !== null}
                    style={selectedDiag === kind ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                  >
                    {running === kind ? <Icon name="refresh" className="h-3 w-3 spin-slow" /> : null}
                    {kind}
                  </button>
                ))}
              </div>
            }
          />
          {trace.length ? (
            <TraceTimeline stages={trace.map((stage) => ({ ...stage, status: stage.status as "ok" | "fail" | "skip" }))} />
          ) : (
            <EmptyState title="No probe executed yet" description="Pick a probe above to measure DNS, TCP, TLS, latency or your visible egress identity." />
          )}
        </Panel>

        <Panel>
          <SectionTitle eyebrow="audit" title="Recent sessions" action={<Link href="/history" className="btn px-2.5 py-1.5 text-[11px]">History</Link>} />
          <div className="space-y-2">
            {sessions.slice(0, 5).map((session) => (
              <div key={session.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm">{session.profileName}</p>
                  <Badge tone={session.state === "closed" ? "muted" : statusTone(session.state)}>{session.state}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
                  <span className="num">{relativeTime(session.startedAt)}</span>
                  <span className="num">{formatDuration(session.durationSec)}</span>
                  <span className="num">↓{formatBytes(session.rxBytes)} ↑{formatBytes(session.txBytes)}</span>
                  {session.latencyMs ? <span className="num">{session.latencyMs}ms</span> : null}
                </div>
              </div>
            ))}
            {sessions.length === 0 ? <EmptyState title="No sessions recorded" /> : null}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel>
          <SectionTitle
            eyebrow="stream"
            title="Live log tail"
            action={<Link href="/logs" className="btn px-2.5 py-1.5 text-[11px]">Log centre</Link>}
          />
          <div className="space-y-1.5">
            {logs.slice(0, 8).map((log) => (
              <div key={log.id} className="flex items-start gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--line)" }}>
                <Badge tone={log.level === "error" ? "bad" : log.level === "warn" ? "warn" : log.level === "audit" ? "info" : "muted"}>{log.level}</Badge>
                <p className="min-w-0 flex-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                  <span className="num mr-2">{new Date(log.createdAt).toISOString().slice(11, 19)}</span>
                  <span className="mr-2 opacity-70">[{log.scope}]</span>
                  {log.message}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionTitle
            eyebrow="recent probes"
            title="Diagnostic history"
            action={<Link href="/network-lab" className="btn px-2.5 py-1.5 text-[11px]">Lab</Link>}
          />
          <div className="space-y-2">
            {diagnostics.slice(0, 6).map((run) => (
              <div key={run.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ borderColor: "var(--line)" }}>
                <div className="min-w-0">
                  <p className="truncate text-xs">
                    <span className="mr-2 uppercase" style={{ color: "var(--text-faint)" }}>{run.kind}</span>
                    {run.target}
                  </p>
                  <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--text-faint)" }}>{run.summary}</p>
                </div>
                <div className="text-right">
                  <Badge tone={run.status === "ok" ? "good" : "bad"}>{run.status}</Badge>
                  <p className="num mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>{run.durationMs}ms</p>
                </div>
              </div>
            ))}
            {diagnostics.length === 0 ? <EmptyState title="No diagnostics yet" description="Probes appear here with real timings." /> : null}
          </div>
        </Panel>
      </section>

      <Panel className="text-[11px]">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="warn">honesty contract</Badge>
          <p className="flex-1" style={{ color: "var(--text-dim)" }}>{snapshot.honesty}</p>
          <div className="flex flex-wrap gap-1.5">
            <Link className="btn px-2.5 py-1.5 text-[11px]" href="/apps">Split tunnel</Link>
            <Link className="btn px-2.5 py-1.5 text-[11px]" href="/speed-test">Speed test</Link>
            <Link className="btn px-2.5 py-1.5 text-[11px]" href="/appearance">Appearance</Link>
            <Link className="btn px-2.5 py-1.5 text-[11px]" href="/apk">APK</Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
      <p className="eyebrow">{label}</p>
      <p className={`num mt-1 text-base font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone: string }) {
  const colors: Record<string, string> = { good: "#45f0b0", info: "#6cc7ff", bad: "#ff6b8b", muted: "#94a3b8" };
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span style={{ color: "var(--text-dim)" }}>{label}</span>
        <span className="num">{value}</span>
      </div>
      <div className="mt-1">
        <Meter value={value} max={Math.max(1, value * 2)} tone={tone as "accent" | "good" | "warn" | "bad"} />
      </div>
      <span className="hidden">{colors[tone]}</span>
    </div>
  );
}
