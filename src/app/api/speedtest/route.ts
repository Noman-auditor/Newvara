import { getProfile, getRuntime, listProfiles, listSpeedTests, deleteSpeedTest, saveSpeedTest, toDraft } from "@/lib/store";
import { runSpeedTest, type SpeedMode } from "@/lib/speedtest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const rows = await listSpeedTests(40);
    const done = rows.filter((row) => row.status !== "fail");
    const best = done.reduce<typeof rows[number] | null>((acc, row) => (!acc || row.downloadMbps > acc.downloadMbps ? row : acc), null);
    const avgDown = done.length ? done.reduce((sum, row) => sum + row.downloadMbps, 0) / done.length : 0;
    const avgUp = done.length ? done.reduce((sum, row) => sum + row.uploadMbps, 0) / done.length : 0;
    const avgLatency = done.length ? done.reduce((sum, row) => sum + row.latencyMs, 0) / done.length : 0;
    return Response.json({
      ok: true,
      tests: rows,
      summary: {
        count: rows.length,
        bestDownloadMbps: best?.downloadMbps ?? 0,
        bestProfile: best?.profileName ?? null,
        avgDownloadMbps: Number(avgDown.toFixed(2)),
        avgUploadMbps: Number(avgUp.toFixed(2)),
        avgLatencyMs: Math.round(avgLatency),
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { profileId?: number | null; mode?: SpeedMode };
    const mode: SpeedMode = body.mode === "quick" || body.mode === "extended" ? body.mode : "standard";
    const runtimeRow = await getRuntime();
    const profile = body.profileId ? await getProfile(Number(body.profileId)) : runtimeRow.activeProfileId ? await getProfile(runtimeRow.activeProfileId) : (await listProfiles())[0];
    const draft = profile ? toDraft(profile) : null;
    const target = draft
      ? { serverAddress: draft.serverAddress, serverPort: draft.serverPort, protocol: draft.protocol, core: draft.core, transport: draft.transport, name: profile?.name }
      : { serverAddress: "1.1.1.1", serverPort: 443, protocol: "vless", core: "xray", transport: "tcp", name: "control-plane default" };

    const result = await runSpeedTest(target, mode);
    const row = await saveSpeedTest({
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? "control-plane default",
      endpoint: result.endpoint,
      mode: result.mode,
      status: result.status,
      downloadMbps: result.downloadMbps,
      uploadMbps: result.uploadMbps,
      latencyMs: result.latencyMs,
      jitterMs: result.jitterMs,
      downloadBytes: result.downloadBytes,
      uploadBytes: result.uploadBytes,
      durationMs: result.durationMs,
      samples: result.samples,
      note: result.notes.join(" "),
    });

    return Response.json({ ok: true, result, row });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });
    const row = await deleteSpeedTest(Number(id));
    return Response.json({ ok: true, row });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
