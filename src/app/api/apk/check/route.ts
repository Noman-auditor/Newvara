import { checkWorkspaceUrl } from "@/lib/android";
import { writeLog } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    if (!body.url) return Response.json({ ok: false, error: "url is required" }, { status: 400 });
    const result = await checkWorkspaceUrl(body.url);
    await writeLog({
      level: result.reachable ? "info" : "warn",
      scope: "apk",
      message: `APK workspace check: ${result.normalized} → ${result.reachable ? `reachable (${result.status}, ${result.durationMs}ms)` : "unreachable"}. ${result.warnings.length} warning(s).`,
      meta: { host: result.host, status: result.status, durationMs: result.durationMs },
    });
    return Response.json({ ok: true, check: result });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
