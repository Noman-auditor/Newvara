import QRCode from "qrcode";

export const dynamic = "force-dynamic";

/** Renders a QR code for a workspace URL so a phone can open it instantly. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return Response.json({ ok: false, error: "url parameter is required" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ ok: false, error: "url must be an absolute http(s) URL" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return Response.json({ ok: false, error: "only http(s) URLs can be encoded" }, { status: 400 });
  }

  try {
    const png = await QRCode.toBuffer(parsed.toString(), {
      type: "png",
      width: 512,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0b0e1cff", light: "#ffffffff" },
    });
    return new Response(new Uint8Array(png), {
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
