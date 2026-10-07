import { buildDeviceEnvelope } from "@/lib/device";
import { getProfile, getSettings, listRules, toDraft, writeLog } from "@/lib/store";
import { validateProfile } from "@/lib/protocols";

export const dynamic = "force-dynamic";

/**
 * Returns the exact configuration the Android client feeds to the bundled sing-box core.
 * The document is compiled from a stored profile plus the workspace routing table, so the
 * phone never invents its own rules.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));

  try {
    const profile = Number.isFinite(id) && id > 0 ? await getProfile(id) : null;
    if (!profile) {
      return Response.json({ ok: false, error: "Unknown profile id. Pass ?id=<profileId>." }, { status: 404 });
    }
    const [rules, settings] = await Promise.all([listRules(), getSettings()]);
    const validation = validateProfile(toDraft(profile));

    const envelope = buildDeviceEnvelope({
      profile,
      rules,
      settings,
      validation: {
        status: validation.status,
        score: validation.score,
        findings: validation.findings.map((finding) => ({
          code: finding.code,
          severity: finding.severity,
          message: finding.message,
        })),
      },
    });

    if (!envelope.connectable && settings.strictValidation) {
      await writeLog({
        level: "warn",
        scope: "device",
        message: `Device config refused for "${profile.name}": ${envelope.blockedReason ?? "blocked by validation"}.`,
        meta: { profileId: profile.id, findings: validation.findings.map((finding) => finding.code) },
      });
      return Response.json(
        { ok: false, error: envelope.blockedReason ?? "Profile blocked by workspace policy.", envelope },
        { status: 409 },
      );
    }

    await writeLog({
      level: "audit",
      scope: "device",
      message: `Device config issued for "${profile.name}" (${envelope.tun.mode} split, ${envelope.tun.includePackages.length} include / ${envelope.tun.excludePackages.length} exclude).`,
      meta: { profileId: profile.id, core: envelope.coreVersion },
    });

    return Response.json(envelope, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
