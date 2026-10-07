import { applyPreset, createRule, deleteRule, listRules, resetRules, updateRule } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rules = await listRules();
    return Response.json({ ok: true, rules });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      presetId?: string;
      order?: number[];
      name?: string;
      ruleType?: string;
      value?: string;
      action_value?: string;
      rule_action?: string;
      priority?: number;
      enabled?: boolean;
    };

    if (body.action === "reset") {
      const rules = await resetRules();
      return Response.json({ ok: true, rules });
    }
    if (body.action === "preset" && body.presetId) {
      const rules = await applyPreset(body.presetId);
      return Response.json({ ok: true, rules });
    }
    if (body.action === "reorder" && Array.isArray(body.order)) {
      await Promise.all(body.order.map((id, index) => updateRule(id, { priority: (index + 1) * 5 })));
      const rules = await listRules();
      return Response.json({ ok: true, rules });
    }

    if (!body.name || !body.ruleType || !body.value) {
      return Response.json({ ok: false, error: "name, ruleType and value are required" }, { status: 400 });
    }
    const rule = await createRule({
      name: body.name,
      ruleType: body.ruleType,
      value: body.value,
      action: body.rule_action ?? "proxy",
      priority: Number(body.priority ?? 100),
      enabled: body.enabled ?? true,
      category: "custom",
    });
    return Response.json({ ok: true, rule });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: number } & Record<string, unknown>;
    if (!body.id) return Response.json({ ok: false, error: "id is required" }, { status: 400 });
    const { id, ...patch } = body;
    const rule = await updateRule(Number(id), patch as Record<string, never>);
    return Response.json({ ok: true, rule });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ ok: false, error: "id is required" }, { status: 400 });
    const rule = await deleteRule(Number(id));
    return Response.json({ ok: true, rule });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
