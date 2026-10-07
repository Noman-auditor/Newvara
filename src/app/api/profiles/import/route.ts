import { importProfiles } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { input?: string; group?: string; commit?: boolean };
    if (!body.input || !body.input.trim()) {
      return Response.json({ ok: false, error: "Paste at least one share link or config block." }, { status: 400 });
    }
    const results = await importProfiles(body.input, { group: body.group ?? "Imported", commit: Boolean(body.commit) });
    const accepted = results.filter((item) => item.ok).length;
    return Response.json({ ok: true, results, accepted, rejected: results.length - accepted });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
