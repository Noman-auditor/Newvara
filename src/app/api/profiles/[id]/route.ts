import { deleteProfile, getProfile, patchProfile, toDraft, updateProfile } from "@/lib/store";
import { defaultDraft, validateProfile } from "@/lib/protocols";
import type { ProfileDraft, ProtocolId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getProfile(Number(id));
  if (!row) return Response.json({ ok: false, error: "Profile not found" }, { status: 404 });
  return Response.json({ ok: true, profile: row });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  const existing = await getProfile(numericId);
  if (!existing) return Response.json({ ok: false, error: "Profile not found" }, { status: 404 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const partialKeys = ["favorite", "autoConnect", "killSwitch", "blockingMode", "notes", "group"];
    const isPartial = Object.keys(body).every((key) => partialKeys.includes(key));
    if (isPartial) {
      const row = await patchProfile(numericId, body as Record<string, never>);
      return Response.json({ ok: true, profile: row });
    }

    const merged: ProfileDraft = {
      ...defaultDraft((body.protocol as ProtocolId) ?? (existing.protocol as ProtocolId)),
      ...toDraft(existing),
      ...(body as Partial<ProfileDraft>),
      serverPort: Number(body.serverPort ?? existing.serverPort),
    };
    const dryRun = Boolean(body.dryRun);
    if (dryRun) {
      return Response.json({ ok: true, validation: validateProfile(merged), draft: merged });
    }
    const { row, validation } = await updateProfile(numericId, merged);
    return Response.json({ ok: true, profile: row, validation });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await deleteProfile(Number(id));
  if (!row) return Response.json({ ok: false, error: "Profile not found" }, { status: 404 });
  return Response.json({ ok: true, deleted: row.id });
}
