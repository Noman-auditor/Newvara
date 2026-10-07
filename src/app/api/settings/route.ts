import { getSettings, updateSettings, writeLog } from "@/lib/store";
import type { SettingsRow } from "@/db/schema";

export const dynamic = "force-dynamic";

const ALLOWED: (keyof SettingsRow)[] = [
  "operatorName",
  "theme",
  "accent",
  "dnsPrimary",
  "dnsSecondary",
  "dnsMode",
  "ipv6Mode",
  "mtuDefault",
  "killSwitchDefault",
  "autoConnect",
  "strictValidation",
  "redactSecrets",
  "latencyAlarmMs",
  "dataCapGb",
  "logLevel",
  "onboarded",
  "accentHex",
  "accent2Hex",
  "accent3Hex",
  "glassBlur",
  "glassAlpha",
  "auroraIntensity",
  "gridOpacity",
  "radiusScale",
  "density",
  "fontFamily",
  "bgPattern",
  "motionLevel",
  "presetName",
  "notifyEnabled",
  "notifyLatency",
  "notifyCert",
  "notifyValidation",
  "notifyQuota",
];

export async function GET() {
  try {
    const settingsRow = await getSettings();
    return Response.json({ ok: true, settings: settingsRow });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in body) patch[key] = body[key];
    }
    if (!Object.keys(patch).length) {
      return Response.json({ ok: false, error: "No supported settings provided" }, { status: 400 });
    }
    const settingsRow = await updateSettings(patch as Partial<SettingsRow>);
    await writeLog({
      level: "audit",
      scope: "settings",
      message: `Settings updated: ${Object.keys(patch).join(", ")}.`,
      meta: patch,
    });
    return Response.json({ ok: true, settings: settingsRow });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
