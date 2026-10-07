import { clearLogs, listLogs, logScopes, writeLog } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const rows = await listLogs({
      level: url.searchParams.get("level") ?? undefined,
      scope: url.searchParams.get("scope") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 150),
    });
    return Response.json({ ok: true, logs: rows, scopes: await logScopes() });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "all";
    const removed = await clearLogs(scope);
    await writeLog({ level: "warn", scope: "audit", message: `Log buffer purged (${removed} entries, scope=${scope}).` });
    return Response.json({ ok: true, removed });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: string; level?: string; scope?: string };
    if (!body.message) return Response.json({ ok: false, error: "message required" }, { status: 400 });
    await writeLog({
      level: (body.level as "info") ?? "info",
      scope: body.scope ?? "operator",
      message: body.message,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
