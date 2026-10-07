"use client";

import { useRouter } from "next/navigation";
import { Fragment, useCallback, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, EmptyState, Field, Icon, KV, Panel, SectionTitle, Segmented } from "@/components/ui";
import { Gauge, TraceTimeline } from "@/components/charts";
import { relativeTime } from "@/lib/format";
import type { DiagnosticRow, ProfileRow } from "@/db/schema";
import type { ProbeStage } from "@/lib/types";

const KINDS: { value: string; label: string; blurb: string }[] = [
  { value: "dns", label: "DNS", blurb: "Resolve A/AAAA/CNAME/TXT through the profile resolvers and time every query." },
  { value: "tcp", label: "TCP", blurb: "Raw connect() to host:port — measures the real control-plane RTT." },
  { value: "tls", label: "TLS", blurb: "Handshake, negotiated version/cipher/ALPN and certificate expiry." },
  { value: "http", label: "HTTP", blurb: "Layer-7 probe with redirect handling to fingerprint the fronting service." },
  { value: "latency", label: "Latency", blurb: "Six-sample sweep producing min/avg/max, jitter and probe loss." },
  { value: "path", label: "Full path", blurb: "DNS → TCP → TLS → HTTP → latency in one ordered pipeline." },
  { value: "egress", label: "Egress ID", blurb: "Shows the address a remote peer sees for this control plane." },
];

export function LabView({ profiles, diagnostics, activeProfileId }: { profiles: ProfileRow[]; diagnostics: DiagnosticRow[]; activeProfileId: number | null }) {
  const router = useRouter();
  const { push } = useToast();
  const [kind, setKind] = useState("path");
  const [profileId, setProfileId] = useState<string>(activeProfileId ? String(activeProfileId) : profiles[0] ? String(profiles[0].id) : "");
  const [running, setRunning] = useState<string | null>(null);
  const [stages, setStages] = useState<ProbeStage[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number | string>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [view, setView] = useState<"single" | "history">("single");

  const selected = useMemo(() => profiles.find((profile) => String(profile.id) === profileId) ?? null, [profiles, profileId]);

  const run = useCallback(
    async (nextKind: string) => {
      setRunning(nextKind);
      setKind(nextKind);
      setView("single");
      try {
        const response = await fetch("/api/diagnostics", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: nextKind, profileId: profileId ? Number(profileId) : null }),
        });
        const json = (await response.json()) as {
          ok: boolean;
          payload?: { status: string; target: string; stages: ProbeStage[]; notes: string[]; metrics: Record<string, number | string> };
          error?: string;
        };
        if (json.ok && json.payload) {
          setStages(json.payload.stages);
          setNotes(json.payload.notes);
          setMetrics(json.payload.metrics);
          const total = json.payload.stages.reduce((sum, stage) => sum + stage.durationMs, 0);
          push({
            title: `${nextKind.toUpperCase()} → ${json.payload.status}`,
            detail: `${json.payload.target} · ${total}ms · ${json.payload.stages.length} stages`,
            tone: json.payload.status === "ok" ? "good" : "warn",
          });
          router.refresh();
        } else {
          push({ title: "Probe failed", detail: json.error ?? "unknown", tone: "bad" });
        }
      } catch (error) {
        push({ title: "Probe failed", detail: (error as Error).message, tone: "bad" });
      } finally {
        setRunning(null);
      }
    },
    [profileId, push, router],
  );

  const latencyAvg = Number(metrics.latencyAvg ?? metrics.tcpMs ?? 0);

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle
          eyebrow="target"
          title="Probe target"
          description="Probes run from this control plane, not from your device. Every measurement is a real connection attempt."
          action={
            <Segmented
              value={view}
              onChange={setView}
              size="sm"
              options={[
                { value: "single", label: "Console" },
                { value: "history", label: `History ${diagnostics.length}` },
              ]}
            />
          }
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Field label="Profile / target">
            <select className="select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
              <option value="">Control-plane default (1.1.1.1)</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} — {profile.serverAddress}:{profile.serverPort}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-4 gap-2">
            <KV label="core" value={selected?.core ?? "xray"} />
            <KV label="transport" value={selected?.transport ?? "tcp"} />
            <KV label="security" value={selected?.securityLayer ?? "tls"} />
            <KV label="dns" value={selected?.dnsPrimary ?? "1.1.1.1"} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {KINDS.map((item) => (
            <button
              key={item.value}
              type="button"
              className="btn px-2.5 py-1.5 text-[11px]"
              disabled={running !== null}
              onClick={() => void run(item.value)}
              style={kind === item.value ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
            >
              {running === item.value ? <Icon name="refresh" className="h-3.5 w-3.5 spin-slow" /> : <Icon name="bolt" className="h-3.5 w-3.5" />}
              {item.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
          {KINDS.find((item) => item.value === kind)?.blurb}
        </p>
      </Panel>

      {view === "single" ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Panel>
            <SectionTitle eyebrow="result" title="Stage breakdown" />
            {stages.length ? <TraceTimeline stages={stages} /> : <EmptyState title="No probe executed" description="Choose a probe type above to measure the endpoint." />}
            {notes.length ? (
              <ul className="mt-3 space-y-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                {notes.map((note) => (
                  <li key={note}>· {note}</li>
                ))}
              </ul>
            ) : null}
          </Panel>
          <div className="space-y-4">
            <Panel>
              <SectionTitle eyebrow="metrics" title="Measured values" />
              {latencyAvg ? (
                <div className="flex items-center justify-around">
                  <Gauge value={latencyAvg} max={400} unit="ms" label="rtt" />
                  <Gauge value={Number(metrics.jitterMs ?? 0)} max={80} unit="ms" label="jitter" />
                </div>
              ) : null}
              <div className="mt-2 grid gap-1">
                {Object.entries(metrics).map(([key, value]) => (
                  <KV key={key} label={key} value={String(value)} />
                ))}
                {Object.keys(metrics).length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                    Metrics appear after the first probe.
                  </p>
                ) : null}
              </div>
            </Panel>
            <Panel>
              <SectionTitle eyebrow="what this proves" title="Honest scope" />
              <ul className="space-y-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
                <li>· A successful TCP stage means the endpoint accepted a control connection from this host.</li>
                <li>· A failed stage on a UDP-only endpoint (WireGuard, QUIC) is expected — the tool says so instead of faking success.</li>
                <li>· Egress identity is the address of this control plane, not a tunnel exit node.</li>
              </ul>
            </Panel>
          </div>
        </section>
      ) : (
        <Panel padded={false}>
          <div className="overflow-x-auto scroll-thin">
            <table className="data min-w-[760px]">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>When</th>
                  <th className="text-right">Stages</th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.map((row) => (
                  <Fragment key={row.id}>
                    <tr>
                      <td className="uppercase">{row.kind}</td>
                      <td className="num text-[11px]">{row.target}</td>
                      <td>
                        <Badge tone={row.status === "ok" ? "good" : "bad"}>{row.status}</Badge>
                      </td>
                      <td className="num">{row.durationMs}ms</td>
                      <td className="num text-[11px]" style={{ color: "var(--text-faint)" }}>{relativeTime(row.createdAt)}</td>
                      <td className="text-right">
                        <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                          {expanded === row.id ? "Hide" : "Show"}
                        </button>
                      </td>
                    </tr>
                    {expanded === row.id ? (
                      <tr>
                        <td colSpan={6}>
                          <TraceTimeline stages={row.stages ?? []} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {diagnostics.length === 0 ? <div className="p-4"><EmptyState title="No diagnostic history" /></div> : null}
          </div>
        </Panel>
      )}
    </div>
  );
}
