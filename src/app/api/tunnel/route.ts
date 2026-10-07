import { connectTunnel, disconnectTunnel } from "@/lib/store";
import { getTunnelSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tick = url.searchParams.get("tick") === "1";
  try {
    const snapshot = await getTunnelSnapshot({ tick });
    return Response.json({ ok: true, snapshot });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; profileId?: number; reason?: string };
    if (body.action === "connect") {
      const profileId = Number(body.profileId);
      if (!Number.isFinite(profileId)) {
        return Response.json({ ok: false, error: "profileId is required" }, { status: 400 });
      }
      const result = await connectTunnel(profileId);
      const snapshot = await getTunnelSnapshot();
      return Response.json({ ok: result.ok, result, snapshot });
    }
    if (body.action === "disconnect") {
      const result = await disconnectTunnel(body.reason);
      const snapshot = await getTunnelSnapshot();
      return Response.json({ ok: result.ok, result, snapshot });
    }
    return Response.json({ ok: false, error: `Unknown action "${body.action ?? ""}"` }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
