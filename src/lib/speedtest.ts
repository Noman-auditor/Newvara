import { latencySweep, tcpProbe } from "@/lib/net";
import type { ProfileDraft } from "@/lib/types";

/**
 * Real throughput measurement.
 *
 * Download is measured by streaming bytes from a public speed-test endpoint and
 * counting chunks as they arrive (never buffering the whole payload). Upload is
 * measured by POSTing a generated body and timing until the server responds.
 * If the network blocks the endpoint we report the failure instead of inventing
 * a number.
 */
const DOWN_URL = "https://speed.cloudflare.com/__down";
const UP_URL = "https://speed.cloudflare.com/__up";

export type SpeedMode = "quick" | "standard" | "extended";

export const SPEED_MODES: Record<SpeedMode, { label: string; downloadBytes: number; uploadBytes: number; rounds: number; blurb: string }> = {
  quick: { label: "Quick", downloadBytes: 3_000_000, uploadBytes: 1_000_000, rounds: 2, blurb: "~5 s · small payload, good for a sanity check" },
  standard: { label: "Standard", downloadBytes: 12_000_000, uploadBytes: 4_000_000, rounds: 3, blurb: "~12 s · default balance of accuracy and time" },
  extended: { label: "Extended", downloadBytes: 30_000_000, uploadBytes: 10_000_000, rounds: 5, blurb: "~30 s · longer sample, steadier numbers" },
};

export type SpeedSample = { t: number; mbps: number; direction: "down" | "up" };

export type SpeedTestResult = {
  status: "ok" | "partial" | "fail";
  endpoint: string;
  mode: SpeedMode;
  downloadMbps: number;
  uploadMbps: number;
  downloadBytes: number;
  uploadBytes: number;
  latencyMs: number;
  jitterMs: number;
  durationMs: number;
  samples: SpeedSample[];
  stages: { stage: string; label: string; status: "ok" | "fail" | "skip"; durationMs: number; detail?: string }[];
  notes: string[];
};

async function measureDownload(bytes: number, round: number, sink: (mbps: number, bytes: number) => void): Promise<{ ok: boolean; mbps: number; bytes: number; ms: number; error?: string }> {
  const started = performance.now();
  try {
    const response = await fetch(`${DOWN_URL}?bytes=${bytes}&r=${round}-${Math.random()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok || !response.body) {
      return { ok: false, mbps: 0, bytes: 0, ms: Math.round(performance.now() - started), error: `HTTP ${response.status}` };
    }
    const reader = response.body.getReader();
    let received = 0;
    let lastMark = started;
    let lastBytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value?.byteLength ?? 0;
      const now = performance.now();
      if (now - lastMark > 180) {
        const mbps = ((received - lastBytes) * 8) / ((now - lastMark) / 1000) / 1_000_000;
        sink(Number(mbps.toFixed(2)), received);
        lastMark = now;
        lastBytes = received;
      }
    }
    const ms = performance.now() - started;
    const mbps = (received * 8) / (ms / 1000) / 1_000_000;
    return { ok: received > 0, mbps: Number(mbps.toFixed(2)), bytes: received, ms: Math.round(ms), error: received > 0 ? undefined : "stream returned no bytes" };
  } catch (error) {
    return { ok: false, mbps: 0, bytes: 0, ms: Math.round(performance.now() - started), error: error instanceof Error ? error.message : "download failed" };
  }
}

async function measureUpload(bytes: number, round: number, sink: (mbps: number, bytes: number) => void): Promise<{ ok: boolean; mbps: number; bytes: number; ms: number; error?: string }> {
  const started = performance.now();
  try {
    const chunk = new Uint8Array(Math.min(bytes, 512_000));
    const body = new Blob(Array.from({ length: Math.ceil(bytes / chunk.byteLength) }, () => chunk));
    const response = await fetch(`${UP_URL}?r=${round}-${Math.random()}`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return { ok: false, mbps: 0, bytes: 0, ms: Math.round(performance.now() - started), error: `HTTP ${response.status}` };
    }
    await response.text().catch(() => "");
    const ms = performance.now() - started;
    const sent = chunk.byteLength * Math.ceil(bytes / chunk.byteLength);
    const mbps = (sent * 8) / (ms / 1000) / 1_000_000;
    sink(Number(mbps.toFixed(2)), sent);
    return { ok: true, mbps: Number(mbps.toFixed(2)), bytes: sent, ms: Math.round(ms) };
  } catch (error) {
    return { ok: false, mbps: 0, bytes: 0, ms: Math.round(performance.now() - started), error: error instanceof Error ? error.message : "upload failed" };
  }
}

export async function runSpeedTest(
  target: Pick<ProfileDraft, "serverAddress" | "serverPort" | "protocol" | "core" | "transport"> & { name?: string },
  mode: SpeedMode = "standard",
): Promise<SpeedTestResult> {
  const plan = SPEED_MODES[mode];
  const started = Date.now();
  const samples: SpeedSample[] = [];
  const stages: SpeedTestResult["stages"] = [];
  const notes: string[] = [];

  const probe = await tcpProbe(target.serverAddress, target.serverPort, 3000);
  stages.push({
    stage: "reachability",
    label: `Endpoint ${target.serverAddress}:${target.serverPort}`,
    status: probe.ok ? "ok" : "skip",
    durationMs: probe.durationMs,
    detail: probe.ok ? `control connection accepted at ${probe.ip}` : `not reachable over TCP (${probe.error}) — throughput still measured against the public test endpoint`,
  });

  const sweep = await latencySweep(target.serverAddress, target.serverPort, 4);
  stages.push({
    stage: "latency",
    label: "Idle latency sweep",
    status: sweep.ok ? "ok" : "skip",
    durationMs: sweep.avg,
    detail: sweep.ok ? `avg ${sweep.avg}ms · jitter ${sweep.jitter}ms` : "endpoint did not answer — latency left at 0",
  });

  let downBytes = 0;
  const downMb: number[] = [];
  let downError: string | undefined;
  for (let round = 1; round <= plan.rounds; round += 1) {
    const result = await measureDownload(plan.downloadBytes, round, (mbps) => samples.push({ t: Date.now() - started, mbps, direction: "down" }));
    if (result.ok) {
      downBytes += result.bytes;
      downMb.push(result.mbps);
    } else {
      downError = result.error;
      break;
    }
  }
  const downloadMbps = downMb.length ? Number((downMb.reduce((a, b) => a + b, 0) / downMb.length).toFixed(2)) : 0;
  stages.push({
    stage: "download",
    label: `Download ${(plan.downloadBytes / 1_000_000).toFixed(1)} MB × ${plan.rounds}`,
    status: downMb.length ? "ok" : "fail",
    durationMs: Math.max(0, Date.now() - started),
    detail: downMb.length
      ? `${downloadMbps} Mbit/s average over ${(downBytes / 1_000_000).toFixed(1)} MB (${downMb.length}/${plan.rounds} rounds)`
      : `blocked: ${downError ?? "no data"}`,
  });

  let upBytes = 0;
  const upMb: number[] = [];
  let upError: string | undefined;
  for (let round = 1; round <= Math.min(plan.rounds, 3); round += 1) {
    const result = await measureUpload(plan.uploadBytes, round, (mbps) => samples.push({ t: Date.now() - started, mbps, direction: "up" }));
    if (result.ok) {
      upBytes += result.bytes;
      upMb.push(result.mbps);
    } else {
      upError = result.error;
      break;
    }
  }
  const uploadMbps = upMb.length ? Number((upMb.reduce((a, b) => a + b, 0) / upMb.length).toFixed(2)) : 0;
  stages.push({
    stage: "upload",
    label: `Upload ${(plan.uploadBytes / 1_000_000).toFixed(1)} MB`,
    status: upMb.length ? "ok" : "fail",
    durationMs: Math.max(0, Date.now() - started),
    detail: upMb.length ? `${uploadMbps} Mbit/s average` : `blocked: ${upError ?? "no data"}`,
  });

  const status: SpeedTestResult["status"] = downMb.length && upMb.length ? "ok" : downMb.length || upMb.length ? "partial" : "fail";
  notes.push("Throughput is measured between this control-plane host and the public Cloudflare speed endpoint, not between your phone and the tunnel.");
  if (status === "fail") notes.push(`Both directions were blocked from this host (${downError ?? upError ?? "unknown"}).`);
  if (status === "partial") notes.push("One direction was blocked — treat the other number as the reliable one.");
  if (!probe.ok) notes.push("The configured endpoint did not accept a TCP control connection; a UDP-only core (WireGuard/QUIC) would behave exactly like this.");

  stages.push({
    stage: "summary",
    label: "Result summary",
    status: status === "ok" ? "ok" : status === "partial" ? "skip" : "fail",
    durationMs: Date.now() - started,
    detail: `${downloadMbps} ↓ / ${uploadMbps} ↑ Mbit/s · rtt ${sweep.ok ? sweep.avg : 0}ms · jitter ${sweep.ok ? sweep.jitter : 0}ms`,
  });

  return {
    status,
    endpoint: `${target.serverAddress}:${target.serverPort}`,
    mode,
    downloadMbps,
    uploadMbps,
    downloadBytes: downBytes,
    uploadBytes: upBytes,
    latencyMs: sweep.ok ? Math.round(sweep.avg) : 0,
    jitterMs: sweep.ok ? sweep.jitter : 0,
    durationMs: Date.now() - started,
    samples,
    stages,
    notes,
  };
}
