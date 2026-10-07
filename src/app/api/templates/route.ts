import { createFromTemplate, PROFILE_TEMPLATES } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    templates: PROFILE_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      tagline: template.tagline,
      difficulty: template.difficulty,
      emoji: template.emoji,
      fields: template.fields,
      protocol: template.draft.protocol,
      core: template.draft.core,
      transport: template.draft.transport,
      securityLayer: template.draft.securityLayer,
    })),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { templateId?: string; overrides?: Record<string, unknown> };
    if (!body.templateId) return Response.json({ ok: false, error: "templateId is required" }, { status: 400 });
    const created = await createFromTemplate(body.templateId, (body.overrides ?? {}) as never);
    if (!created) return Response.json({ ok: false, error: "Unknown template" }, { status: 404 });
    return Response.json({ ok: true, profile: created.row, validation: created.validation });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
