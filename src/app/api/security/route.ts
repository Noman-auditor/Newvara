import { getSecurityPosture, writeLog } from "@/lib/store";
import { redact } from "@/lib/protocols";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const posture = await getSecurityPosture();
    return Response.json({ ok: true, posture });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; text?: string };
    if (body.action === "redact") {
      const text = (body.text ?? "").slice(0, 8000);
      const result = redact(text);
      await writeLog({
        level: "audit",
        scope: "security",
        message: `Redaction lab executed on ${text.length} characters — ${result.count} match(es): ${result.kinds.join(", ") || "none"}.`,
      });
      return Response.json({ ok: true, ...result });
    }
    if (body.action === "audit-config") {
      const posture = await getSecurityPosture();
      await writeLog({
        level: "audit",
        scope: "security",
        message: `Security posture re-scored: ${posture.score}/100 (grade ${posture.grade}). ${posture.checks.filter((c) => c.status !== "pass").length} open finding(s).`,
      });
      return Response.json({ ok: true, posture });
    }
    return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
