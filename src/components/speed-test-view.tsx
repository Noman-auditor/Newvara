"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { Badge, Dot, EmptyState, Field, Icon, KV, Panel, SectionTitle, Segmented } from "@/components/ui";
import { Bars, Donut, Sparkline, TraceTimeline } from "@/components/charts";
import { formatBytes, formatDuration, relativeTime } from "@/lib/format";
import { SPEED_MODES, type SpeedMode } from "@/lib/speedtest";
import type { ProbeStage } from "@/lib/types";
import type { ProfileRow, SpeedTestRow } from "@/db/schema";

type Summary = {
  count: number;
  bestDownloadMbps: number;
  bestProfile: string | null;
  avgDownloadMbps: number;
  avgUploadMbps: number;
  avgLatencyMs: number;
};

export function SpeedTestView({
  profiles,
  tests,
  summary,
  activeProfileId,
}: {
  profiles: ProfileRow[];
  tests: SpeedTestRow[];
  summary: Summary;
  activeProfileId: number | null;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [profileId, setProfileId] = useState<string>(
    activeProfileId ? String(activeProfileId) : profiles[0] ? String(profiles[0].id) : "",
  );
  const [mode, setMode] = useState<SpeedMode>("standard");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [live, setLive] = useState<{ t: number; mbps: number; direction: string }[]>([]);
  const [result, setResult] = useState<
    | {
        status: string;
        downloadMbps: number;
        uploadMbps: number;
        latencyMs: number;
        jitterMs: number;
        durationMs: number;
        downloadBytes: number;
        uploadBytes: number;
        endpoint: string;
        mode: string;
        stages: ProbeStage[];
        notes: string[];
      }
    | null
  >(null);

  const selectedProfile = useMemo(() => profiles.find((profile) => String(profile.id) === profileId) ?? null, [profiles, profileId]);

  const run = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setLive([]);
    setProgress(6);
    const ticker = setInterval(() => setProgress((value) => Math.min(94, value + 1.6)), 320);
    try {
      const response = await fetch("/api/speedtest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId: profileId ? Number(profileId) : null, mode }),
      });
      const json = (await response.json()) as {
        ok: boolean;
        result?: {
          status: string;
          downloadMbps: number;
          uploadMbps: number;
          latencyMs: number;
          jitterMs: number;
          durationMs: number;
          downloadBytes: number;
          uploadBytes: number;
          endpoint: string;
          mode: string;
          stages: ProbeStage[];
          notes: string[];
          samples: { t: number; mbps: number; direction: string }[];
        };
        error?: string;
      };
      if (json.ok && json.result) {
        setResult(json.result);
        setLive(json.result.samples ?? []);
        push({
          title: `${json.result.downloadMbps} ↓ / ${json.result.uploadMbps} ↑ Mbit/s`,
          detail: `${json.result.endpoint} · ${json.result.status} in ${json.result.durationMs}ms`,
          tone: json.result.status === "ok" ? "good" : json.result.status === "partial" ? "warn" : "bad",
        });
        router.refresh();
      } else {
        push({ title: "Speed test failed", detail: json.error ?? "unknown error", tone: "bad" });
      }
    } catch (error) {
      push({ title: "Speed test failed", detail: (error as Error).message, tone: "bad" });
    } finally {
      clearInterval(ticker);
      setProgress(100);
      setRunning(false);
      setTimeout(() => setProgress(0), 700);
    }
  }, [profileId, mode, push, router]);

  const removeTest = useCallback(
    async (id: number) => {
      await fetch(`/api/speedtest?id=${id}`, { method: "DELETE" });
      push({ title: "Result deleted", tone: "info" });
      router.refresh();
    },
    [push, router],
  );

  const maxDown = Math.max(...tests.map((test) => test.downloadMbps), 1);
  const trend = tests.filter((test) => test.status !== "fail").slice(0, 12).reverse();

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel strong className="scan relative overflow-hidden">
          <SectionTitle
            eyebrow="throughput"
            title="Real measurement, real bytes"
            description="Download is streamed and counted chunk-by-chunk, upload is timed against the public speed endpoint. If your network blocks the endpoint you get an honest failure, never a made-up number."
          />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Target profile">
              <select className="select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
                <option value="">Control-plane default (1.1.1.1)</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} — {profile.serverAddress}:{profile.serverPort}
                  </option>
                ))}
              </select>
            </Field>
            <div>
              <span className="label">Sample size</span>
              <Segmented
                value={mode}
                onChange={setMode}
                size="sm"
                options={(Object.keys(SPEED_MODES) as SpeedMode[]).map((key) => ({ value: key, label: SPEED_MODES[key].label }))}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
            {SPEED_MODES[mode].blurb} · {SPEED_MODES[mode].rounds} rounds
            {selectedProfile ? ` · endpoint ${selectedProfile.serverAddress}:${selectedProfile.serverPort}` : ""}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={running}>
              <Icon name={running ? "refresh" : "bolt"} className={`h-3.5 w-3.5 ${running ? "spin-slow" : ""}`} />
              {running ? "Measuring…" : "Start speed test"}
            </button>
            <span className="num chip">best ever {summary.bestDownloadMbps} Mbit/s{summary.bestProfile ? ` · ${summary.bestProfile}` : ""}</span>
            <span className="num chip">avg {summary.avgDownloadMbps} ↓ / {summary.avgUploadMbps} ↑</span>
          </div>

          {progress > 0 ? (
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(148,163,184,0.18)" }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }} />
              </div>
              <p className="num mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
                {running ? `streaming ${SPEED_MODES[mode].label.toLowerCase()} sample…` : "done"}
              </p>
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
              <p className="eyebrow">download</p>
              <p className="num mt-1 text-xl font-semibold tone-good">{result ? `${result.downloadMbps}` : "—"}</p>
              <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>Mbit/s</p>
            </div>
            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
              <p className="eyebrow">upload</p>
              <p className="num mt-1 text-xl font-semibold">{result ? `${result.uploadMbps}` : "—"}</p>
              <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>Mbit/s</p>
            </div>
            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
              <p className="eyebrow">rtt</p>
              <p className="num mt-1 text-xl font-semibold">{result ? `${result.latencyMs}` : "—"}</p>
              <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>ms · jitter {result?.jitterMs ?? 0}ms</p>
            </div>
            <div className="rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
              <p className="eyebrow">moved</p>
              <p className="num mt-1 text-xl font-semibold">{result ? formatBytes(result.downloadBytes + result.uploadBytes) : "—"}</p>
              <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>in {result ? formatDuration(result.durationMs / 1000) : "—"}</p>
            </div>
          </div>

          {live.length ? (
            <div className="mt-4">
              <p className="eyebrow mb-2">live instantaneous throughput</p>
              <div className="h-28 rounded-xl border p-1" style={{ borderColor: "var(--line)" }}>
                <Sparkline values={live.map((sample) => sample.mbps)} stroke="var(--accent)" />
              </div>
              <div className="mt-2">
                <Bars
                  values={live.map((sample) => sample.mbps)}
                  tones={live.map((sample) => (sample.direction === "up" ? "info" : "good"))}
                />
              </div>
            </div>
          ) : null}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <SectionTitle eyebrow="stage trace" title="What was measured" />
            {result?.stages?.length ? <TraceTimeline stages={result.stages} /> : <EmptyState title="No test run yet" description="Start a test to see each stage with real timings." />}
            {result?.notes?.length ? (
              <ul className="mt-3 space-y-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                {result.notes.map((note) => (
                  <li key={note}>· {note}</li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="aggregate" title="All-time summary" />
            <div className="flex items-center justify-between gap-4">
              <Donut
                value={Math.min(100, (summary.avgDownloadMbps / Math.max(summary.bestDownloadMbps, 1)) * 100)}
                label={`${summary.avgDownloadMbps}`}
                sublabel="avg Mbit/s"
              />
              <div className="flex-1 grid gap-1">
                <KV label="tests run" value={String(summary.count)} />
                <KV label="best" value={`${summary.bestDownloadMbps} Mbit/s`} tone="tone-good" />
                <KV label="avg upload" value={`${summary.avgUploadMbps} Mbit/s`} />
                <KV label="avg rtt" value={`${summary.avgLatencyMs}ms`} />
              </div>
            </div>
            <div className="mt-3">
              <p className="eyebrow mb-2">download trend</p>
              <div className="h-20">
                <Sparkline values={trend.length ? trend.map((test) => test.downloadMbps) : [0, 0]} stroke="#22d3ee" max={maxDown} />
              </div>
            </div>
          </Panel>
        </div>
      </section>

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <SectionTitle eyebrow="history" title="Stored results" action={undefined} />
          <div className="flex flex-wrap gap-2">
            <a className="btn" href="/api/speedtest">
              <Icon name="download" className="h-3.5 w-3.5" />
              JSON
            </a>
          </div>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="data min-w-[820px]">
            <thead>
              <tr>
                <th>When</th>
                <th>Profile</th>
                <th>Mode</th>
                <th>Down</th>
                <th>Up</th>
                <th>RTT</th>
                <th>Moved</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id}>
                  <td className="num whitespace-nowrap text-[11px]" style={{ color: "var(--text-faint)" }}>{relativeTime(test.createdAt)}</td>
                  <td className="text-[12px]">
                    <span className="flex items-center gap-2">
                      <Dot tone={test.status === "ok" ? "good" : test.status === "partial" ? "warn" : "bad"} />
                      {test.profileName}
                    </span>
                    <span className="num block text-[10px]" style={{ color: "var(--text-faint)" }}>{test.endpoint}</span>
                  </td>
                  <td><Badge tone="muted">{test.mode}</Badge></td>
                  <td className="num tone-good">{test.downloadMbps}</td>
                  <td className="num">{test.uploadMbps}</td>
                  <td className="num">{test.latencyMs}ms</td>
                  <td className="num text-[11px]">{formatBytes(test.downloadBytes + test.uploadBytes)}</td>
                  <td>
                    <Badge tone={test.status === "ok" ? "good" : test.status === "partial" ? "warn" : "bad"}>{test.status}</Badge>
                  </td>
                  <td className="text-right">
                    <button type="button" className="btn btn-danger px-2 py-1 text-[11px]" onClick={() => void removeTest(test.id)}>
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tests.length === 0 ? <div className="p-4"><EmptyState title="No stored results" description="Every run is saved here with its real numbers." /></div> : null}
        </div>
      </Panel>
    </div>
  );
}
