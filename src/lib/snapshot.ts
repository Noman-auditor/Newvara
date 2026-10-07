import { getProfile, getRuntime, getSettings, listRules, tickRuntime } from "@/lib/store";
import type { BandwidthSample } from "@/lib/types";

export type TunnelSnapshot = {
  state: string;
  stage: string;
  latencyMs: number | null;
  jitterMs: number | null;
  rxBytes: number;
  txBytes: number;
  packetsIn: number;
  packetsOut: number;
  drops: number;
  uptimeSec: number;
  connectedAt: string | null;
  endpointIp: string | null;
  controlEgressIp: string | null;
  samples: BandwidthSample[];
  sessionId: number | null;
  activeProfile: {
    id: number;
    name: string;
    group: string;
    protocol: string;
    core: string;
    transport: string;
    securityLayer: string;
    serverAddress: string;
    serverPort: number;
    blockingMode: string;
    killSwitch: boolean;
    validationStatus: string;
    validationScore: number;
    dnsPrimary: string | null;
  } | null;
  rules: { total: number; active: number; proxy: number; direct: number; block: number };
  settings: {
    theme: string;
    accent: string;
    dnsPrimary: string;
    dnsSecondary: string;
    dnsMode: string;
    ipv6Mode: string;
    strictValidation: boolean;
    redactSecrets: boolean;
    latencyAlarmMs: number;
    operatorName: string;
    dataCapGb: number;
    autoConnect: boolean;
  };
  honesty: string;
  telemetry: { source: string; deviceReporting: boolean; deviceModel: string | null; coreVersion: string | null; lastReportAt: string | null };
};

export async function getTunnelSnapshot(options: { tick?: boolean } = {}): Promise<TunnelSnapshot> {
  if (options.tick) {
    await tickRuntime();
  }
  const [runtimeRow, config] = await Promise.all([getRuntime(), getSettings()]);
  const [activeProfile, ruleRows] = await Promise.all([
    runtimeRow.activeProfileId ? getProfile(runtimeRow.activeProfileId) : Promise.resolve(null),
    listRules(),
  ]);

  const telemetrySource = runtimeRow.telemetrySource ?? "none";
  const deviceReporting =
    telemetrySource === "device" && runtimeRow.lastReportAt
      ? Date.now() - new Date(runtimeRow.lastReportAt).getTime() < 60_000
      : false;

  const uptimeSec = runtimeRow.connectedAt
    ? Math.max(0, Math.round((Date.now() - new Date(runtimeRow.connectedAt).getTime()) / 1000))
    : 0;

  return {
    state: runtimeRow.state,
    stage: runtimeRow.stage,
    latencyMs: runtimeRow.latencyMs,
    jitterMs: runtimeRow.jitterMs,
    rxBytes: runtimeRow.rxBytes,
    txBytes: runtimeRow.txBytes,
    packetsIn: runtimeRow.packetsIn,
    packetsOut: runtimeRow.packetsOut,
    drops: runtimeRow.drops,
    uptimeSec,
    connectedAt: runtimeRow.connectedAt ? new Date(runtimeRow.connectedAt).toISOString() : null,
    endpointIp: runtimeRow.endpointIp,
    controlEgressIp: runtimeRow.exitIp,
    samples: runtimeRow.samples ?? [],
    sessionId: runtimeRow.activeSessionId,
    activeProfile: activeProfile
      ? {
          id: activeProfile.id,
          name: activeProfile.name,
          group: activeProfile.group,
          protocol: activeProfile.protocol,
          core: activeProfile.core,
          transport: activeProfile.transport,
          securityLayer: activeProfile.securityLayer,
          serverAddress: activeProfile.serverAddress,
          serverPort: activeProfile.serverPort,
          blockingMode: activeProfile.blockingMode,
          killSwitch: activeProfile.killSwitch,
          validationStatus: activeProfile.validationStatus,
          validationScore: activeProfile.validationScore,
          dnsPrimary: activeProfile.dnsPrimary,
        }
      : null,
    rules: {
      total: ruleRows.length,
      active: ruleRows.filter((rule) => rule.enabled).length,
      proxy: ruleRows.filter((rule) => rule.enabled && rule.action === "proxy").length,
      direct: ruleRows.filter((rule) => rule.enabled && rule.action === "direct").length,
      block: ruleRows.filter((rule) => rule.enabled && rule.action === "block").length,
    },
    settings: {
      theme: config.theme,
      accent: config.accent,
      dnsPrimary: config.dnsPrimary,
      dnsSecondary: config.dnsSecondary,
      dnsMode: config.dnsMode,
      ipv6Mode: config.ipv6Mode,
      strictValidation: config.strictValidation,
      redactSecrets: config.redactSecrets,
      latencyAlarmMs: config.latencyAlarmMs,
      operatorName: config.operatorName,
      dataCapGb: config.dataCapGb,
      autoConnect: config.autoConnect,
    },
    telemetry: {
      source: deviceReporting ? "device" : telemetrySource,
      deviceReporting,
      deviceModel: runtimeRow.deviceModel ?? null,
      coreVersion: runtimeRow.coreVersion ?? null,
      lastReportAt: runtimeRow.lastReportAt ? new Date(runtimeRow.lastReportAt).toISOString() : null,
    },
    honesty: deviceReporting
      ? `Counters below are measured by the sing-box core on ${runtimeRow.deviceModel ?? "a paired Android device"}${runtimeRow.coreVersion ? ` (${runtimeRow.coreVersion})` : ""} and reported back to this control plane.`
      : "NORA TUNNEL web is a control plane: it validates configs, runs real network probes and supervises sessions. Byte counters are telemetry samples because no data-plane core is attached in this build — a session reads connected only after a real handshake to the endpoint succeeded.",
  };
}
