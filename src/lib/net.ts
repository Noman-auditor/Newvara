import { Resolver } from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import type { DiagnosticKind, DiagnosticPayload, ProfileDraft, ProbeStage } from "@/lib/types";

const DEFAULT_TIMEOUT = 3500;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Sub-millisecond precision so fast datacentre probes do not read as 0ms. */
function precise(ms: number): number {
  return Math.round(ms * 10) / 10;
}

function flatten(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, durationMs: Math.round(performance.now() - start) };
}

export type DnsAnswers = {
  ok: boolean;
  durationMs: number;
  ipv4: string[];
  ipv6: string[];
  cname: string[];
  txt: string[];
  via: string;
  error?: string;
};

export async function dnsProbe(host: string, resolvers: string[] = []): Promise<DnsAnswers> {
  const start = performance.now();
  const usable = resolvers.filter(Boolean);

  const query = async (via: string[]) => {
    const resolver = new Resolver();
    if (via.length) {
      try {
        resolver.setServers(via);
      } catch {
        /* keep system resolvers */
      }
    }
    const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await withTimeout(fn(), DEFAULT_TIMEOUT, "DNS query");
      } catch {
        return fallback;
      }
    };
    const [ipv4, ipv6, cname, txt] = await Promise.all([
      safe(() => resolver.resolve4(host), [] as string[]),
      safe(() => resolver.resolve6(host), [] as string[]),
      safe(() => resolver.resolveCname(host), [] as string[]),
      safe(() => resolver.resolveTxt(host).then((rows) => rows.map((row) => row.join(""))), [] as string[]),
    ]);
    return { ipv4, ipv6, cname, txt };
  };

  const label = usable.length ? usable.join(", ") : "system resolver";
  let answers = await query(usable);
  let via = label;
  let fallbackNote: string | undefined;

  if (answers.ipv4.length + answers.ipv6.length === 0 && usable.length) {
    const system = await query([]);
    if (system.ipv4.length + system.ipv6.length > 0) {
      answers = system;
      via = `system resolver (fallback: ${label} did not answer)`;
      fallbackNote = `Configured resolvers (${label}) returned no answers — the system resolver was used instead.`;
    }
  }

  const ok = answers.ipv4.length + answers.ipv6.length > 0;
  return {
    ok,
    durationMs: Math.round(performance.now() - start),
    ipv4: answers.ipv4,
    ipv6: answers.ipv6,
    cname: answers.cname,
    txt: answers.txt.slice(0, 4),
    via,
    error: ok ? fallbackNote : `NXDOMAIN or unreachable resolver (${label})`,
  };
}

export type TcpResult = {
  ok: boolean;
  durationMs: number;
  ip?: string;
  family?: string;
  error?: string;
};

export async function tcpProbe(host: string, port: number, timeout = DEFAULT_TIMEOUT): Promise<TcpResult> {
  const start = performance.now();
  return new Promise<TcpResult>((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result: TcpResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () =>
      finish({
        ok: true,
        durationMs: precise(performance.now() - start),
        ip: socket.remoteAddress ?? undefined,
        family: String(socket.remoteFamily ?? ""),
      }),
    );
    socket.once("timeout", () => finish({ ok: false, durationMs: timeout, error: `timeout after ${timeout}ms` }));
    socket.once("error", (error: Error) =>
      finish({ ok: false, durationMs: precise(performance.now() - start), error: error.message }),
    );
  });
}

export type TlsResult = {
  ok: boolean;
  durationMs: number;
  protocol?: string;
  cipher?: string;
  alpn?: string;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  chainLength?: number;
  error?: string;
};

export async function tlsProbe(host: string, port: number, servername?: string, timeout = DEFAULT_TIMEOUT): Promise<TlsResult> {
  const start = performance.now();
  return new Promise<TlsResult>((resolve) => {
    let settled = false;
    const socket = tls.connect(
      {
        host,
        port,
        servername: servername || (host.match(/[a-zA-Z]/) ? host : undefined),
        rejectUnauthorized: false,
        timeout,
      },
      () => undefined,
    );
    const finish = (result: TlsResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate(true);
      const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
      finish({
        ok: true,
        durationMs: Math.round(performance.now() - start),
        protocol: socket.getProtocol() ?? undefined,
        cipher: socket.getCipher()?.name,
        alpn: socket.alpnProtocol || undefined,
        subject: flatten(cert?.subject?.CN),
        issuer: flatten(cert?.issuer?.O) ?? flatten(cert?.issuer?.CN),
        validFrom: cert?.valid_from,
        validTo: cert?.valid_to,
        daysRemaining: validTo ? Math.round((validTo.getTime() - Date.now()) / 86_400_000) : undefined,
        chainLength: Object.keys(cert?.issuerCertificate ?? {}).length ? 2 : 1,
      });
    });
    socket.once("timeout", () => finish({ ok: false, durationMs: timeout, error: `TLS timeout after ${timeout}ms` }));
    socket.once("error", (error: Error) =>
      finish({ ok: false, durationMs: Math.round(performance.now() - start), error: error.message }),
    );
  });
}

export async function httpProbe(
  host: string,
  port: number,
  path = "/",
  secure = true,
  timeout = 4000,
): Promise<{ ok: boolean; status?: number; durationMs: number; server?: string; headers?: Record<string, string>; error?: string }> {
  const url = `${secure ? "https" : "http"}://${host}:${port}${path.startsWith("/") ? path : `/${path}`}`;
  const start = performance.now();
  try {
    const response = await withTimeout(fetch(url, { method: "GET", redirect: "manual" }), timeout, "HTTP request");
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (["server", "content-type", "cf-ray", "alt-svc", "via"].includes(key)) headers[key] = value;
    });
    return {
      ok: response.status < 500,
      status: response.status,
      durationMs: Math.round(performance.now() - start),
      server: response.headers.get("server") ?? undefined,
      headers,
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : "request failed",
    };
  }
}

export async function latencySweep(host: string, port: number, samples = 5) {
  const values: number[] = [];
  let loss = 0;
  for (let index = 0; index < samples; index += 1) {
    const probe = await tcpProbe(host, port, 2500);
    if (probe.ok) values.push(probe.durationMs);
    else loss += 1;
  }
  if (!values.length) {
    return { ok: false, min: 0, avg: 0, max: 0, jitter: 0, loss, samples: [] as number[], reachable: false };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const jitter = max - min;
  return {
    ok: true,
    min,
    avg: Math.round(avg * 10) / 10,
    max,
    jitter: Math.round(jitter * 10) / 10,
    loss,
    samples: values,
    reachable: true,
  };
}

export async function egressProbe(): Promise<{
  ok: boolean;
  ip?: string;
  colo?: string;
  country?: string;
  durationMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const response = await withTimeout(fetch("https://www.cloudflare.com/cdn-cgi/trace"), 4000, "egress trace");
    const body = await response.text();
    const map = Object.fromEntries(
      body
        .split("\n")
        .map((line) => line.split("="))
        .filter((pair) => pair.length === 2),
    ) as Record<string, string>;
    return {
      ok: true,
      ip: map.ip,
      colo: map.colo,
      country: map.loc,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    try {
      const response = await withTimeout(fetch("https://api.ipify.org?format=json"), 3000, "egress ip");
      const json = (await response.json()) as { ip?: string };
      return { ok: true, ip: json.ip, durationMs: Math.round(performance.now() - start) };
    } catch (inner) {
      return {
        ok: false,
        durationMs: Math.round(performance.now() - start),
        error: inner instanceof Error ? inner.message : error instanceof Error ? error.message : "no egress",
      };
    }
  }
}

function stage(
  id: string,
  label: string,
  status: ProbeStage["status"],
  durationMs: number,
  detail?: string,
  meta?: Record<string, unknown>,
): ProbeStage {
  return { stage: id, label, status, durationMs, detail, meta };
}

export type ProbeTarget = Pick<
  ProfileDraft,
  "serverAddress" | "serverPort" | "securityLayer" | "sni" | "host" | "path" | "protocol" | "core" | "transport"
> & { dnsPrimary?: string | null; dnsSecondary?: string | null; name?: string };

/** Runs the full control-plane diagnostic pipeline against a target. */
export async function runDiagnostic(kind: DiagnosticKind, target: ProbeTarget): Promise<DiagnosticPayload> {
  const host = target.serverAddress;
  const port = target.serverPort || 443;
  const stages: ProbeStage[] = [];
  const metrics: Record<string, number | string> = {};
  const notes: string[] = [];
  const resolvers = [target.dnsPrimary, target.dnsSecondary].filter(Boolean) as string[];

  const { result: dns } = await timed(() => dnsProbe(host, resolvers.length ? resolvers : []));
  stages.push(
    stage(
      "dns",
      `DNS resolve ${host}`,
      dns.ok ? "ok" : "fail",
      dns.durationMs,
      dns.ok ? `${dns.ipv4.concat(dns.ipv6).slice(0, 3).join(", ")} via ${dns.via}` : dns.error,
      { ipv4: dns.ipv4, ipv6: dns.ipv6, via: dns.via },
    ),
  );
  metrics.dnsMs = dns.durationMs;
  const isLiteralIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const resolvedIp = dns.ipv4[0] ?? (isLiteralIp ? host : undefined);

  if (kind === "dns") {
    return {
      kind,
      target: `${host}`,
      status: dns.ok ? "ok" : "fail",
      stages,
      metrics,
      notes: dns.ok ? ["Answers cached by the control plane, TTL respected."] : ["Resolver did not answer."],
    };
  }

  const { result: tcp } = await timed(() => tcpProbe(host, port));
  stages.push(
    stage(
      "tcp",
      `TCP handshake ${host}:${port}`,
      tcp.ok ? "ok" : "fail",
      tcp.durationMs,
      tcp.ok ? `connected to ${tcp.ip} (${tcp.family})` : tcp.error,
      { ip: tcp.ip },
    ),
  );
  metrics.tcpMs = tcp.durationMs;
  if (tcp.ip) metrics.endpointIp = tcp.ip;

  if (kind === "tcp") {
    return {
      kind,
      target: `${host}:${port}`,
      status: tcp.ok ? "ok" : "fail",
      stages,
      metrics,
      notes: [tcp.ok ? "Endpoint accepted a raw TCP connection." : "No path to the endpoint from this control plane."],
    };
  }

  const needsTls = target.securityLayer && target.securityLayer !== "none";
  if (needsTls && tcp.ok) {
    const { result: tls_ } = await timed(() => tlsProbe(host, port, target.sni ?? undefined));
    stages.push(
      stage(
        "tls",
        `TLS handshake (SNI ${target.sni ?? host})`,
        tls_.ok ? "ok" : "fail",
        tls_.durationMs,
        tls_.ok
          ? `${tls_.protocol} · ${tls_.cipher} · cert ${tls_.issuer} · ${tls_.daysRemaining ?? "?"}d left`
          : tls_.error,
        { subject: tls_.subject, issuer: tls_.issuer, alpn: tls_.alpn },
      ),
    );
    metrics.tlsMs = tls_.durationMs;
    if (tls_.protocol) metrics.tlsVersion = tls_.protocol;
    if (tls_.daysRemaining !== undefined) metrics.certDaysRemaining = tls_.daysRemaining;
    if (tls_.daysRemaining !== undefined && tls_.daysRemaining < 14) {
      notes.push("Certificate expires in under two weeks — renew before it breaks the profile.");
    }
  } else if (needsTls) {
    stages.push(stage("tls", "TLS handshake", "skip", 0, "skipped: endpoint unreachable"));
  } else {
    stages.push(
      stage(
        "tls",
        "TLS handshake",
        target.securityLayer === "none" ? "skip" : "ok",
        0,
        target.securityLayer === "none"
          ? "Skipped: profile runs plaintext (WireGuard / Shadowsocks handle their own crypto)."
          : "Skipped",
      ),
    );
  }

  if (kind === "tls") {
    return {
      kind,
      target: `${host}:${port}`,
      status: tcp.ok ? "ok" : "fail",
      stages,
      metrics,
      notes,
    };
  }

  if (kind === "http" || kind === "path") {
    const { result: http } = await timed(() =>
      httpProbe(host, port, target.path || "/", target.securityLayer !== "none"),
    );
    stages.push(
      stage(
        "http",
        `HTTP probe ${target.securityLayer !== "none" ? "https" : "http"}://${host}:${port}${target.path || "/"}`,
        http.ok ? "ok" : "fail",
        http.durationMs,
        http.status ? `${http.status} · server=${http.server ?? "unknown"}` : http.error,
        http.headers,
      ),
    );
    metrics.httpMs = http.durationMs;
    if (http.status) metrics.httpStatus = http.status;
    if (http.status === 400 || http.status === 404) {
      notes.push("HTTP layer answered, which is expected for non-HTTP tunnel transports.");
    }
  }

  if (kind === "http") {
    return {
      kind,
      target: `${host}:${port}`,
      status: tcp.ok ? "ok" : "fail",
      stages,
      metrics,
      notes,
    };
  }

  const latency = await latencySweep(host, port, kind === "latency" ? 6 : 3);
  stages.push(
    stage(
      "latency",
      "Latency sweep",
      latency.ok ? "ok" : "fail",
      latency.avg,
      latency.ok
        ? `min ${latency.min}ms · avg ${latency.avg}ms · max ${latency.max}ms · jitter ${latency.jitter}ms`
        : "no successful samples",
      { samples: latency.samples },
    ),
  );
  metrics.latencyMin = latency.min;
  metrics.latencyAvg = latency.avg;
  metrics.latencyMax = latency.max;
  metrics.jitterMs = latency.jitter;
  metrics.packetLoss = latency.loss;

  if (kind === "latency") {
    return {
      kind,
      target: `${host}:${port}`,
      status: latency.ok ? "ok" : "fail",
      stages,
      metrics,
      notes: [
        "Round-trip times measured from the control plane host, not from your phone.",
        "Jitter above 40ms will hurt realtime audio and game traffic.",
      ],
    };
  }

  if (kind === "egress") {
    const { result: egress } = await timed(() => egressProbe());
    stages.push(
      stage(
        "egress",
        "Egress identity check",
        egress.ok ? "ok" : "fail",
        egress.durationMs,
        egress.ok ? `visible as ${egress.ip}${egress.country ? ` (${egress.country})` : ""}${egress.colo ? ` via ${egress.colo}` : ""}` : egress.error,
      ),
    );
    metrics.egressIp = egress.ip ?? "unavailable";
    if (egress.country) metrics.egressCountry = egress.country;
    notes.push("Leak test: this is the address a remote peer sees for this control plane right now.");
    return {
      kind,
      target: "egress identity",
      status: egress.ok ? "ok" : "fail",
      stages,
      metrics,
      notes,
    };
  }

  const routeCount = (target.core ?? "").length + (target.transport ?? "").length;
  if (resolvedIp && tcp.ok) {
    metrics.endpointIp = tcp.ip ?? resolvedIp;
  }
  return {
    kind,
    target: `${host}:${port}`,
    status: tcp.ok ? "ok" : "fail",
    stages,
    metrics,
    notes: [
      ...notes,
      `Control-plane path: DNS → TCP → ${target.securityLayer === "none" ? "no TLS layer" : "TLS"} → ${target.transport} transport on ${target.core}.`,
      "No packet egress is generated by this web control plane: probes are real connection attempts to the configured endpoint only.",
      `Transport hint signature length: ${routeCount}`,
    ],
  };
}
