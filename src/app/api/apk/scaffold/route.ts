import { readScaffold } from "@/lib/android";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const files = await readScaffold();
    return Response.json({ ok: true, files });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
