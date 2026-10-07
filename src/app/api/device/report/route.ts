import { applyDeviceReport } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Receives telemetry measured by the real core running on the device:
 * traffic totals from sing-box, the core version, handshake latency and a log tail.
 * These values replace the simulated samples on the dashboard, and the source is
 * recorded so the UI can state which numbers are device-reported.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      profileId?: number;
      state?: string;
      coreVersion?: string;
      rxBytes?: number;
      txBytes?: number;
      latencyMs?: number;
      exitAddress?: string;
      sessionStartedAt?: number;
      final?: boolean;
      deviceModel?: string;
      androidVersion?: string;
      logTail?: string[];
    };
    if (!body.state) {
      return Response.json({ ok: false, error: "state is required" }, { status: 400 });
    }
    const result = await applyDeviceReport({
      profileId: Number(body.profileId ?? 0) || null,
      state: String(body.state).slice(0, 24),
      coreVersion: body.coreVersion ? String(body.coreVersion).slice(0, 120) : null,
      rxBytes: Math.max(0, Math.min(2_000_000_000, Number(body.rxBytes ?? 0))),
      txBytes: Math.max(0, Math.min(2_000_000_000, Number(body.txBytes ?? 0))),
      latencyMs: body.latencyMs ? Math.max(0, Math.round(Number(body.latencyMs))) : null,
      exitAddress: body.exitAddress ? String(body.exitAddress).slice(0, 64) : null,
      sessionStartedAt: body.sessionStartedAt ? Number(body.sessionStartedAt) : null,
      final: Boolean(body.final),
      deviceModel: body.deviceModel ? String(body.deviceModel).slice(0, 80) : null,
      androidVersion: body.androidVersion ? String(body.androidVersion).slice(0, 24) : null,
      logTail: Array.isArray(body.logTail) ? body.logTail.slice(0, 20).map((line) => String(line).slice(0, 300)) : [],
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
