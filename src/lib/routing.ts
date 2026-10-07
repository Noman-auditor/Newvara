import type { RuleLike, RoutingDecision, RoutingTraceStep } from "@/lib/types";

export const GEOIP_TABLE: Record<string, string[]> = {
  ir: [
    "2.144.0.0/13",
    "5.22.0.0/17",
    "31.7.64.0/18",
    "78.38.0.0/15",
    "151.232.0.0/14",
    "185.112.32.0/22",
    "217.218.0.0/15",
  ],
  cn: ["1.0.1.0/24", "14.0.0.0/8", "36.0.0.0/10", "101.0.0.0/9", "223.64.0.0/11"],
  ru: ["5.8.0.0/19", "31.13.144.0/21", "77.88.0.0/18", "95.108.128.0/17", "213.180.192.0/19"],
  de: ["5.9.0.0/16", "46.4.0.0/16", "78.46.0.0/15", "88.198.0.0/16", "128.0.0.0/16"],
  us: ["3.0.0.0/9", "23.0.0.0/11", "34.0.0.0/10", "52.0.0.0/8", "104.16.0.0/12"],
  local: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8"],
};

export const GEOSITE_TABLE: Record<string, string[]> = {
  ads: [
    "doubleclick.net",
    "googlesyndication.com",
    "adservice.google.com",
    "ads.yahoo.com",
    "taboola.com",
    "outbrain.com",
    "criteo.com",
    "adnxs.com",
    "scorecardresearch.com",
    "moatads.com",
  ],
  ir: [
    ".ir",
    "aparat.com",
    "digikala.com",
    "bama.ir",
    "divar.ir",
    "shaparak.ir",
    "irancell.ir",
    "mci.ir",
    "tsetmc.com",
    "zoomit.ir",
  ],
  cn: [".cn", "qq.com", "weibo.com", "baidu.com", "bilibili.com", "taobao.com"],
  streaming: [
    "netflix.com",
    "nflxvideo.net",
    "youtube.com",
    "googlevideo.com",
    "spotify.com",
    "disneyplus.com",
  ],
  dev: ["github.com", "githubusercontent.com", "npmjs.org", "registry.npmjs.org", "docker.io", "ghcr.io"],
  malware: ["malware.test", "phishing.example", "cryptolocker.example", "cnc.badhost.example"],
  private: ["localhost", ".local", ".lan", ".home.arpa", ".internal"],
};

export const RULE_TYPE_META: Record<
  string,
  { label: string; placeholder: string; hint: string; group: "domain" | "network" | "platform" }
> = {
  domain_suffix: {
    label: "Domain suffix",
    placeholder: "example.com",
    hint: "Matches the domain and every subdomain of it.",
    group: "domain",
  },
  domain_keyword: {
    label: "Domain keyword",
    placeholder: "analytics",
    hint: "Substring match anywhere in the hostname.",
    group: "domain",
  },
  domain_full: {
    label: "Domain exact",
    placeholder: "api.example.com",
    hint: "Exact hostname match, no subdomains.",
    group: "domain",
  },
  ip_cidr: {
    label: "IP / CIDR",
    placeholder: "203.0.113.0/24",
    hint: "IPv4 CIDR, IPv6 prefix or single address.",
    group: "network",
  },
  geoip: {
    label: "GeoIP set",
    placeholder: "ir | cn | ru | de | us | local",
    hint: "Bundled demo subset of country prefixes.",
    group: "network",
  },
  geosite: {
    label: "Geosite set",
    placeholder: "ads | ir | cn | streaming | dev | malware | private",
    hint: "Bundled demo domain set.",
    group: "domain",
  },
  port: {
    label: "Port range",
    placeholder: "1-1024 or 443",
    hint: "Matched against the destination port.",
    group: "network",
  },
  process: {
    label: "Process / app",
    placeholder: "com.android.chrome",
    hint: "Per-app split tunneling (Android package or process name).",
    group: "platform",
  },
};

export const GEOIP_KEYS = Object.keys(GEOIP_TABLE);
export const GEOSITE_KEYS = Object.keys(GEOSITE_TABLE);

export const RULE_PRESETS: {
  id: string;
  name: string;
  description: string;
  rules: Omit<RuleLike, "id">[];
}[] = [
  {
    id: "ads-baseline",
    name: "Ad & tracker sinkhole",
    description: "Blocks known ad networks and telemetry endpoints before any proxy decision.",
    rules: [
      { name: "Block ad networks", ruleType: "geosite", value: "ads", action: "block", priority: 10, enabled: true },
      { name: "Block malware C2", ruleType: "geosite", value: "malware", action: "block", priority: 11, enabled: true },
    ],
  },
  {
    id: "iran-split",
    name: "Domestic-direct split",
    description: "Iranian domains and prefixes stay direct, everything else is proxied.",
    rules: [
      { name: "LAN & loopback direct", ruleType: "geoip", value: "local", action: "direct", priority: 20, enabled: true },
      { name: "Domestic geoip direct", ruleType: "geoip", value: "ir", action: "direct", priority: 21, enabled: true },
      { name: "Domestic geosite direct", ruleType: "geosite", value: "ir", action: "direct", priority: 22, enabled: true },
    ],
  },
  {
    id: "dev-routing",
    name: "Dev & registry acceleration",
    description: "Registries and CI hosts always ride the proxy for speed and consistency.",
    rules: [
      { name: "Registries via proxy", ruleType: "geosite", value: "dev", action: "proxy", priority: 30, enabled: true },
      { name: "Block cleartext UDP 53", ruleType: "port", value: "53", action: "block", priority: 31, enabled: true },
    ],
  },
  {
    id: "streaming-split",
    name: "Streaming split",
    description: "Streaming CDNs bypass the tunnel to keep the link free for other traffic.",
    rules: [{ name: "Streaming direct", ruleType: "geosite", value: "streaming", action: "direct", priority: 40, enabled: true }],
  },
];

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

export function matchesCidr(ip: string, cidr: string): boolean {
  const [network, bitsRaw] = cidr.trim().split("/");
  if (network.includes(":")) {
    // IPv6: compare the textual prefix hextet-wise.
    const bits = Number(bitsRaw ?? 128);
    const hextets = Math.ceil(bits / 16);
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .split(":")
        .filter(Boolean)
        .slice(0, hextets)
        .join(":");
    return normalize(ip).startsWith(normalize(network));
  }
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const target = ipToInt(ip);
  const base = ipToInt(network);
  if (target === null || base === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (target & mask) === (base & mask);
}

function matchRule(rule: RuleLike, host: string, ip: string | null, port: number | undefined, app?: string) {
  const value = rule.value.trim().toLowerCase();
  const hostname = host.toLowerCase();
  switch (rule.ruleType) {
    case "domain_full":
      return hostname === value;
    case "domain_suffix":
      return hostname === value.replace(/^\./, "") || hostname.endsWith(value.startsWith(".") ? value : `.${value}`);
    case "domain_keyword":
      return hostname.includes(value);
    case "ip_cidr":
      return ip ? matchesCidr(ip, value) : false;
    case "geoip": {
      const table = GEOIP_TABLE[value];
      if (!table || !ip) return false;
      return table.some((cidr) => matchesCidr(ip, cidr));
    }
    case "geosite": {
      const table = GEOSITE_TABLE[value];
      if (!table) return false;
      return table.some((entry) =>
        entry.startsWith(".") ? hostname.endsWith(entry) : hostname === entry || hostname.endsWith(`.${entry}`),
      );
    }
    case "port": {
      if (port === undefined) return false;
      if (value.includes("-")) {
        const [start, end] = value.split("-").map((n) => Number(n));
        return port >= start && port <= end;
      }
      return port === Number(value);
    }
    case "process":
      return app ? app.toLowerCase().includes(value) : false;
    default:
      return false;
  }
}

/**
 * Evaluates the routing table in priority order and returns the winning decision
 * plus a transparent trace of every layer that was inspected.
 */
export function evaluateRouting(
  host: string,
  options: { rules: RuleLike[]; ip?: string | null; port?: number; app?: string; defaultAction?: string } ,
): RoutingDecision {
  const trace: RoutingTraceStep[] = [];
  const rules = [...options.rules]
    .filter((rule) => rule.enabled)
    .sort((a, b) => a.priority - b.priority);

  trace.push({
    layer: "normalize",
    detail: `host=${host || "—"} ip=${options.ip ?? "unresolved"} port=${options.port ?? "any"} app=${options.app ?? "any"}`,
    result: "skip",
  });

  for (const rule of rules) {
    const matched = matchRule(rule, host, options.ip ?? null, options.port, options.app);
    trace.push({
      layer: `${rule.ruleType}#${rule.priority}`,
      detail: `${rule.name} → ${rule.action} (${rule.value})`,
      result: matched ? "match" : "miss",
    });
    if (matched) {
      return {
        decision: (rule.action as RoutingDecision["decision"]) ?? "proxy",
        reason: `Matched rule "${rule.name}" (${RULE_TYPE_META[rule.ruleType]?.label ?? rule.ruleType})`,
        matchedRule: rule.name,
        matchedPriority: rule.priority,
        trace,
        confidence: rule.ruleType === "domain_full" || rule.ruleType === "ip_cidr" ? 0.98 : 0.82,
      };
    }
  }

  const fallback = (options.defaultAction as RoutingDecision["decision"]) ?? "proxy";
  trace.push({ layer: "default", detail: `No rule matched — falling back to ${fallback}`, result: "skip" });
  return {
    decision: fallback,
    reason: "No rule matched — profile default policy applied",
    matchedRule: null,
    matchedPriority: null,
    trace,
    confidence: 0.5,
  };
}

export function ruleCoverage(rules: RuleLike[]) {
  const byAction: Record<string, number> = { proxy: 0, direct: 0, block: 0 };
  for (const rule of rules) {
    if (rule.enabled) byAction[rule.action] = (byAction[rule.action] ?? 0) + 1;
  }
  return byAction;
}
