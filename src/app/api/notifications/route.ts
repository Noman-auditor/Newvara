import { clearNotifications, listNotifications, markNotifications, syncNotifications } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    if (url.searchParams.get("sync") !== "0") {
      await syncNotifications({ respectPolicy: true });
    }
    const data = await listNotifications(Number(url.searchParams.get("limit") ?? 60));
    return Response.json({ ok: true, ...data });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; read?: boolean; ids?: number[]; kind?: string };
    if (body.action === "refresh") {
      const raised = await syncNotifications({ respectPolicy: false });
      const data = await listNotifications();
      return Response.json({ ok: true, raised, ...data });
    }
    if (body.action === "mark") {
      const data = await markNotifications(body.read ?? true, body.ids);
      return Response.json({ ok: true, ...data });
    }
    if (body.action === "clear") {
      const removed = await clearNotifications(body.kind);
      const data = await listNotifications();
      return Response.json({ ok: true, removed, ...data });
    }
    return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
