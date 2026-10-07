import { createProfile, listProfiles, profileGroups } from "@/lib/store";
import { defaultDraft, validateProfile } from "@/lib/protocols";
import type { ProfileDraft, ProtocolId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const rows = await listProfiles({
      q: url.searchParams.get("q") ?? undefined,
      group: url.searchParams.get("group") ?? undefined,
      favorites: url.searchParams.get("favorites") === "1",
    });
    return Response.json({ ok: true, profiles: rows, groups: await profileGroups() });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ProfileDraft> & { protocol?: string };
    const base = defaultDraft((body.protocol as ProtocolId) ?? "vless");
    const draft: ProfileDraft = { ...base, ...body, name: (body.name ?? "").trim(), serverPort: Number(body.serverPort ?? base.serverPort) };
    const preview = validateProfile(draft);
    if (body && (body as { dryRun?: boolean }).dryRun) {
      return Response.json({ ok: true, validation: preview, draft });
    }
    const { row, validation } = await createProfile(draft);
    return Response.json({ ok: true, profile: row, validation });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
