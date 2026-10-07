"use client";

import { useMemo, useState } from "react";
import { Badge, EmptyState, Icon, KV, Panel, SectionTitle, Segmented } from "@/components/ui";
import { Bars, Sparkline, TraceTimeline } from "@/components/charts";
import { formatBytes, formatDuration, relativeTime } from "@/lib/format";
import type { DashboardStats } from "@/lib/store";
import type { BandwidthSample, ProbeStage } from "@/lib/types";
import type { SessionRow } from "@/db/schema";

export function HistoryView({ sessions, stats }: { sessions: SessionRow[]; stats: DashboardStats }) {
  const [selectedId, setSelectedId] = useState<number | null>(sessions[0]?.id ?? null);
  const [range, setRange] = useState<"all" | "week" | "day">("all");

  const filtered = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- range filtering must be evaluated against the current clock
    const now = Date.now();
    return sessions.filter((session) => {
      const age = now - new Date(session.startedAt).getTime();
      if (range === "week") return age <= 7 * 86_400_000;
      if (range === "day") return age <= 86_400_000;
      return true;
    });
  }, [sessions, range]);

  const selected = filtered.find((session) => session.id === selectedId) ?? filtered[0] ?? null;
  const samples: BandwidthSample[] = selected?.samples ?? [];
  const maxRx = Math.max(...samples.map((sample) => sample.rx), 1);
  const latencySeries = samples.map((sample) => sample.latency);

  return (
    <div className="space-y-4">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <SectionTitle eyebrow="volume" title="Data moved" />
          <div className="grid grid-cols-2 gap-3">
            <KV label="down" value={formatBytes(stats.totalRx)} />
            <KV label="up" value={formatBytes(stats.totalTx)} />
            <KV label="sessions" value={String(stats.sessionCount)} />
            <KV label="connected" value={formatDuration(stats.totalSeconds)} />
          </div>
          <div className="mt-3">
            <p className="eyebrow mb-2">7-day downlink</p>
            <Bars values={stats.usageTrend.map((day) => day.rx)} labels={stats.usageTrend.map((day) => day.day.slice(5))} tones={stats.usageTrend.map(() => "accent")} />
          </div>
        </Panel>
        <Panel>
          <SectionTitle eyebrow="quality" title="Latency trend" />
          <div className="h-24">
            <Sparkline values={stats.latencyTrend.map((point) => point.latency)} stroke="#22d3ee" />
          </div>
          <div className="mt-3 grid gap-1">
            <KV label="average rtt" value={stats.avgLatency ? `${stats.avgLatency}ms` : "—"} />
            <KV label="worst rtt" value={stats.worstLatency ? `${stats.worstLatency}ms` : "—"} />
            <KV label="average jitter" value={stats.avgJitter ? `${stats.avgJitter}ms` : "—"} />
          </div>
        </Panel>
        <Panel>
          <SectionTitle eyebrow="telemetry" title="Session mix" />
          <div className="space-y-2">
            {filtered.slice(0, 5).map((session) => (
              <button
                key={session.id}
                type="button"
                className="w-full rounded-xl border px-3 py-2 text-left transition hover:bg-white/5"
                style={{ borderColor: "var(--line)", background: session.id === selected?.id ? "var(--accent-soft)" : undefined }}
                onClick={() => setSelectedId(session.id)}
              >
                <p className="truncate text-xs">{session.profileName}</p>
                <p className="num mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {relativeTime(session.startedAt)} · {formatDuration(session.durationSec)} · ↓{formatBytes(session.rxBytes)}
                </p>
              </button>
            ))}
          </div>
        </Panel>
        <Panel>
          <SectionTitle eyebrow="record" title="Retention" />
          <div className="grid gap-1">
            <KV label="entries" value={String(sessions.length)} />
            <KV label="oldest" value={sessions.length ? relativeTime(sessions[sessions.length - 1].startedAt) : "—"} />
            <KV label="newest" value={sessions.length ? relativeTime(sessions[0].startedAt) : "—"} />
          </div>
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
            Sessions keep their telemetry in a bounded ring buffer, so long connections never bloat the database.
          </p>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <SectionTitle eyebrow="sessions" title="Session log" />
            <Segmented
              value={range}
              onChange={setRange}
              size="sm"
              options={[
                { value: "all", label: "All" },
                { value: "week", label: "7 days" },
                { value: "day", label: "24 h" },
              ]}
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto scroll-thin">
            <table className="data">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Profile</th>
                  <th>State</th>
                  <th>Duration</th>
                  <th>Down / Up</th>
                  <th className="text-right">RTT</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => setSelectedId(session.id)}
                    className="cursor-pointer"
                    style={session.id === selected?.id ? { background: "var(--accent-soft)" } : undefined}
                  >
                    <td className="num whitespace-nowrap text-[11px]">{relativeTime(session.startedAt)}</td>
                    <td className="text-[12px]">{session.profileName}</td>
                    <td>
                      <Badge tone={session.state === "connected" ? "good" : session.state === "closed" ? "muted" : session.state === "error" ? "bad" : "warn"}>
                        {session.state}
                      </Badge>
                    </td>
                    <td className="num">{formatDuration(session.durationSec)}</td>
                    <td className="num text-[11px]">
                      ↓{formatBytes(session.rxBytes)} ↑{formatBytes(session.txBytes)}
                    </td>
                    <td className="num text-right">{session.latencyMs ? `${session.latencyMs}ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? <div className="p-4"><EmptyState title="No sessions in this range" /></div> : null}
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="details" title={selected ? selected.profileName : "Select a session"} />
          {selected ? (
            <div className="space-y-4">
              <div className="grid gap-1">
                <KV label="session id" value={`#${selected.id}`} />
                <KV label="transport snapshot" value={selected.transportSnapshot ?? "—"} />
                <KV label="endpoint ip" value={selected.endpointIp ?? "—"} />
                <KV label="exit ip" value={selected.exitIp ?? "—"} />
                <KV label="handshake" value={selected.handshakeMs ? `${selected.handshakeMs}ms` : "—"} />
                <KV label="jitter" value={selected.jitterMs ? `${selected.jitterMs}ms` : "—"} />
                <KV label="started" value={new Date(selected.startedAt).toISOString().slice(0, 19).replace("T", " ")} />
                <KV label="ended" value={selected.endedAt ? new Date(selected.endedAt).toISOString().slice(0, 19).replace("T", " ") : "open"} />
              </div>

              {samples.length ? (
                <div>
                  <p className="eyebrow mb-2">throughput shape ({samples.length} samples)</p>
                  <div className="rounded-xl border p-2" style={{ borderColor: "var(--line)" }}>
                    <Bars values={samples.map((sample) => sample.rx)} tones={samples.map(() => (maxRx > 0 ? "good" : "accent"))} />
                  </div>
                  <p className="eyebrow mb-2 mt-3">latency drift</p>
                  <div className="h-16">
                    <Sparkline values={latencySeries} stroke="#ffc857" />
                  </div>
                </div>
              ) : null}

              {selected.stages?.length ? (
                <div>
                  <p className="eyebrow mb-2">handshake stages</p>
                  <TraceTimeline stages={(selected.stages ?? []) as ProbeStage[]} />
                </div>
              ) : null}

              {selected.note ? (
                <p className="rounded-xl border p-3 text-[11px]" style={{ borderColor: "var(--line)", color: "var(--text-dim)" }}>
                  <Icon name="alert" className="mr-2 inline h-3.5 w-3.5" />
                  {selected.note}
                </p>
              ) : null}
            </div>
          ) : (
            <EmptyState title="No session selected" description="Choose a row to inspect its telemetry." />
          )}
        </Panel>
      </section>
    </div>
  );
}
