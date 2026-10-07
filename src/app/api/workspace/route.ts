import { exportWorkspace, importWorkspace, type WorkspaceBackup } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const includeSecrets = url.searchParams.get("secrets") === "1";
    const backup = await exportWorkspace({ includeSecrets, limit: Number(url.searchParams.get("limit") ?? 100) });
    const download = url.searchParams.get("download") === "1";
    return Response.json(
      { ok: true, backup },
      download
        ? {
            headers: {
              "content-disposition": `attachment; filename="nora-workspace-${new Date().toISOString().slice(0, 19)}.json"`,
            },
          }
        : undefined,
    );
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { payload?: Partial<WorkspaceBackup>; mode?: "merge" | "replace" };
    if (!body.payload) return Response.json({ ok: false, error: "payload is required" }, { status: 400 });
    if (body.mode === "replace" && !body.payload.profiles) {
      return Response.json({ ok: false, error: "replace mode needs a profiles array" }, { status: 400 });
    }
    const report = await importWorkspace(body.payload, { mode: body.mode ?? "merge" });
    return Response.json({ ok: report.ok, report });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
