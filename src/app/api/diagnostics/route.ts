import { listDiagnostics, runAndSaveDiagnostic } from "@/lib/store";
import type { DiagnosticKind } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS: DiagnosticKind[] = ["dns", "tcp", "tls", "http", "latency", "path", "egress"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const rows = await listDiagnostics(Number(url.searchParams.get("limit") ?? 40));
    return Response.json({ ok: true, diagnostics: rows });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { kind?: string; profileId?: number | null };
    const kind = (body.kind ?? "path") as DiagnosticKind;
    if (!KINDS.includes(kind)) {
      return Response.json({ ok: false, error: `kind must be one of ${KINDS.join(", ")}` }, { status: 400 });
    }
    const profileId = body.profileId ? Number(body.profileId) : null;
    const { payload, row } = await runAndSaveDiagnostic(kind, profileId);
    return Response.json({ ok: true, payload, row });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
