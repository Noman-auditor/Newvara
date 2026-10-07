// Shared, runtime-agnostic types for the NORA TUNNEL web control plane.

export type Severity = "critical" | "error" | "warning" | "info";

export type ValidationFinding = {
  code: string;
  severity: Severity;
  field?: string;
  message: string;
  hint?: string;
};

export type ValidationResult = {
  status: "valid" | "warnings" | "invalid";
  score: number;
  findings: ValidationFinding[];
};

export type ProtocolId =
  | "vless"
  | "vmess"
  | "trojan"
  | "shadowsocks"
  | "wireguard"
  | "openvpn"
  | "hysteria2"
  | "tuic";

export type CoreId = "xray" | "sing-box" | "wireguard-go" | "openvpn3";

export type TransportId =
  | "tcp"
  | "ws"
  | "grpc"
  | "httpupgrade"
  | "h2"
  | "quic"
  | "udp"
  | "tls";

export type SecurityLayerId = "none" | "tls" | "reality";

export type BlockingMode = "global" | "rule" | "direct";

export type ProfileDraft = {
  name: string;
  group?: string;
  protocol: string;
  core: string;
  transport: string;
  securityLayer: string;
  serverAddress: string;
  serverPort: number;
  uuid?: string | null;
  password?: string | null;
  publicKey?: string | null;
  privateKey?: string | null;
  presharedKey?: string | null;
  sni?: string | null;
  host?: string | null;
  path?: string | null;
  serviceName?: string | null;
  flow?: string | null;
  fingerprint?: string | null;
  alterId?: number | null;
  encryption?: string | null;
  mtu?: number | null;
  dnsPrimary?: string | null;
  dnsSecondary?: string | null;
  allowedIps?: string | null;
  keepalive?: number | null;
  blockingMode?: string;
  killSwitch?: boolean;
  notes?: string | null;
  shareLink?: string | null;
  rawConfig?: Record<string, unknown> | null;
};

export type ProbeStage = {
  stage: string;
  label: string;
  status: "ok" | "fail" | "skip";
  durationMs: number;
  detail?: string;
  meta?: Record<string, unknown>;
};

export type DiagnosticPayload = {
  kind: DiagnosticKind;
  target: string;
  status: "ok" | "fail";
  stages: ProbeStage[];
  metrics: Record<string, number | string>;
  notes: string[];
};

export type DiagnosticKind =
  | "dns"
  | "tcp"
  | "tls"
  | "http"
  | "latency"
  | "path"
  | "egress";

export type BandwidthSample = {
  t: number;
  rx: number;
  tx: number;
  latency: number;
};

export type RuleType =
  | "domain_suffix"
  | "domain_keyword"
  | "domain_full"
  | "ip_cidr"
  | "geoip"
  | "geosite"
  | "port"
  | "process";

export type RuleAction = "proxy" | "direct" | "block";

export type RuleLike = {
  id?: number;
  name: string;
  ruleType: string;
  value: string;
  action: string;
  priority: number;
  enabled: boolean;
};

export type RoutingTraceStep = {
  layer: string;
  detail: string;
  result: "match" | "miss" | "skip";
};

export type RoutingDecision = {
  decision: RuleAction;
  reason: string;
  matchedRule: string | null;
  matchedPriority: number | null;
  trace: RoutingTraceStep[];
  confidence: number;
};
