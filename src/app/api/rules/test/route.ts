import { listRules, writeLog } from "@/lib/store";
import { evaluateRouting } from "@/lib/routing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      host?: string;
      ip?: string;
      port?: number;
      app?: string;
      defaultAction?: string;
      persist?: boolean;
    };
    const host = (body.host ?? "").trim().toLowerCase();
    if (!host) return Response.json({ ok: false, error: "host is required" }, { status: 400 });
    if (!/^[a-z0-9._:-]+$/.test(host)) {
      return Response.json(
        { ok: false, error: "host must match [a-z0-9._:-]+ (no shell metacharacters)" },
        { status: 400 },
      );
    }
    const rules = await listRules();
    const decision = evaluateRouting(host, {
      rules,
      ip: body.ip ?? null,
      port: body.port ? Number(body.port) : undefined,
      app: body.app,
      defaultAction: body.defaultAction ?? "proxy",
    });

    if (decision.matchedRule) {
      const matched = rules.find((rule) => rule.name === decision.matchedRule);
      if (matched) {
        const hitCount = (matched.hitCount ?? 0) + 1;
        if (body.persist !== false) {
          await writeLog({
            level: "debug",
            scope: "routing",
            message: `Decision simulator: ${host} → ${decision.decision} via "${matched.name}".`,
          });
        }
      }
    } else if (body.persist !== false) {
      await writeLog({ level: "debug", scope: "routing", message: `Decision simulator: ${host} → ${decision.decision} (default policy).` });
    }

    return Response.json({
      ok: true,
      decision,
      activeRuleCount: rules.filter((rule) => rule.enabled).length,
      evaluatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
