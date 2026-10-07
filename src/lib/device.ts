import { PROTOCOL_CAPS } from "@/lib/protocols";
import type { CoreId, ProfileDraft, ProtocolId } from "@/lib/types";
import type { ProfileRow, RoutingRuleRow, SettingsRow } from "@/db/schema";
import { GEOIP_TABLE, GEOSITE_TABLE } from "@/lib/rule-tables";
import { toDraft } from "@/lib/store-draft";

/**
 * Builds the configuration envelope consumed by the Android client.
 *
 * The phone never invents a config: it receives a sing-box document compiled here
 * from a profile that already passed structural validation, plus the exact TUN
 * parameters Android needs so the VpnService interface and the core agree.
 *
 * No cryptography is implemented in this project — the document only configures
 * upstream sing-box outbounds and its own TUN stack.
 */

export const DEVICE_CORE = "sing-box v1.14.2 (SagerNet/sing-box, gomobile arm64)";

export type DeviceTun = {
  address: string;
  address6: string;
  dns: string;
  mtu: number;
  includePackages: string[];
  excludePackages: string[];
  mode: "allowlist" | "blocklist" | "full";
};

export type DeviceEnvelope = {
  ok: boolean;
  profileId: number;
  profileName: string;
  protocol: string;
  core: string;
  transport: string;
  securityLayer: string;
  endpoint: string;
  coreVersion: string;
  validation: { status: string; score: number; findings: { code: string; severity: string; message: string }[] };
  tun: DeviceTun;
  warnings: string;
  config: string;
  connectable: boolean;
  blockedReason: string | null;
};

function tunPlatform(): Record<string, unknown> {
  return { http_proxy: { enabled: false } };
}

export function buildOutbound(draft: ProfileDraft): Record<string, unknown> {
  const server = draft.serverAddress;
  const port = Number(draft.serverPort);
  const tls =
    draft.securityLayer === "tls"
      ? {
          enabled: true,
          server_name: draft.sni ?? server,
          insecure: false,
          utls: draft.fingerprint ? { enabled: true, fingerprint: draft.fingerprint } : undefined,
        }
      : draft.securityLayer === "reality"
        ? {
            enabled: true,
            server_name: draft.sni ?? "www.cloudflare.com",
            reality: { enabled: true, public_key: draft.publicKey ?? "", short_id: "" },
            utls: { enabled: true, fingerprint: draft.fingerprint ?? "chrome" },
          }
        : undefined;

  const transport =
    draft.transport === "ws"
      ? { type: "ws", path: draft.path || "/", headers: draft.host ? { Host: draft.host } : undefined }
      : draft.transport === "grpc"
        ? { type: "grpc", service_name: draft.serviceName ?? "" }
        : draft.transport === "httpupgrade"
          ? { type: "httpupgrade", path: draft.path || "/", host: draft.host ?? server }
          : draft.transport === "h2"
            ? { type: "http", host: draft.host ? [draft.host] : undefined, path: draft.path || "/" }
            : undefined;

  const base: Record<string, unknown> = { tag: "proxy", server, server_port: port };
  if (tls) base.tls = tls;
  if (transport) base.transport = transport;

  switch (draft.protocol as ProtocolId) {
    case "vless":
      return { type: "vless", ...base, uuid: draft.uuid, flow: draft.flow || undefined, packet_encoding: "xudp" };
    case "vmess":
      return { type: "vmess", ...base, uuid: draft.uuid, security: "auto", alter_id: draft.alterId ?? 0 };
    case "trojan":
      return { type: "trojan", ...base, password: draft.password };
    case "shadowsocks":
      return {
        type: "shadowsocks",
        tag: "proxy",
        server,
        server_port: port,
        method: draft.encryption || "aes-256-gcm",
        password: draft.password,
      };
    case "hysteria2":
      return { type: "hysteria2", ...base, password: draft.password, up_mbps: 0, down_mbps: 0 };
    case "tuic":
      return { type: "tuic", ...base, uuid: draft.uuid, password: draft.password, congestion_control: "bbr" };
    case "wireguard":
      return {
        type: "wireguard",
        tag: "proxy",
        server,
        server_port: port,
        private_key: draft.privateKey,
        peer_public_key: draft.publicKey,
        pre_shared_key: draft.presharedKey || undefined,
        mtu: draft.mtu ?? 1420,
        udp_timeout: 300,
      };
    default:
      return {
        type: "openvpn",
        ...base,
        note: "OpenVPN is handled by the openvpn3 core, which is not bundled in this build.",
      };
  }
}

/** Compiles the stored routing table into self-contained sing-box route rules. */
export function buildRouteRules(rules: RoutingRuleRow[]) {
  const compiled: Record<string, unknown>[] = [];
  const includePackages: string[] = [];
  const excludePackages: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const action = rule.action;
    if (rule.ruleType === "process") {
      if (action === "proxy") includePackages.push(rule.value);
      else excludePackages.push(rule.value);
      continue;
    }
    const entry: Record<string, unknown> = { action: action === "block" ? "reject" : action === "direct" ? "route" : "route" };
    if (action === "direct") entry.outbound = "direct";
    if (action === "proxy") entry.outbound = "proxy";
    if (action === "block") delete entry.outbound;

    switch (rule.ruleType) {
      case "domain_full":
        entry.domain = [rule.value];
        break;
      case "domain_suffix":
        entry.domain_suffix = [rule.value.replace(/^\./, "")];
        break;
      case "domain_keyword":
        entry.domain_keyword = [rule.value];
        break;
      case "ip_cidr":
        entry.ip_cidr = [rule.value];
        break;
      case "geoip": {
        const table = GEOIP_TABLE[rule.value];
        if (!table) continue;
        entry.ip_cidr = table;
        break;
      }
      case "geosite": {
        const table = GEOSITE_TABLE[rule.value];
        if (!table) continue;
        entry.domain = table.filter((value) => !value.startsWith("."));
        entry.domain_suffix = table.filter((value) => !value.startsWith("."));
        break;
      }
      case "port": {
        if (rule.value.includes("-")) {
          const [start, end] = rule.value.split("-").map((value) => Number(value));
          entry.port = [start, end];
        } else {
          entry.port = [Number(rule.value)];
        }
        break;
      }
      default:
        continue;
    }
    compiled.push(entry);
  }

  return { rules: compiled, includePackages, excludePackages };
}

export function buildDeviceEnvelope(input: {
  profile: ProfileRow;
  rules: RoutingRuleRow[];
  settings: SettingsRow;
  validation: { status: string; score: number; findings: { code: string; severity: string; message: string }[] };
}): DeviceEnvelope {
  const { profile, rules, settings, validation } = input;
  const draft = toDraft(profile);
  const caps = PROTOCOL_CAPS[profile.protocol as ProtocolId];
  const { rules: routeRules, includePackages, excludePackages } = buildRouteRules(rules);

  const tunAddress = "172.19.0.1/30";
  const tunAddress6 = settings.ipv6Mode === "block" ? "" : "fd00::1/126";
  const dnsServers = [profile.dnsPrimary ?? settings.dnsPrimary, profile.dnsSecondary ?? settings.dnsSecondary]
    .filter(Boolean)
    .join(",");

  const mode: DeviceTun["mode"] = includePackages.length ? "allowlist" : excludePackages.length ? "blocklist" : "full";

  const warnings: string[] = [];
  if (profile.validationStatus === "invalid") {
    warnings.push("This profile carries blocking validation findings — the control plane will refuse to connect it while strict validation is enabled.");
  }
  if (profile.protocol === "openvpn") {
    warnings.push("OpenVPN needs the openvpn3 core, which is not part of this APK; the client will refuse to start instead of pretending.");
  }
  if (mode === "allowlist") {
    warnings.push(`Split tunnel allowlist active: only ${includePackages.length} package(s) are routed through the tunnel.`);
  } else if (mode === "blocklist") {
    warnings.push(`Split tunnel blocklist active: ${excludePackages.length} package(s) bypass the tunnel.`);
  }
  if (settings.ipv6Mode === "allow") {
    warnings.push("IPv6 is allowed outside the tunnel by workspace policy — leaks are possible.");
  }

  const config = {
    log: { level: settings.logLevel === "debug" ? "debug" : "info", timestamp: true },
    dns: {
      servers: [
        { tag: "nora-dns", address: `udp://${profile.dnsPrimary || settings.dnsPrimary || "1.1.1.1"}` },
        { tag: "nora-dns-fallback", address: `udp://${profile.dnsSecondary || settings.dnsSecondary || "1.0.0.1"}`, detour: "direct" },
      ],
      final: "nora-dns",
      strategy: settings.ipv6Mode === "block" ? "ipv4_only" : "prefer_ipv4",
      independent_cache: true,
    },
    inbounds: [
      {
        type: "tun",
        tag: "tun-in",
        interface_name: "nora0",
        address: tunAddress6 ? [tunAddress, tunAddress6] : [tunAddress],
        mtu: 9000,
        auto_route: false,
        strict_route: false,
        stack: "gvisor",
        sniff: true,
        sniff_override_destination: false,
        platform: tunPlatform(),
      },
    ],
    outbounds: [buildOutbound(draft), { type: "direct", tag: "direct" }],
    route: {
      final: profile.blockingMode === "direct" ? "direct" : "proxy",
      auto_detect_interface: true,
      default_domain_resolver: "nora-dns",
      rules: routeRules,
    },
    experimental: {
      cache_file: { enabled: false },
      clash_api: { external_controller: "127.0.0.1:9090", default_mode: "rule" },
    },
  };

  const connectable = profile.validationStatus !== "invalid" && profile.protocol !== "openvpn";

  return {
    ok: true,
    profileId: profile.id,
    profileName: profile.name,
    protocol: profile.protocol,
    core: profile.core,
    transport: profile.transport,
    securityLayer: profile.securityLayer,
    endpoint: `${profile.serverAddress}:${profile.serverPort}`,
    coreVersion: DEVICE_CORE,
    validation,
    tun: {
      address: tunAddress.split("/")[0],
      address6: tunAddress6 ? tunAddress6.split("/")[0] : "",
      dns: dnsServers,
      mtu: 9000,
      includePackages: Array.from(new Set(includePackages)),
      excludePackages: Array.from(new Set(excludePackages)),
      mode,
    },
    warnings: warnings.join(" "),
    config: JSON.stringify(config, null, 2),
    connectable,
    blockedReason: connectable
      ? null
      : profile.validationStatus === "invalid"
        ? validation.findings[0]?.message ?? "Profile blocked by strict validation."
        : "This protocol requires a core that is not bundled in the APK.",
  };
}

export function coreSupportsProtocol(protocol: string, core: string): boolean {
  const caps = PROTOCOL_CAPS[protocol as ProtocolId];
  if (!caps) return false;
  return caps.cores.includes(core as CoreId);
}
