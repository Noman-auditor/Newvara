import { getSettings, listProfiles, listRules } from "@/lib/store";
import { DEVICE_CORE } from "@/lib/device";

export const dynamic = "force-dynamic";

/** Inventory consumed by the Android client, including the per-app split-tunnel mode. */
export async function GET() {
  try {
    const [profiles, rules, settings] = await Promise.all([listProfiles(), listRules(), getSettings()]);
    const processRules = rules.filter((rule) => rule.ruleType === "process" && rule.enabled);
    const allowlist = processRules.filter((rule) => rule.action === "proxy").map((rule) => rule.value);
    const blocklist = processRules.filter((rule) => rule.action === "direct").map((rule) => rule.value);

    return Response.json({
      ok: true,
      coreVersion: DEVICE_CORE,
      generatedAt: new Date().toISOString(),
      workspace: {
        strictValidation: settings.strictValidation,
        ipv6Mode: settings.ipv6Mode,
        dnsMode: settings.dnsMode,
        latencyAlarmMs: settings.latencyAlarmMs,
        splitTunnelMode: allowlist.length ? "allowlist" : blocklist.length ? "blocklist" : "full",
        allowlist,
        blocklist,
      },
      profiles: profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        group: profile.group,
        protocol: profile.protocol,
        core: profile.core,
        transport: profile.transport,
        securityLayer: profile.securityLayer,
        serverAddress: profile.serverAddress,
        serverPort: profile.serverPort,
        blockingMode: profile.blockingMode,
        killSwitch: profile.killSwitch,
        dnsPrimary: profile.dnsPrimary,
        validationStatus: profile.validationStatus,
        validationScore: profile.validationScore,
        validationFindings: (profile.validationFindings ?? []).map((finding) => ({
          code: finding.code,
          severity: finding.severity,
          message: finding.message,
        })),
        latencyMs: profile.latencyMs,
        lastProbedAt: profile.lastProbedAt,
      })),
    });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
