import { getProfile, listProfiles, listRules, toDraft } from "@/lib/store";
import { maskSecret, protocolLabel, validateProfile } from "@/lib/protocols";

export const dynamic = "force-dynamic";

type SingBoxOutbound = Record<string, unknown>;

function toSingBoxOutbound(draft: ReturnType<typeof toDraft>): SingBoxOutbound {
  const tls =
    draft.securityLayer === "tls"
      ? { enabled: true, server_name: draft.sni ?? draft.serverAddress, insecure: false }
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
      ? { type: "ws", path: draft.path ?? "/", headers: draft.host ? { Host: draft.host } : undefined }
      : draft.transport === "grpc"
        ? { type: "grpc", service_name: draft.serviceName ?? "" }
        : draft.transport === "httpupgrade"
          ? { type: "httpupgrade", path: draft.path ?? "/", host: draft.host ?? draft.serverAddress }
          : undefined;

  const common: SingBoxOutbound = {
    tag: "proxy",
    server: draft.serverAddress,
    server_port: Number(draft.serverPort),
  };
  if (tls) common.tls = tls;
  if (transport) common.transport = transport;

  switch (draft.protocol) {
    case "vless":
      return { type: "vless", ...common, uuid: draft.uuid, flow: draft.flow ?? undefined };
    case "vmess":
      return { type: "vmess", ...common, uuid: draft.uuid, security: "auto", alter_id: draft.alterId ?? 0 };
    case "trojan":
      return { type: "trojan", ...common, password: draft.password };
    case "shadowsocks":
      return {
        type: "shadowsocks",
        tag: "proxy",
        server: draft.serverAddress,
        server_port: Number(draft.serverPort),
        method: draft.encryption ?? "aes-256-gcm",
        password: draft.password,
      };
    case "hysteria2":
      return { type: "hysteria2", ...common, password: draft.password };
    case "tuic":
      return { type: "tuic", ...common, uuid: draft.uuid, password: draft.password };
    case "wireguard":
      return {
        type: "wireguard",
        tag: "proxy",
        server: draft.serverAddress,
        server_port: Number(draft.serverPort),
        private_key: draft.privateKey,
        peer_public_key: draft.publicKey,
        pre_shared_key: draft.presharedKey ?? undefined,
        mtu: draft.mtu ?? 1420,
        reserved: [0, 0, 0],
      };
    default:
      return { type: "openvpn", ...common, note: "OpenVPN requires a profile file reference — attach it beside this config." };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const format = url.searchParams.get("format") ?? "singbox";

  try {
    if (!id || id === "all") {
      const rows = await listProfiles();
      if (format === "links") {
        const body = rows.map((row) => row.shareLink ?? "").filter(Boolean).join("\n");
        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": 'attachment; filename="nora-links.txt"' },
        });
      }
      return Response.json(
        {
          generatedAt: new Date().toISOString(),
          generator: "NORA TUNNEL control plane",
          note: "Configuration values are normalised. Review TLS/Reality fields before deploying.",
          profiles: rows.map((row) => ({
            name: row.name,
            group: row.group,
            protocol: protocolLabel(row.protocol),
            core: row.core,
            transport: row.transport,
            server: `${row.serverAddress}:${row.serverPort}`,
            validation: { status: row.validationStatus, score: row.validationScore, findings: row.validationFindings ?? [] },
            secrets: { password: maskSecret(row.password), uuid: maskSecret(row.uuid), publicKey: maskSecret(row.publicKey) },
          })),
        },
        { headers: { "content-disposition": 'attachment; filename="nora-profiles.json"' } },
      );
    }

    const profile = await getProfile(Number(id));
    if (!profile) return Response.json({ ok: false, error: "Profile not found" }, { status: 404 });
    const draft = toDraft(profile);
    const validation = validateProfile(draft);
    const rules = await listRules();

    if (format === "links") {
      return new Response(profile.shareLink ?? "", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const singbox = {
      log: { level: "info", timestamp: true },
      dns: {
        servers: [
          { tag: "nora-dns", address: `tls://${profile.dnsPrimary}` },
          { tag: "nora-dns-backup", address: `tls://${profile.dnsSecondary}`, detour: "direct" },
        ],
        rules: [
          { rule_set: ["geosite-ads"], action: "reject" },
          { clash_mode: "direct", server: "nora-dns-backup" },
        ],
        strategy: profile.protocol === "wireguard" ? "prefer_ipv4" : "prefer_ipv6",
      },
      inbounds: [
        {
          type: "tun",
          tag: "nora-tun",
          address: ["172.19.0.1/30", "fd00::1/126"],
          mtu: profile.mtu ?? 1420,
          auto_route: true,
          strict_route: true,
          stack: profile.protocol === "wireguard" ? "gvisor" : "system",
        },
        { type: "mixed", tag: "nora-mixed", listen: "127.0.0.1", listen_port: 2080 },
      ],
      outbounds: [
        toSingBoxOutbound(draft),
        { type: "direct", tag: "direct" },
      ],
      route: {
        auto_detect_interface: true,
        final: profile.blockingMode === "direct" ? "direct" : "proxy",
        rules: rules
          .filter((rule) => rule.enabled)
          .map((rule) => {
            const ruleSet =
              rule.ruleType === "geosite"
                ? { rule_set: [`geosite-${rule.value}`] }
                : rule.ruleType === "geoip"
                  ? { rule_set: [`geoip-${rule.value}`] }
                  : rule.ruleType === "domain_suffix"
                    ? { domain_suffix: [rule.value] }
                    : rule.ruleType === "domain_full"
                      ? { domain: [rule.value] }
                      : rule.ruleType === "domain_keyword"
                        ? { domain_keyword: [rule.value] }
                        : rule.ruleType === "ip_cidr"
                          ? { ip_cidr: [rule.value] }
                          : rule.ruleType === "port"
                            ? { port: rule.value.includes("-") ? [Number(rule.value.split("-")[0]), Number(rule.value.split("-")[1])] : [Number(rule.value)] }
                            : { package_name: [rule.value] };
            return {
              ...ruleSet,
              action: rule.action === "block" ? "reject" : undefined,
              outbound: rule.action === "proxy" ? "proxy" : rule.action === "direct" ? "direct" : undefined,
              label: rule.name,
            };
          }),
        rule_set: [
          { type: "remote", tag: "geosite-ads", format: "binary", url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs" },
          { type: "remote", tag: "geosite-ir", format: "binary", url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-ir.srs" },
          { type: "remote", tag: "geoip-ir", format: "binary", url: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-ir.srs" },
        ],
      },
    };

    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        generator: "NORA TUNNEL control plane",
        review: {
          status: validation.status,
          score: validation.score,
          findings: validation.findings,
          note: "Generated config is a normalised draft. Verify Reality public keys, service names and rule sets against your own deployment before running a core.",
        },
        profile: {
          name: profile.name,
          group: profile.group,
          protocol: protocolLabel(profile.protocol),
          core: profile.core,
          transport: profile.transport,
          security: profile.securityLayer,
          server: `${profile.serverAddress}:${profile.serverPort}`,
          blockingMode: profile.blockingMode,
          killSwitch: profile.killSwitch,
        },
        singbox,
      },
      {
        headers: {
          "content-disposition": `attachment; filename="nora-${profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json"`,
        },
      },
    );
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
