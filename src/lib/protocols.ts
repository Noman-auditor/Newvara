import type {
  CoreId,
  ProfileDraft,
  ProtocolId,
  Severity,
  TransportId,
  ValidationFinding,
  ValidationResult,
} from "@/lib/types";

type Capability = {
  label: string;
  family: "proxy" | "vpn";
  cores: CoreId[];
  transports: TransportId[];
  security: string[];
  credential: "uuid" | "password" | "keypair" | "both";
  defaultPort: number;
  schemes: string[];
  singboxType: string;
  notes: string;
};

export const PROTOCOL_CAPS: Record<ProtocolId, Capability> = {
  vless: {
    label: "VLESS",
    family: "proxy",
    cores: ["xray", "sing-box"],
    transports: ["tcp", "ws", "grpc", "httpupgrade", "h2", "quic"],
    security: ["none", "tls", "reality"],
    credential: "uuid",
    defaultPort: 443,
    schemes: ["vless://"],
    singboxType: "vless",
    notes: "Stateless, XTLS-Reality capable. No built-in encryption — must ride TLS or Reality.",
  },
  vmess: {
    label: "VMess",
    family: "proxy",
    cores: ["xray", "sing-box"],
    transports: ["tcp", "ws", "grpc", "httpupgrade", "h2"],
    security: ["none", "tls"],
    credential: "uuid",
    defaultPort: 443,
    schemes: ["vmess://"],
    singboxType: "vmess",
    notes: "Legacy AEAD. Prefer VLESS unless the endpoint only speaks VMess.",
  },
  trojan: {
    label: "Trojan",
    family: "proxy",
    cores: ["xray", "sing-box"],
    transports: ["tcp", "ws", "grpc"],
    security: ["tls", "reality"],
    credential: "both",
    defaultPort: 443,
    schemes: ["trojan://"],
    singboxType: "trojan",
    notes: "TLS-only by design. Rejects plaintext endpoints.",
  },
  shadowsocks: {
    label: "Shadowsocks",
    family: "proxy",
    cores: ["xray", "sing-box"],
    transports: ["tcp", "udp"],
    security: ["none"],
    credential: "password",
    defaultPort: 8388,
    schemes: ["ss://"],
    singboxType: "shadowsocks",
    notes: "Own AEAD suite. Never pair with TLS transport wrappers.",
  },
  wireguard: {
    label: "WireGuard",
    family: "vpn",
    cores: ["wireguard-go", "sing-box"],
    transports: ["udp"],
    security: ["none"],
    credential: "keypair",
    defaultPort: 51820,
    schemes: ["wg://"],
    singboxType: "wireguard",
    notes: "Fixed Noise_IKpsk2 crypto, no negotiation knobs. Keys never leave the device in the clear.",
  },
  openvpn: {
    label: "OpenVPN",
    family: "vpn",
    cores: ["openvpn3"],
    transports: ["tcp", "udp"],
    security: ["tls"],
    credential: "both",
    defaultPort: 1194,
    schemes: ["openvpn://"],
    singboxType: "openvpn",
    notes: "TLS control channel + data channel. Profile files must stay out of the public UI.",
  },
  hysteria2: {
    label: "Hysteria2",
    family: "proxy",
    cores: ["sing-box"],
    transports: ["quic"],
    security: ["tls"],
    credential: "password",
    defaultPort: 443,
    schemes: ["hysteria2://", "hy2://"],
    singboxType: "hysteria2",
    notes: "QUIC-based with mandatory TLS. Brutal congestion control is opt-in.",
  },
  tuic: {
    label: "TUIC v5",
    family: "proxy",
    cores: ["sing-box"],
    transports: ["quic"],
    security: ["tls"],
    credential: "both",
    defaultPort: 443,
    schemes: ["tuic://"],
    singboxType: "tuic",
    notes: "QUIC multiplexed streams with native UDP relay.",
  },
};

export const CORES: { id: CoreId; label: string; upstream: string; license: string }[] = [
  { id: "xray", label: "Xray-core", upstream: "XTLS/Xray-core", license: "MPL-2.0" },
  { id: "sing-box", label: "sing-box", upstream: "SagerNet/sing-box", license: "GPL-3.0" },
  { id: "wireguard-go", label: "wireguard-go", upstream: "WireGuard/wireguard-go", license: "MIT" },
  { id: "openvpn3", label: "OpenVPN 3", upstream: "OpenVPN/openvpn3", license: "AGPL-3.0" },
];

export const TRANSPORTS: { id: TransportId; label: string; hint: string }[] = [
  { id: "tcp", label: "TCP (raw)", hint: "Lowest overhead, easiest to fingerprint" },
  { id: "ws", label: "WebSocket", hint: "CDN friendly, needs Host + Path" },
  { id: "grpc", label: "gRPC", hint: "HTTP/2 streams, needs serviceName" },
  { id: "httpupgrade", label: "HTTPUpgrade", hint: "Single-request upgrade, CDN friendly" },
  { id: "h2", label: "HTTP/2", hint: "Multiplexed, degrades under loss" },
  { id: "quic", label: "QUIC / UDP", hint: "Loss tolerant, UDP blocking hurts" },
  { id: "udp", label: "UDP", hint: "Native datagrams, no multiplexing" },
  { id: "tls", label: "TLS wrapper", hint: "OpenVPN style TLS transport" },
];

export const SECURITY_LAYERS = [
  { id: "none", label: "None", hint: "Plaintext handshake — never expose credentials" },
  { id: "tls", label: "TLS", hint: "Standard certificate validation" },
  { id: "reality", label: "Reality", hint: "Borrowed certificate, needs public key + SNI" },
];

export const FINGERPRINTS = ["chrome", "firefox", "safari", "ios", "android", "edge", "random"];

const HOSTNAME_RE = /^(?=.{1,253}$)([a-zA-Z0-9_](?:[a-zA-Z0-9_-]{0,61}[a-zA-Z0-9_])?\.)+[a-zA-Z]{2,63}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE = /^[0-9a-fA-F:]{2,45}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SHELL_META_RE = /[;&|`$><\n\r\\]|\$\(|\$\{|\.\.\//;
const BASE64_KEY_RE = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 45,
  error: 25,
  warning: 10,
  info: 2,
};

export function isIpAddress(value: string): boolean {
  return IPV4_RE.test(value) || (IPV6_RE.test(value) && value.includes(":"));
}

export function isValidHost(value: string): boolean {
  return isIpAddress(value) || HOSTNAME_RE.test(value);
}

export function protocolLabel(id: string): string {
  return PROTOCOL_CAPS[id as ProtocolId]?.label ?? id.toUpperCase();
}

export function protocolCaps(id: string): Capability | null {
  return PROTOCOL_CAPS[id as ProtocolId] ?? null;
}

export function defaultDraft(protocol: ProtocolId = "vless"): ProfileDraft {
  const caps = PROTOCOL_CAPS[protocol];
  return {
    name: "",
    group: "Default",
    protocol,
    core: caps.cores[0],
    transport: caps.transports[0],
    securityLayer: caps.security[caps.security.length - 1],
    serverAddress: "",
    serverPort: caps.defaultPort,
    uuid: "",
    password: "",
    publicKey: "",
    privateKey: "",
    sni: "",
    host: "",
    path: "",
    serviceName: "",
    fingerprint: "chrome",
    alterId: 0,
    mtu: protocol === "wireguard" ? 1420 : 1500,
    dnsPrimary: "1.1.1.1",
    dnsSecondary: "1.0.0.1",
    allowedIps: "0.0.0.0/0, ::/0",
    keepalive: 25,
    blockingMode: "rule",
    killSwitch: true,
    notes: "",
  };
}

/**
 * Structural validation of an untrusted tunnel configuration.
 * Nothing here executes commands: values are only inspected and normalized.
 */
export function validateProfile(input: ProfileDraft): ValidationResult {
  const findings: ValidationFinding[] = [];
  const push = (f: ValidationFinding) => findings.push(f);

  const protocol = input.protocol as ProtocolId;
  const caps = PROTOCOL_CAPS[protocol];

  if (!input.name || input.name.trim().length < 2) {
    push({
      code: "name.missing",
      severity: "error",
      field: "name",
      message: "Profile name is required (min 2 characters).",
      hint: "Use a name you can recognise in the connection history.",
    });
  }

  if (!caps) {
    push({
      code: "protocol.unsupported",
      severity: "critical",
      field: "protocol",
      message: `Unsupported protocol "${input.protocol}".`,
      hint: "Supported: " + Object.keys(PROTOCOL_CAPS).join(", "),
    });
    return finalize(findings);
  }

  if (!caps.cores.includes(input.core as CoreId)) {
    push({
      code: "core.incompatible",
      severity: "critical",
      field: "core",
      message: `${caps.label} cannot run on the "${input.core}" core.`,
      hint: `Compatible cores: ${caps.cores.join(", ")}.`,
    });
  }

  if (!caps.transports.includes(input.transport as TransportId)) {
    push({
      code: "transport.incompatible",
      severity: "error",
      field: "transport",
      message: `${caps.label} does not support the "${input.transport}" transport.`,
      hint: `Compatible transports: ${caps.transports.join(", ")}.`,
    });
  }

  if (!caps.security.includes(input.securityLayer)) {
    push({
      code: "security.incompatible",
      severity: "critical",
      field: "securityLayer",
      message: `Security layer "${input.securityLayer}" is invalid for ${caps.label}.`,
      hint: `Allowed: ${caps.security.join(", ")}.`,
    });
  }

  const address = (input.serverAddress ?? "").trim();
  if (!address) {
    push({
      code: "server.missing",
      severity: "critical",
      field: "serverAddress",
      message: "Server address is required.",
    });
  } else if (SHELL_META_RE.test(address)) {
    push({
      code: "server.injection",
      severity: "critical",
      field: "serverAddress",
      message: "Server address contains shell metacharacters and was rejected.",
      hint: "Addresses are whitelisted to hostname / IP-address grammar before use.",
    });
  } else if (!isValidHost(address)) {
    push({
      code: "server.malformed",
      severity: "error",
      field: "serverAddress",
      message: `"${address}" is not a valid hostname or IP address.`,
      hint: "Example: de1.example.net or 203.0.113.7",
    });
  }

  const port = Number(input.serverPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    push({
      code: "port.range",
      severity: "critical",
      field: "serverPort",
      message: "Port must be an integer between 1 and 65535.",
    });
  } else if (port < 1024 && ![53, 80, 443, 1194, 500, 4500].includes(port)) {
    push({
      code: "port.privileged",
      severity: "warning",
      field: "serverPort",
      message: `Port ${port} is in the privileged range; remote deployments rarely listen there.`,
      hint: "Double-check the endpoint port from the provider panel.",
    });
  }

  const credentialRequirements: Record<string, boolean> = {
    uuid: !!input.uuid?.trim(),
    password: !!input.password?.trim(),
    keypair: !!input.publicKey?.trim() && !!input.privateKey?.trim(),
    both: !!input.uuid?.trim() || !!input.password?.trim(),
  };

  if (caps.credential === "uuid" && !UUID_RE.test(input.uuid?.trim() ?? "")) {
    push({
      code: "uuid.invalid",
      severity: "error",
      field: "uuid",
      message: "A well-formed UUID is required for this protocol.",
      hint: "Format: 8-4-4-4-12 hexadecimal characters.",
    });
  }

  if (caps.credential === "keypair") {
    if (!input.privateKey?.trim()) {
      push({ code: "key.privateMissing", severity: "critical", field: "privateKey", message: "WireGuard private key is required." });
    } else if (!BASE64_KEY_RE.test(input.privateKey.trim())) {
      push({
        code: "key.privateFormat",
        severity: "warning",
        field: "privateKey",
        message: "Private key does not look like a 32-byte base64 X25519 key.",
      });
    }
    if (!input.publicKey?.trim()) {
      push({ code: "key.publicMissing", severity: "critical", field: "publicKey", message: "Peer public key is required." });
    } else if (!BASE64_KEY_RE.test(input.publicKey.trim())) {
      push({
        code: "key.publicFormat",
        severity: "warning",
        field: "publicKey",
        message: "Peer public key does not look like a 32-byte base64 X25519 key.",
      });
    }
  }

  if ((caps.credential === "password" || caps.credential === "both") && input.password !== undefined) {
    const pw = input.password?.trim() ?? "";
    if (pw && pw.length < 10) {
      push({
        code: "password.short",
        severity: "warning",
        field: "password",
        message: "Secret is shorter than 10 characters — rotate it on the server.",
      });
    }
  }

  if (!credentialRequirements[caps.credential] && caps.credential !== "password") {
    push({
      code: "credential.missing",
      severity: "critical",
      field: "uuid",
      message: `This protocol requires ${caps.credential === "keypair" ? "a key pair" : "credentials"}.`,
    });
  }

  if (input.securityLayer === "reality") {
    if (!input.publicKey?.trim()) {
      push({
        code: "reality.publicKey",
        severity: "error",
        field: "publicKey",
        message: "Reality requires the server's Reality public key.",
      });
    }
    if (!input.sni?.trim()) {
      push({
        code: "reality.sni",
        severity: "error",
        field: "sni",
        message: "Reality requires a masquerade SNI destination.",
        hint: "Pick a domain whose TLS fingerprint the server actually mirrors.",
      });
    }
  }

  if (input.securityLayer !== "none" && input.sni && !isValidHost(input.sni.trim())) {
    push({
      code: "sni.malformed",
      severity: "warning",
      field: "sni",
      message: `SNI "${input.sni}" is not a valid hostname.`,
    });
  }

  if (input.securityLayer !== "none" && input.sni && IPV4_RE.test(input.sni.trim())) {
    push({
      code: "sni.ipLiteral",
      severity: "warning",
      field: "sni",
      message: "SNI is a bare IP address; certificate validation will likely fail.",
    });
  }

  const needsPath = ["ws", "httpupgrade"].includes(input.transport);
  if (needsPath && input.path && !input.path.startsWith("/")) {
    push({
      code: "path.prefix",
      severity: "warning",
      field: "path",
      message: "Path must start with '/' for this transport.",
    });
  }
  if (input.path && SHELL_META_RE.test(input.path)) {
    push({
      code: "path.injection",
      severity: "error",
      field: "path",
      message: "Path contains characters that are stripped before use.",
    });
  }
  if (needsPath && !input.host?.trim()) {
    push({
      code: "host.recommended",
      severity: "info",
      field: "host",
      message: "No Host header set — CDN fronting will not route correctly.",
    });
  }
  if (input.transport === "grpc" && !input.serviceName?.trim()) {
    push({
      code: "grpc.serviceName",
      severity: "warning",
      field: "serviceName",
      message: "gRPC transport usually needs a serviceName.",
    });
  }

  const mtu = Number(input.mtu ?? (protocol === "wireguard" ? 1420 : 1500));
  const mtuMin = protocol === "wireguard" ? 1280 : 576;
  if (!Number.isFinite(mtu) || mtu < mtuMin || mtu > 1500) {
    push({
      code: "mtu.range",
      severity: "warning",
      field: "mtu",
      message: `MTU ${input.mtu} is outside the safe range (${mtuMin}–1500).`,
      hint: "Too large causes fragmentation; too small tanks throughput.",
    });
  }

  for (const [field, value] of [
    ["dnsPrimary", input.dnsPrimary],
    ["dnsSecondary", input.dnsSecondary],
  ] as const) {
    if (value && !IPV4_RE.test(value.trim()) && !IPV6_RE.test(value.trim())) {
      push({
        code: `${field}.malformed`,
        severity: "warning",
        field,
        message: `${value} is not a valid resolver IP.`,
      });
    }
  }

  if ((input.dnsPrimary ?? "").startsWith("192.168") || (input.dnsPrimary ?? "").startsWith("10.")) {
    push({
      code: "dns.private",
      severity: "info",
      field: "dnsPrimary",
      message: "Resolvers are private addresses; VPN DNS leakage rules will apply.",
    });
  }

  if (input.securityLayer === "none" && caps.family === "proxy" && caps.security.includes("tls")) {
    push({
      code: "security.plaintext",
      severity: "warning",
      field: "securityLayer",
      message: "Running without TLS exposes protocol metadata to the network path.",
    });
  }

  if (input.killSwitch === false) {
    push({
      code: "killswitch.off",
      severity: "info",
      field: "killSwitch",
      message: "Kill switch is disabled for this profile.",
    });
  }

  return finalize(findings);
}

function finalize(findings: ValidationFinding[]): ValidationResult {
  const score = Math.max(
    0,
    Math.min(
      100,
      100 - findings.reduce((total, f) => total + SEVERITY_WEIGHT[f.severity], 0),
    ),
  );
  const hasBlocking = findings.some((f) => f.severity === "critical" || f.severity === "error");
  const status = hasBlocking ? "invalid" : findings.length ? "warnings" : "valid";
  return { status, score, findings };
}

/* ------------------------------- share links ------------------------------ */

export type ParseOutcome =
  | { ok: true; draft: Partial<ProfileDraft>; origin: string; warnings: string[] }
  | { ok: false; error: string; origin: string };

function decodeBase64(input: string): string {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function pick(params: URLSearchParams, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key);
    if (value) return value;
  }
  return undefined;
}

/** Parses an untrusted share link / config blob into a draft profile. */
export function parseShareLink(raw: string): ParseOutcome {
  const text = raw.trim();
  const origin = text.split("\n")[0].slice(0, 120);

  if (/^\s*(wireguard|\[Interface\])/i.test(text) || /\[Peer\]/i.test(text)) {
    const get = (key: string) => {
      const match = text.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "im"));
      return match ? match[1].trim() : undefined;
    };
    const endpoint = get("Endpoint") ?? "";
    const [address, port] = endpoint.split(":");
    return {
      ok: true,
      origin: "wireguard-ini",
      warnings: ["WireGuard INI parsed without executing any wg-quick directives."],
      draft: {
        name: get("Name") ?? (address ? `WG ${address}` : "WireGuard import"),
        protocol: "wireguard",
        core: "wireguard-go",
        transport: "udp",
        securityLayer: "none",
        serverAddress: address ?? "",
        serverPort: port ? Number(port) : 51820,
        privateKey: get("PrivateKey"),
        publicKey: get("PublicKey"),
        presharedKey: get("PresharedKey"),
        allowedIps: get("AllowedIPs") ?? "0.0.0.0/0, ::/0",
        dnsPrimary: get("DNS")?.split(",")[0]?.trim() ?? "1.1.1.1",
        mtu: get("MTU") ? Number(get("MTU")) : 1420,
        keepalive: get("PersistentKeepalive") ? Number(get("PersistentKeepalive")) : 25,
        notes: "Imported from WireGuard INI",
      },
    };
  }

  const schemeMatch = text.match(/^([a-z0-9]+):\/\//i);
  if (!schemeMatch) {
    return { ok: false, error: "No recognised scheme (vless://, vmess://, trojan://, ss://, hy2://, tuic://).", origin };
  }
  const scheme = schemeMatch[1].toLowerCase();

  if (scheme === "vmess") {
    try {
      const payload = JSON.parse(decodeBase64(text.replace(/^vmess:\/\//i, "")));
      const port = Number(payload.port);
      return {
        ok: true,
        origin: "vmess://",
        warnings: port && !Number.isInteger(port) ? ["Port normalized to integer."] : [],
        draft: {
          name: payload.ps ? String(payload.ps) : `VMess ${payload.add ?? "import"}`,
          protocol: "vmess",
          core: "xray",
          transport: (payload.net as string) === "ws" ? "ws" : "tcp",
          securityLayer: payload.tls === "tls" ? "tls" : "none",
          serverAddress: String(payload.add ?? ""),
          serverPort: port,
          uuid: String(payload.id ?? ""),
          alterId: payload.aid ? Number(payload.aid) : 0,
          host: payload.host ? String(payload.host) : undefined,
          path: payload.path ? String(payload.path) : undefined,
          sni: payload.sni ? String(payload.sni) : undefined,
          notes: "Imported from vmess:// link",
        },
      };
    } catch {
      return { ok: false, error: "vmess:// payload is not valid base64 JSON.", origin };
    }
  }

  if (scheme === "ss") {
    const body = text.replace(/^ss:\/\//i, "");
    let methodSecret = body;
    let hostPart = "";
    if (body.includes("@")) {
      const [encoded, rest] = body.split("@");
      methodSecret = /^[A-Za-z0-9+/=_%-]+$/.test(encoded) && !encoded.includes(":") ? decodeBase64(encoded) : encoded;
      hostPart = rest.split(/[?#]/)[0];
      if (hostPart.includes("/")) hostPart = hostPart.split("/")[0];
    } else {
      const hashless = body.split("#")[0];
      const [secret, host] = decodeBase64(hashless).split("@");
      methodSecret = secret;
      hostPart = host ?? "";
    }
    const [method, password] = methodSecret.split(":");
    const [address, port] = hostPart.split(":");
    return {
      ok: true,
      origin: "ss://",
      warnings: hostPart ? [] : ["Missing host section — the link may be truncated."],
      draft: {
        name: `SS ${address ?? "import"}`,
        protocol: "shadowsocks",
        core: "sing-box",
        transport: "tcp",
        securityLayer: "none",
        serverAddress: address ?? "",
        serverPort: port ? Number(port) : 8388,
        encryption: method,
        password,
        notes: "Imported from ss:// link",
      },
    };
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: "Link is not parseable as a URL.", origin };
  }

  const params = url.searchParams;
  const address = url.hostname;
  const port = url.port ? Number(url.port) : undefined;
  const label = decodeURIComponent(url.hash.replace(/^#/, ""));

  const base: Partial<ProfileDraft> = {
    serverAddress: address,
    serverPort: port,
    sni: pick(params, "sni", "peer", "serverName") ?? undefined,
    host: pick(params, "host") ?? undefined,
    path: pick(params, "path") ?? undefined,
    serviceName: pick(params, "serviceName") ?? undefined,
    fingerprint: pick(params, "fp") ?? "chrome",
    allowedIps: pick(params, "allowedIPs") ?? undefined,
    notes: `Imported from ${scheme}:// link`,
  };

  const transportMap: Record<string, string> = {
    ws: "ws",
    grpc: "grpc",
    httpupgrade: "httpupgrade",
    h2: "h2",
    quic: "quic",
    tcp: "tcp",
    udp: "udp",
  };

  if (scheme === "vless" || scheme === "trojan" || scheme === "tuic") {
    const protocol = (scheme === "vless" ? "vless" : scheme === "trojan" ? "trojan" : "tuic") as ProtocolId;
    const security = (params.get("security") ?? (scheme === "trojan" ? "tls" : "none")).toLowerCase();
    return {
      ok: true,
      origin: `${scheme}://`,
      warnings: [],
      draft: {
        ...base,
        name: label || `${PROTOCOL_CAPS[protocol].label} ${address}`,
        protocol,
        core: protocol === "tuic" ? "sing-box" : "xray",
        transport: transportMap[(params.get("type") ?? (protocol === "tuic" ? "quic" : "tcp")).toLowerCase()] ?? "tcp",
        securityLayer: security === "reality" ? "reality" : security === "tls" ? "tls" : "none",
        uuid: scheme === "tuic" ? undefined : url.username || undefined,
        password: protocol === "tuic" ? url.password || undefined : undefined,
        flow: pick(params, "flow") ?? undefined,
        publicKey: pick(params, "pbk", "publicKey") ?? undefined,
      },
    };
  }

  if (scheme === "hysteria2" || scheme === "hy2") {
    return {
      ok: true,
      origin: "hysteria2://",
      warnings: [],
      draft: {
        ...base,
        name: label || `Hysteria2 ${address}`,
        protocol: "hysteria2",
        core: "sing-box",
        transport: "quic",
        securityLayer: "tls",
        password: decodeURIComponent(url.password || url.username || ""),
        sni: pick(params, "sni", "peer") ?? url.hostname,
      },
    };
  }

  if (scheme === "wg") {
    return {
      ok: true,
      origin: "wg://",
      warnings: [],
      draft: {
        ...base,
        name: label || `WireGuard ${address}`,
        protocol: "wireguard",
        core: "wireguard-go",
        transport: "udp",
        securityLayer: "none",
        privateKey: pick(params, "private_key", "privateKey") ?? undefined,
        publicKey: pick(params, "public_key", "publicKey") ?? undefined,
        presharedKey: pick(params, "preshared_key") ?? undefined,
      },
    };
  }

  if (scheme === "openvpn") {
    return {
      ok: true,
      origin: "openvpn://",
      warnings: ["Inline certificates are not imported — re-export the profile with a key pair reference."],
      draft: {
        ...base,
        name: label || `OpenVPN ${address}`,
        protocol: "openvpn",
        core: "openvpn3",
        transport: params.get("proto") === "tcp" ? "tcp" : "udp",
        securityLayer: "tls",
        password: url.password || undefined,
      },
    };
  }

  return { ok: false, error: `Scheme "${scheme}://" is not supported by the validator.`, origin };
}

export function buildShareLink(input: ProfileDraft): string {
  const params = new URLSearchParams();
  if (input.securityLayer && input.securityLayer !== "none") params.set("security", input.securityLayer);
  if (input.transport) params.set("type", input.transport);
  if (input.sni) params.set("sni", input.sni);
  if (input.host) params.set("host", input.host);
  if (input.path) params.set("path", input.path);
  if (input.serviceName) params.set("serviceName", input.serviceName);
  if (input.fingerprint) params.set("fp", input.fingerprint);
  if (input.flow) params.set("flow", input.flow);
  const label = encodeURIComponent(input.name || "nora-profile");
  const port = input.serverPort || 443;

  switch (input.protocol) {
    case "vmess": {
      const payload = {
        v: "2",
        ps: input.name,
        add: input.serverAddress,
        port: String(port),
        id: input.uuid ?? "",
        aid: String(input.alterId ?? 0),
        net: input.transport,
        type: "none",
        host: input.host ?? "",
        path: input.path ?? "",
        tls: input.securityLayer === "tls" ? "tls" : "",
        sni: input.sni ?? "",
      };
      return `vmess://${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
    }
    case "shadowsocks": {
      const secret = Buffer.from(`${input.encryption ?? "aes-256-gcm"}:${input.password ?? ""}`).toString("base64");
      return `ss://${secret}@${input.serverAddress}:${port}#${label}`;
    }
    case "trojan":
      return `trojan://${encodeURIComponent(input.password ?? input.uuid ?? "")}@${input.serverAddress}:${port}?${params.toString()}#${label}`;
    case "hysteria2":
      return `hysteria2://${encodeURIComponent(input.password ?? "")}@${input.serverAddress}:${port}?${params.toString()}#${label}`;
    case "tuic":
      return `tuic://${encodeURIComponent(input.uuid ?? "")}:${encodeURIComponent(input.password ?? "")}@${input.serverAddress}:${port}?${params.toString()}#${label}`;
    case "wireguard": {
      const wg = new URLSearchParams();
      wg.set("public_key", input.publicKey ?? "");
      if (input.privateKey) wg.set("private_key", input.privateKey);
      return `wg://${input.serverAddress}:${port}?${wg.toString()}#${label}`;
    }
    case "openvpn":
      return `openvpn://${encodeURIComponent(input.password ?? "")}@${input.serverAddress}:${port}?${params.toString()}#${label}`;
    default:
      return `vless://${encodeURIComponent(input.uuid ?? "")}@${input.serverAddress}:${port}?${params.toString()}#${label}`;
  }
}

/* -------------------------------- redaction ------------------------------- */

const SECRET_PATTERNS: { name: string; re: RegExp; mask: string }[] = [
  {
    name: "uuid",
    re: /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
    mask: "<redacted:uuid>",
  },
  {
    name: "wireguard-key",
    re: /\b[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=\b/g,
    mask: "<redacted:key>",
  },
  {
    name: "jwt",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    mask: "<redacted:jwt>",
  },
  {
    name: "bearer",
    re: /\b(Bearer|Authorization:)\s+[A-Za-z0-9._-]{12,}/gi,
    mask: "$1 <redacted:token>",
  },
  {
    name: "password",
    re: /\b(password|passwd|secret|psk)\s*[=:]\s*("[^"]+"|'[^']+'|\S+)/gi,
    mask: "$1=<redacted:secret>",
  },
  {
    name: "share-link",
    re: /\b(vless|vmess|trojan|ss|hysteria2|hy2|tuic|wg):\/\/[^\s"']+/gi,
    mask: "<redacted:share-link>",
  },
  {
    name: "private-ipv4",
    re: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    mask: "<redacted:lan-ip>",
  },
];

export function redact(text: string): { output: string; count: number; kinds: string[] } {
  let output = text;
  let count = 0;
  const kinds = new Set<string>();
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern.re, (...args) => {
      count += 1;
      kinds.add(pattern.name);
      const groups = args.slice(0, -2) as string[];
      if (pattern.mask.includes("$1") && groups[1]) {
        return pattern.mask.replace("$1", groups[1]);
      }
      return pattern.mask;
    });
  }
  return { output, count, kinds: [...kinds] };
}

export function maskSecret(value?: string | null): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${"•".repeat(Math.min(12, trimmed.length - 8))}${trimmed.slice(-4)}`;
}
