import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSeed, getSeedState } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Control-plane self check: database reachability, seed state and row counts. */
export async function GET() {
  try {
    await ensureSeed();
    const result = await db.execute<{
      profiles: number;
      sessions: number;
      rules: number;
      logs: number;
      diagnostics: number;
      settings: number;
    }>(sql`select
      (select count(*) from nora_profiles)::int as profiles,
      (select count(*) from nora_sessions)::int as sessions,
      (select count(*) from nora_routing_rules)::int as rules,
      (select count(*) from nora_logs)::int as logs,
      (select count(*) from nora_diagnostics)::int as diagnostics,
      (select count(*) from nora_settings)::int as settings`);
    const row = (result as unknown as { rows: Record<string, number>[] }).rows?.[0] ?? {};
    return Response.json({
      ok: true,
      seed: getSeedState(),
      counts: row,
      runtime: { node: process.version, pid: process.pid, uptimeSec: Math.round(process.uptime()) },
    });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message, seed: getSeedState() }, { status: 500 });
  }
}
