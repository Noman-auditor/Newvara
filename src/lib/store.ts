import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  diagnostics,
  logs,
  notifications,
  profiles,
  routingRules,
  runtime,
  sessions,
  settings,
  speedTests,
  type DiagnosticRow,
  type LogRow,
  type ProfileRow,
  type RoutingRuleRow,
  type RuntimeRow,
  type SessionRow,
  type SettingsRow,
} from "@/db/schema";
import { clamp, deterministicSeed } from "@/lib/format";
import { dnsProbe, egressProbe, latencySweep, runDiagnostic, tcpProbe, tlsProbe } from "@/lib/net";
import { buildShareLink, parseShareLink, redact, validateProfile } from "@/lib/protocols";
import { evaluateRouting, RULE_PRESETS } from "@/lib/routing";
import { inArray } from "drizzle-orm";
import type { BandwidthSample, DiagnosticKind, DiagnosticPayload, ProfileDraft, RuleLike } from "@/lib/types";

export type { RuleLike };

const BYTE_CAP = 2_000_000_000;

/* --------------------------------- seeding -------------------------------- */

let seedPromise: Promise<void> | null = null;
let seedError: string | null = null;

export function getSeedState(): { tried: boolean; error: string | null } {
  return { tried: seedPromise !== null, error: seedError };
}

export function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedInternal().catch((error: unknown) => {
      seedPromise = null;
      seedError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error("[nora] seed failed:", seedError);
    });
  }
  return seedPromise;
}

const SEED_PROFILES: (ProfileDraft & { favorite?: boolean; group: string })[] = [
  {
    name: "Zurich Reality Edge",
    group: "NORA Core",
    protocol: "vless",
    core: "xray",
    transport: "tcp",
    securityLayer: "reality",
    serverAddress: "1.1.1.1",
    serverPort: 443,
    uuid: "6f4c1c9a-2f1b-4a55-9b37-4d9c1f6ab210",
    publicKey: "2Z6O0k4PmQ0lRq0oM3H1sYw5d8g2Vv7Jx4Bn9Tt1CeA=",
    sni: "www.cloudflare.com",
    fingerprint: "chrome",
    flow: "xtls-rprx-vision",
    mtu: 1500,
    dnsPrimary: "1.1.1.1",
    dnsSecondary: "1.0.0.1",
    killSwitch: true,
    notes: "XTLS-Reality fronting Cloudflare. Borrowed certificate, no SNI leak in the clear.",
    favorite: true,
  },
  {
    name: "Helsinki WireGuard Node",
    group: "NORA Core",
    protocol: "wireguard",
    core: "wireguard-go",
    transport: "udp",
    securityLayer: "none",
    serverAddress: "162.159.192.1",
    serverPort: 2408,
    publicKey: "bmV0X25vcmFfd2lyZWd1YXJkX3BlZXJfa2V5XzAwMDA=",
    privateKey: "cHJpdmF0ZV9ub3JhX2tleV9kZW1vXzAwMDAwMDAwMDAw",
    allowedIps: "0.0.0.0/0, ::/0",
    mtu: 1420,
    dnsPrimary: "1.1.1.1",
    dnsSecondary: "1.0.0.1",
    notes: "UDP-only WireGuard endpoint. TCP control-plane probes are expected to report unreachable.",
  },
  {
    name: "Amsterdam gRPC Relay",
    group: "NORA Core",
    protocol: "trojan",
    core: "xray",
    transport: "grpc",
    securityLayer: "tls",
    serverAddress: "www.cloudflare.com",
    serverPort: 443,
    password: "nora-demo-grpc-secret-2026",
    serviceName: "nora-grpc-edge",
    sni: "www.cloudflare.com",
    dnsPrimary: "9.9.9.9",
    dnsSecondary: "149.112.112.112",
    notes: "HTTP/2 gRPC tunnel. Great behind strict firewalls, poor under packet loss.",
    favorite: true,
  },
  {
    name: "Tokyo WebSocket CDN",
    group: "Personal",
    protocol: "vmess",
    core: "xray",
    transport: "ws",
    securityLayer: "tls",
    serverAddress: "one.one.one.one",
    serverPort: 443,
    uuid: "b7d2a4d1-8c33-4d9a-9f1e-6f3a2c8e77bb",
    alterId: 0,
    host: "one.one.one.one",
    path: "/nora-ws",
    sni: "one.one.one.one",
    notes: "CDN-fronted WebSocket transport, path-routed through the edge.",
  },
  {
    name: "Frankfurt Hysteria2",
    group: "Personal",
    protocol: "hysteria2",
    core: "sing-box",
    transport: "quic",
    securityLayer: "tls",
    serverAddress: "dns.google",
    serverPort: 443,
    password: "hy2-nora-demo-passphrase",
    sni: "dns.google",
    notes: "QUIC transport with brutal congestion control available. Watch UDP blocking.",
  },
  {
    name: "Marseille Shadowsocks",
    group: "Lab",
    protocol: "shadowsocks",
    core: "sing-box",
    transport: "tcp",
    securityLayer: "none",
    serverAddress: "1.0.0.1",
    serverPort: 8388,
    password: "ss-nora-demo-passphrase",
    encryption: "aes-256-gcm",
    notes: "AEAD-only cipher. Never wrap in an extra TLS layer.",
  },
  {
    name: "NoraLab Loopback",
    group: "Lab",
    protocol: "openvpn",
    core: "openvpn3",
    transport: "udp",
    securityLayer: "tls",
    serverAddress: "127.0.0.1",
    serverPort: 1194,
    password: "loopback-lab-secret",
    notes: "Loopback endpoint for state-machine testing. No real tunnel is established.",
  },
];

const SEED_RULES: Omit<RuleLike, "id">[] = [
  { name: "Local hostnames direct", ruleType: "domain_suffix", value: "nora.local", action: "direct", priority: 5, enabled: true },
  ...RULE_PRESETS.flatMap((preset) => preset.rules),
  { name: "Banking apps direct", ruleType: "process", value: "com.bank", action: "direct", priority: 25, enabled: true },
  { name: "Block abuse tracker", ruleType: "domain_keyword", value: "telemetry", action: "block", priority: 12, enabled: false },
];

async function seedInternal(): Promise<void> {
  const existing = await db.select({ id: settings.id }).from(settings).limit(1);
  if (existing.length) return;

  const config = await db.select({ id: runtime.id }).from(runtime).limit(1);
  if (!config.length) {
    await db.insert(runtime).values({ id: 1 }).onConflictDoNothing();
  }
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  await db.insert(routingRules).values(SEED_RULES.map((rule) => ({ ...rule, category: "preset" })));

  const insertedProfiles: ProfileRow[] = [];
  for (const draft of SEED_PROFILES) {
    const validation = validateProfile(draft);
    const [row] = await db
      .insert(profiles)
      .values({
        name: draft.name,
        group: draft.group,
        protocol: draft.protocol,
        core: draft.core,
        transport: draft.transport,
        securityLayer: draft.securityLayer,
        serverAddress: draft.serverAddress,
        serverPort: draft.serverPort,
        uuid: draft.uuid ?? null,
        password: draft.password ?? null,
        publicKey: draft.publicKey ?? null,
        privateKey: draft.privateKey ?? null,
        presharedKey: draft.presharedKey ?? null,
        sni: draft.sni ?? null,
        host: draft.host ?? null,
        path: draft.path ?? null,
        serviceName: draft.serviceName ?? null,
        flow: draft.flow ?? null,
        fingerprint: draft.fingerprint ?? "chrome",
        alterId: draft.alterId ?? 0,
        encryption: draft.encryption ?? null,
        mtu: draft.mtu ?? 1420,
        dnsPrimary: draft.dnsPrimary ?? "1.1.1.1",
        dnsSecondary: draft.dnsSecondary ?? "1.0.0.1",
        allowedIps: draft.allowedIps ?? "0.0.0.0/0, ::/0",
        keepalive: draft.keepalive ?? 25,
        blockingMode: draft.blockingMode ?? "rule",
        killSwitch: draft.killSwitch ?? true,
        favorite: "favorite" in draft ? Boolean(draft.favorite) : false,
        notes: draft.notes ?? null,
        shareLink: buildShareLink(draft),
        validationStatus: validation.status,
        validationScore: validation.score,
        validationFindings: validation.findings,
        validatedAt: new Date(),
      })
      .returning();
    insertedProfiles.push(row);
  }

  const now = Date.now();
  const historyPlan = [
    { profile: insertedProfiles[0], offsetHours: 26, duration: 4380, latency: 42, rx: 812_000_000, tx: 96_000_000 },
    { profile: insertedProfiles[2], offsetHours: 7, duration: 1860, latency: 118, rx: 264_000_000, tx: 41_000_000 },
    { profile: insertedProfiles[3], offsetHours: 3, duration: 720, latency: 176, rx: 88_400_000, tx: 12_100_000 },
    { profile: insertedProfiles[4], offsetHours: 1, duration: 348, latency: 64, rx: 31_700_000, tx: 4_400_000 },
  ];

  for (const plan of historyPlan) {
    if (!plan.profile) continue;
    const seed = deterministicSeed(plan.profile.id * 977 + plan.duration);
    const sampleCount = 18;
    const samples: BandwidthSample[] = Array.from({ length: sampleCount }, (_, index) => {
      const wave = 0.55 + 0.45 * Math.sin((index / sampleCount) * Math.PI * 3);
      const rx = Math.round((plan.rx / plan.duration) * wave * (0.85 + seed() * 0.3));
      return {
        t: now - (plan.offsetHours * 3_600_000) + index * ((plan.duration * 1000) / sampleCount),
        rx,
        tx: Math.round(rx * 0.18),
        latency: Math.round(plan.latency * (0.9 + seed() * 0.25)),
      };
    });
    await db.insert(sessions).values({
      profileId: plan.profile.id,
      profileName: plan.profile.name,
      state: "closed",
      startedAt: new Date(now - plan.offsetHours * 3_600_000),
      endedAt: new Date(now - plan.offsetHours * 3_600_000 + plan.duration * 1000),
      durationSec: plan.duration,
      rxBytes: plan.rx,
      txBytes: plan.tx,
      latencyMs: plan.latency,
      jitterMs: Math.round((4 + seed() * 22) * 10) / 10,
      handshakeMs: Math.round(420 + seed() * 1600),
      exitIp: "203.0.113.24",
      endpointIp: plan.profile.serverAddress,
      samples,
      transportSnapshot: `${plan.profile.core}/${plan.profile.transport}`,
      note: "Seeded history record so charts and aggregates have a baseline.",
    });
  }

  await db.insert(logs).values([
    { level: "info", scope: "bootstrap", message: "Workspace initialised with seeded control-plane history.", redactions: 0 },
    { level: "audit", scope: "validator", message: "7 demo profiles normalised and structurally validated (no commands executed).", redactions: 0 },
    { level: "info", scope: "routing", message: `${SEED_RULES.length} routing rules compiled into the decision table.`, redactions: 0 },
    { level: "warn", scope: "core", message: "Data plane not attached in this web build: byte counters are control-plane telemetry samples.", redactions: 0 },
    { level: "info", scope: "security", message: "Secret redaction active: UUIDs, keys, share links and bearer tokens are masked before storage.", redactions: 0 },
  ]);
}

/* --------------------------------- helpers -------------------------------- */

export function toDraft(profile: ProfileRow): ProfileDraft {
  return {
    name: profile.name,
    group: profile.group,
    protocol: profile.protocol,
    core: profile.core,
    transport: profile.transport,
    securityLayer: profile.securityLayer,
    serverAddress: profile.serverAddress,
    serverPort: profile.serverPort,
    uuid: profile.uuid,
    password: profile.password,
    publicKey: profile.publicKey,
    privateKey: profile.privateKey,
    presharedKey: profile.presharedKey,
    sni: profile.sni,
    host: profile.host,
    path: profile.path,
    serviceName: profile.serviceName,
    flow: profile.flow,
    fingerprint: profile.fingerprint,
    alterId: profile.alterId,
    encryption: profile.encryption,
    mtu: profile.mtu,
    dnsPrimary: profile.dnsPrimary,
    dnsSecondary: profile.dnsSecondary,
    allowedIps: profile.allowedIps,
    keepalive: profile.keepalive,
    blockingMode: profile.blockingMode,
    killSwitch: profile.killSwitch,
    notes: profile.notes,
    shareLink: profile.shareLink,
  };
}

function draftToColumns(draft: ProfileDraft) {
  const validation = validateProfile(draft);
  return {
    profileValues: {
      name: draft.name.trim(),
      group: (draft.group ?? "Default").trim() || "Default",
      protocol: draft.protocol,
      core: draft.core,
      transport: draft.transport,
      securityLayer: draft.securityLayer,
      serverAddress: draft.serverAddress.trim(),
      serverPort: Number(draft.serverPort) || 0,
      uuid: draft.uuid?.trim() || null,
      password: draft.password?.trim() || null,
      publicKey: draft.publicKey?.trim() || null,
      privateKey: draft.privateKey?.trim() || null,
      presharedKey: draft.presharedKey?.trim() || null,
      sni: draft.sni?.trim() || null,
      host: draft.host?.trim() || null,
      path: draft.path?.trim() || null,
      serviceName: draft.serviceName?.trim() || null,
      flow: draft.flow?.trim() || null,
      fingerprint: draft.fingerprint ?? "chrome",
      alterId: draft.alterId ?? 0,
      encryption: draft.encryption?.trim() || null,
      mtu: draft.mtu ?? 1420,
      dnsPrimary: draft.dnsPrimary ?? "1.1.1.1",
      dnsSecondary: draft.dnsSecondary ?? "1.0.0.1",
      allowedIps: draft.allowedIps ?? "0.0.0.0/0, ::/0",
      keepalive: draft.keepalive ?? 25,
      blockingMode: draft.blockingMode ?? "rule",
      killSwitch: draft.killSwitch ?? true,
      notes: draft.notes ?? null,
      shareLink: buildShareLink({ ...draft, serverPort: Number(draft.serverPort) || 0 }),
      validationStatus: validation.status,
      validationScore: validation.score,
      validationFindings: validation.findings,
      validatedAt: new Date(),
      updatedAt: new Date(),
    },
    validation,
  };
}

/* --------------------------------- settings -------------------------------- */

export async function getSettings(): Promise<SettingsRow> {
  await ensureSeed();
  const rows = await db.select().from(settings).limit(1);
  if (rows.length) return rows[0];
  const [created] = await db.insert(settings).values({ id: 1 }).returning();
  return created;
}

export async function updateSettings(patch: Partial<SettingsRow>): Promise<SettingsRow> {
  await getSettings();
  const [row] = await db
    .update(settings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(settings.id, 1))
    .returning();
  return row;
}

/* ---------------------------------- logs ---------------------------------- */

export async function writeLog(input: {
  level?: "debug" | "info" | "warn" | "error" | "audit";
  scope?: string;
  message: string;
  meta?: Record<string, unknown>;
  sessionId?: number | null;
}): Promise<void> {
  const config = await getSettings();
  const source = input.meta ? `${input.message} ${JSON.stringify(input.meta)}` : input.message;
  const result = config.redactSecrets ? redact(source) : { output: source, count: 0 };
  const [row] = await db
    .insert(logs)
    .values({
      level: input.level ?? "info",
      scope: input.scope ?? "core",
      message: result.output.slice(0, 600),
      meta: input.meta ?? null,
      sessionId: input.sessionId ?? null,
      redactions: result.count,
    })
    .returning();
  await db.execute(sql`delete from nora_logs where id < ${row.id - 3000}`);
}

export async function listLogs(options: { level?: string; scope?: string; q?: string; limit?: number } = {}) {
  await ensureSeed();
  const limit = options.limit ?? 120;
  const filters = [];
  if (options.level && options.level !== "all") filters.push(eq(logs.level, options.level));
  if (options.scope && options.scope !== "all") filters.push(eq(logs.scope, options.scope));
  if (options.q) filters.push(ilike(logs.message, `%${options.q}%`));
  const rows = filters.length
    ? await db.select().from(logs).where(and(...filters)).orderBy(desc(logs.createdAt)).limit(limit)
    : await db.select().from(logs).orderBy(desc(logs.createdAt)).limit(limit);
  return rows;
}

export async function logScopes(): Promise<string[]> {
  await ensureSeed();
  const rows = await db.selectDistinct({ scope: logs.scope }).from(logs);
  return rows.map((row) => row.scope);
}

export async function clearLogs(scope?: string): Promise<number> {
  const result = scope && scope !== "all"
    ? await db.delete(logs).where(eq(logs.scope, scope)).returning({ id: logs.id })
    : await db.delete(logs).returning({ id: logs.id });
  return result.length;
}

/* -------------------------------- profiles -------------------------------- */

export async function listProfiles(options: { q?: string; group?: string; favorites?: boolean } = {}) {
  await ensureSeed();
  const filters = [];
  if (options.q) {
    filters.push(
      or(ilike(profiles.name, `%${options.q}%`), ilike(profiles.serverAddress, `%${options.q}%`)),
    );
  }
  if (options.group && options.group !== "all") filters.push(eq(profiles.group, options.group));
  if (options.favorites) filters.push(eq(profiles.favorite, true));
  const rows = filters.length
    ? await db.select().from(profiles).where(and(...filters)).orderBy(desc(profiles.favorite), profiles.name)
    : await db.select().from(profiles).orderBy(desc(profiles.favorite), profiles.name);
  return rows;
}

export async function getProfile(id: number): Promise<ProfileRow | null> {
  await ensureSeed();
  const rows = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function profileGroups(): Promise<string[]> {
  await ensureSeed();
  const rows = await db.selectDistinct({ group: profiles.group }).from(profiles);
  return rows.map((row) => row.group).sort();
}

export async function createProfile(draft: ProfileDraft): Promise<{ row: ProfileRow; validation: ReturnType<typeof validateProfile> }> {
  const { profileValues, validation } = draftToColumns(draft);
  const [row] = await db.insert(profiles).values(profileValues).returning();
  await writeLog({
    level: validation.status === "invalid" ? "warn" : "audit",
    scope: "validator",
    message: `Profile "${row.name}" created (${validation.status}, score ${validation.score}).`,
    meta: { profileId: row.id, findings: validation.findings.map((f) => f.code) },
  });
  return { row, validation };
}

export async function updateProfile(id: number, draft: ProfileDraft) {
  const { profileValues, validation } = draftToColumns(draft);
  const [row] = await db.update(profiles).set(profileValues).where(eq(profiles.id, id)).returning();
  if (row) {
    await writeLog({
      level: "audit",
      scope: "validator",
      message: `Profile "${row.name}" re-validated (${validation.status}, score ${validation.score}).`,
      meta: { profileId: id },
    });
  }
  return { row, validation };
}

export async function patchProfile(id: number, patch: Partial<ProfileRow>) {
  const [row] = await db.update(profiles).set({ ...patch, updatedAt: new Date() }).where(eq(profiles.id, id)).returning();
  return row ?? null;
}

export async function deleteProfile(id: number) {
  const rows = await db.delete(profiles).where(eq(profiles.id, id)).returning();
  if (rows[0]) {
    await writeLog({ level: "warn", scope: "validator", message: `Profile "${rows[0].name}" deleted.`, meta: { profileId: id } });
  }
  return rows[0] ?? null;
}

export async function importProfiles(
  input: string,
  options: { group?: string; commit?: boolean } = {},
): Promise<
  {
    origin: string;
    ok: boolean;
    error?: string;
    name?: string;
    protocol?: string;
    status?: string;
    score?: number;
    findings?: { code: string; severity: string; message: string }[];
    profileId?: number;
    warnings?: string[];
  }[]
> {
  const chunks = input
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const results = [];
  for (const chunk of chunks) {
    const parsed = parseShareLink(chunk);
    if (!parsed.ok) {
      results.push({ origin: parsed.origin, ok: false, error: parsed.error });
      continue;
    }
    const draft: ProfileDraft = {
      name: parsed.draft.name ?? "Imported profile",
      group: options.group ?? "Imported",
      protocol: parsed.draft.protocol ?? "vless",
      core: parsed.draft.core ?? "xray",
      transport: parsed.draft.transport ?? "tcp",
      securityLayer: parsed.draft.securityLayer ?? "tls",
      serverAddress: parsed.draft.serverAddress ?? "",
      serverPort: Number(parsed.draft.serverPort ?? 443),
      ...parsed.draft,
    } as ProfileDraft;

    const validation = validateProfile(draft);
    if (options.commit && validation.status !== "invalid") {
      const { row } = await createProfile(draft);
      results.push({
        origin: parsed.origin,
        ok: true,
        name: row.name,
        protocol: row.protocol,
        status: validation.status,
        score: validation.score,
        findings: validation.findings.map((f) => ({ code: f.code, severity: f.severity, message: f.message })),
        profileId: row.id,
        warnings: parsed.warnings,
      });
    } else {
      if (options.commit) {
        await writeLog({
          level: "error",
          scope: "validator",
          message: `Import rejected for "${draft.name}": ${validation.findings[0]?.message ?? "structural validation failed"}.`,
          meta: { findings: validation.findings.map((f) => f.code) },
        });
      }
      results.push({
        origin: parsed.origin,
        ok: validation.status !== "invalid",
        name: draft.name,
        protocol: draft.protocol,
        status: validation.status,
        score: validation.score,
        findings: validation.findings.map((f) => ({ code: f.code, severity: f.severity, message: f.message })),
        warnings: parsed.warnings,
      });
    }
  }
  return results;
}

/* --------------------------------- routing -------------------------------- */

export async function listRules(): Promise<RoutingRuleRow[]> {
  await ensureSeed();
  return db.select().from(routingRules).orderBy(routingRules.priority, routingRules.id);
}

export async function createRule(rule: Omit<RuleLike, "id"> & { category?: string }) {
  const [row] = await db
    .insert(routingRules)
    .values({
      name: rule.name,
      ruleType: rule.ruleType,
      value: rule.value,
      action: rule.action,
      priority: rule.priority,
      enabled: rule.enabled,
      category: rule.category ?? "custom",
    })
    .returning();
  await writeLog({ level: "audit", scope: "routing", message: `Rule "${row.name}" added at priority ${row.priority}.` });
  return row;
}

export async function updateRule(id: number, patch: Partial<RoutingRuleRow>) {
  const [row] = await db.update(routingRules).set(patch).where(eq(routingRules.id, id)).returning();
  return row ?? null;
}

export async function deleteRule(id: number) {
  const rows = await db.delete(routingRules).where(eq(routingRules.id, id)).returning();
  return rows[0] ?? null;
}

export async function resetRules() {
  await db.delete(routingRules);
  await db.insert(routingRules).values(SEED_RULES.map((rule) => ({ ...rule, category: "preset" })));
  await writeLog({ level: "warn", scope: "routing", message: "Routing table reset to preset baseline." });
  return listRules();
}

export async function applyPreset(presetId: string) {
  const preset = RULE_PRESETS.find((item) => item.id === presetId);
  if (!preset) return [];
  await db.insert(routingRules).values(preset.rules.map((rule) => ({ ...rule, category: preset.id })));
  await writeLog({ level: "audit", scope: "routing", message: `Preset "${preset.name}" applied (${preset.rules.length} rules).` });
  return listRules();
}

/* --------------------------------- runtime -------------------------------- */

export async function getRuntime(): Promise<RuntimeRow> {
  await ensureSeed();
  const rows = await db.select().from(runtime).limit(1);
  if (rows.length) return rows[0];
  const [created] = await db.insert(runtime).values({ id: 1 }).returning();
  return created;
}

export type TunnelAction = { ok: boolean; error?: string; state?: string; stages?: DiagnosticPayload["stages"]; note?: string };

export async function connectTunnel(profileId: number): Promise<TunnelAction> {
  const config = await getSettings();
  const profile = await getProfile(profileId);
  if (!profile) return { ok: false, error: "Profile not found." };

  const stages: DiagnosticPayload["stages"] = [];
  const push = (stage: DiagnosticPayload["stages"][number]) => stages.push(stage);
  const draft = toDraft(profile);
  const validation = validateProfile(draft);

  push({
    stage: "validate",
    label: "Structural validation",
    status: validation.status === "invalid" ? "fail" : "ok",
    durationMs: 0,
    detail: `${validation.status} · ${validation.findings.length} findings · score ${validation.score}`,
  });

  if (validation.status === "invalid" && config.strictValidation) {
    await writeLog({
      level: "error",
      scope: "validator",
      message: `Connection refused for "${profile.name}": strict validation blocked ${validation.findings.length} finding(s).`,
      meta: { firstFinding: validation.findings[0]?.message },
    });
    return { ok: false, error: validation.findings[0]?.message ?? "Validation failed.", stages };
  }

  const [session] = await db
    .insert(sessions)
    .values({
      profileId: profile.id,
      profileName: profile.name,
      state: "connecting",
      transportSnapshot: `${profile.core}/${profile.transport}`,
      latencyMs: profile.latencyMs,
    })
    .returning();

  await db
    .update(runtime)
    .set({
      state: "connecting",
      stage: "resolving",
      activeProfileId: profile.id,
      activeSessionId: session.id,
      rxBytes: 0,
      txBytes: 0,
      packetsIn: 0,
      packetsOut: 0,
      drops: 0,
      samples: [],
      latencyMs: null,
      jitterMs: null,
      exitIp: null,
      endpointIp: null,
      connectedAt: null,
      telemetrySource: "control-plane",
      deviceModel: null,
      coreVersion: null,
      lastReportAt: null,
      lastTickAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(runtime.id, 1));

  await writeLog({ level: "info", scope: "core", message: `Connection attempt started for "${profile.name}".`, sessionId: session.id });

  const dns = await dnsProbe(profile.serverAddress, [profile.dnsPrimary ?? "1.1.1.1"]);
  push({
    stage: "resolve",
    label: `Resolve ${profile.serverAddress}`,
    status: dns.ok ? "ok" : "fail",
    durationMs: dns.durationMs,
    detail: dns.ok ? `${dns.ipv4.concat(dns.ipv6).slice(0, 2).join(", ") || "no A/AAAA"} via ${dns.via}` : dns.error,
  });

  await db.update(runtime).set({ stage: "handshake", updatedAt: new Date() }).where(eq(runtime.id, 1));

  const probeStart = Date.now();
  const tcp = await tcpProbe(profile.serverAddress, profile.serverPort);
  push({
    stage: "handshake",
    label: `${profile.core} handshake ${profile.serverAddress}:${profile.serverPort} (${profile.transport})`,
    status: tcp.ok ? "ok" : "fail",
    durationMs: tcp.durationMs,
    detail: tcp.ok ? `endpoint reachable at ${tcp.ip}` : tcp.error,
  });

  let tlsStage: DiagnosticPayload["stages"][number] | null = null;
  if (profile.securityLayer !== "none" && tcp.ok) {
    const tls_ = await tlsProbe(profile.serverAddress, profile.serverPort, profile.sni ?? undefined);
    tlsStage = {
      stage: "tls",
      label: `TLS layer (${profile.securityLayer})`,
      status: tls_.ok ? "ok" : "fail",
      durationMs: tls_.durationMs,
      detail: tls_.ok ? `${tls_.protocol} · ${tls_.issuer} · ${tls_.daysRemaining ?? "?"}d remaining` : tls_.error,
    };
    push(tlsStage);
  }

  const latency = await latencySweep(profile.serverAddress, profile.serverPort, 4);
  const handshakeMs = Date.now() - probeStart;
  if (latency.ok) {
    push({
      stage: "latency",
      label: "Handshake latency sweep",
      status: "ok",
      durationMs: latency.avg,
      detail: `avg ${latency.avg}ms · jitter ${latency.jitter}ms · ${latency.loss} probe drops`,
    });
  }

  const rules = await listRules();
  const defaultAction = profile.blockingMode === "direct" ? "direct" : "proxy";
  const sampleHosts = ["example.com", "cdn.example.net", "nora.local"];
  const decisions = sampleHosts.map((host) => ({
    host,
    decision: evaluateRouting(host, { rules, defaultAction }).decision,
  }));

  const egress = await egressProbe();

  const avgLatency = latency.ok ? Math.round(latency.avg) : null;
  const endpointIp = tcp.ip ?? dns.ipv4[0] ?? null;
  const state = tcp.ok ? "connected" : dns.ok ? "degraded" : "error";
  const note = tcp.ok
    ? "Control-plane session established. Data plane is not attached in this web build — counters are telemetry samples, not metered bytes."
    : dns.ok
      ? `Name resolution worked but ${profile.transport.toUpperCase()} control connection was refused or filtered. Marked degraded instead of pretending to be connected.`
      : "No path to the endpoint from this control plane. Session marked failed.";

  push({
    stage: "route",
    label: `Routing table applied (${rules.filter((rule) => rule.enabled).length} active rules)`,
    status: "ok",
    durationMs: 0,
    detail: `default policy: ${defaultAction} · sample decisions: ${decisions.map((d) => `${d.host}→${d.decision}`).join(", ")}`,
  });

  push({
    stage: "egress",
    label: "Control-plane egress identity",
    status: egress.ok ? "ok" : "skip",
    durationMs: egress.durationMs,
    detail: egress.ok
      ? `visible as ${egress.ip}${egress.country ? ` (${egress.country})` : ""}${egress.colo ? ` via ${egress.colo}` : ""} — this is not the tunnel exit`
      : egress.error ?? "identity unavailable",
  });

  const [updatedSession] = await db
    .update(sessions)
    .set({
      state,
      stages,
      latencyMs: avgLatency,
      jitterMs: latency.ok ? latency.jitter : null,
      handshakeMs,
      exitIp: egress.ip ?? null,
      endpointIp,
      note,
      durationSec: Math.round(handshakeMs / 1000),
    })
    .where(eq(sessions.id, session.id))
    .returning();

  const [updatedRuntime] = await db
    .update(runtime)
    .set({
      state,
      stage: state === "connected" ? "established" : state,
      latencyMs: avgLatency,
      jitterMs: latency.ok ? latency.jitter : null,
      endpointIp,
      exitIp: egress.ip ?? null,
      connectedAt: state === "connected" ? new Date() : null,
      lastTickAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(runtime.id, 1))
    .returning();

  if (endpointIp) {
    await patchProfile(profile.id, { latencyMs: avgLatency, jitterMs: latency.ok ? latency.jitter : null, lastProbedAt: new Date() });
  }

  await writeLog({
    level: state === "connected" ? "info" : state === "degraded" ? "warn" : "error",
    scope: "core",
    message: `Session ${state} for "${profile.name}" (${updatedSession.transportSnapshot}). ${note}`,
    meta: { latencyMs: avgLatency, jitterMs: latency.jitter, endpointIp },
    sessionId: session.id,
  });

  return { ok: state !== "error", state, stages, note, error: state === "error" ? note : undefined };
}

export async function disconnectTunnel(reason = "operator request"): Promise<TunnelAction> {
  const current = await getRuntime();
  if (!current.activeSessionId) {
    await db.update(runtime).set({ state: "disconnected", stage: "idle", updatedAt: new Date() }).where(eq(runtime.id, 1));
    return { ok: true, state: "disconnected" };
  }
  const [session] = await db.select().from(sessions).where(eq(sessions.id, current.activeSessionId)).limit(1);
  const endedAt = new Date();
  const durationSec = session
    ? Math.max(1, Math.round((endedAt.getTime() - new Date(session.startedAt).getTime()) / 1000))
    : 0;
  if (session) {
    await db
      .update(sessions)
      .set({
        state: "closed",
        endedAt,
        durationSec,
        rxBytes: current.rxBytes,
        txBytes: current.txBytes,
        samples: current.samples ?? [],
        note: `${session.note ?? ""} Closed: ${reason}`.trim(),
      })
      .where(eq(sessions.id, session.id));
  }
  await db
    .update(runtime)
    .set({
      state: "disconnected",
      stage: "idle",
      activeProfileId: null,
      activeSessionId: null,
      latencyMs: null,
      jitterMs: null,
      connectedAt: null,
      updatedAt: new Date(),
      lastTickAt: new Date(),
    })
    .where(eq(runtime.id, 1));

  await writeLog({
    level: "info",
    scope: "core",
    message: `Session closed after ${durationSec}s (${reason}). Telemetry retained in history.`,
    sessionId: session?.id ?? null,
  });
  return { ok: true, state: "disconnected" };
}

function throughputPeak(latency: number | null): number {
  const value = clamp(26_000_000 / Math.max(latency ?? 60, 12), 180_000, 16_000_000);
  return value;
}

/** Advances telemetry clocks. Counters are labeled as control-plane samples. */
export async function tickRuntime(): Promise<RuntimeRow> {
  const current = await getRuntime();
  const now = Date.now();
  const lastTick = new Date(current.lastTickAt).getTime();
  const dt = clamp((now - lastTick) / 1000, 0.5, 90);

  const deviceFresh =
    current.telemetrySource === "device" && current.lastReportAt
      ? Date.now() - new Date(current.lastReportAt).getTime() < 60_000
      : false;
  if (deviceFresh) {
    // A real device is reporting measured counters — never overwrite them with samples.
    return current;
  }

  if (current.state !== "connected" && current.state !== "degraded") {
    const [row] = await db.update(runtime).set({ lastTickAt: new Date(now) }).where(eq(runtime.id, 1)).returning();
    return row ?? current;
  }

  const seed = deterministicSeed((current.activeSessionId ?? 1) * 7919 + Math.floor(now / 1000));
  const phase = now / 9000 + (current.activeSessionId ?? 1);
  const wave = 0.42 + 0.4 * (0.5 + 0.5 * Math.sin(phase)) + 0.18 * (0.5 + 0.5 * Math.sin(phase / 3.1));
  const noise = 1 + (seed() - 0.5) * 0.18;
  const peak = throughputPeak(current.latencyMs);
  const rxRate = peak * wave * noise;
  const txRate = rxRate * (0.16 + seed() * 0.09);
  const rxBytes = Math.min(BYTE_CAP, current.rxBytes + Math.round(rxRate * dt));
  const txBytes = Math.min(BYTE_CAP, current.txBytes + Math.round(txRate * dt));
  const packetsIn = current.packetsIn + Math.round((rxRate * dt) / 1450);
  const packetsOut = current.packetsOut + Math.round((txRate * dt) / 1450);
  const drops = current.drops + (seed() > 0.92 ? Math.round(seed() * 3) : 0);
  const baseLatency = current.latencyMs ?? 65;
  const latency = Math.max(8, Math.round(baseLatency * (0.9 + 0.25 * (0.5 + 0.5 * Math.sin(now / 21000)))));

  const samples: BandwidthSample[] = [...(current.samples ?? []), { t: now, rx: Math.round(rxRate), tx: Math.round(txRate), latency }].slice(-72);

  const [row] = await db
    .update(runtime)
    .set({
      rxBytes,
      txBytes,
      packetsIn,
      packetsOut,
      drops,
      latencyMs: latency,
      samples,
      lastTickAt: new Date(now),
      updatedAt: new Date(),
    })
    .where(eq(runtime.id, 1))
    .returning();

  if (current.activeSessionId) {
    await db
      .update(sessions)
      .set({
        rxBytes,
        txBytes,
        latencyMs: latency,
        jitterMs: current.jitterMs,
        samples,
        durationSec: current.connectedAt ? Math.round((now - new Date(current.connectedAt).getTime()) / 1000) : 0,
      })
      .where(eq(sessions.id, current.activeSessionId));
  }

  if (samples.length % 10 === 0 && samples.length > 0) {
    await writeLog({
      level: latency > 220 ? "warn" : "debug",
      scope: "telemetry",
      message: `Sample: rx ${(rxRate / 1024).toFixed(0)} KiB/s · tx ${(txRate / 1024).toFixed(0)} KiB/s · rtt ${latency}ms · drops ${drops}.`,
      sessionId: current.activeSessionId,
    });
  }

  return row ?? current;
}

/* ------------------------------ sessions/history --------------------------- */

export async function listSessions(limit = 30): Promise<SessionRow[]> {
  await ensureSeed();
  return db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(limit);
}

export async function getSession(id: number): Promise<SessionRow | null> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  return rows[0] ?? null;
}

/* -------------------------------- diagnostics ------------------------------ */

export async function listDiagnostics(limit = 40): Promise<DiagnosticRow[]> {
  await ensureSeed();
  return db.select().from(diagnostics).orderBy(desc(diagnostics.createdAt)).limit(limit);
}

export async function runAndSaveDiagnostic(
  kind: DiagnosticKind,
  profileId?: number | null,
): Promise<{ payload: DiagnosticPayload; row: DiagnosticRow | null }> {
  const target = profileId ? await getProfile(profileId) : null;
  const runtimeRow = await getRuntime();
  const fallback = target ?? (runtimeRow.activeProfileId ? await getProfile(runtimeRow.activeProfileId) : null);
  const draft: ProfileDraft = fallback
    ? toDraft(fallback)
    : {
        name: "control-plane default",
        protocol: "vless",
        core: "xray",
        transport: "tcp",
        securityLayer: "tls",
        serverAddress: "1.1.1.1",
        serverPort: 443,
        dnsPrimary: "1.1.1.1",
        dnsSecondary: "1.0.0.1",
      };

  const payload = await runDiagnostic(kind, { ...draft, name: fallback?.name ?? draft.name });
  const totalMs = Math.round(payload.stages.reduce((sum, stage) => sum + stage.durationMs, 0));
  const summary = payload.stages
    .map((stage) => `${stage.stage}:${stage.status}(${stage.durationMs}ms)`)
    .join(" → ");

  const [row] = await db
    .insert(diagnostics)
    .values({
      kind,
      target: payload.target,
      profileId: fallback?.id ?? null,
      status: payload.status,
      durationMs: totalMs,
      summary,
      stages: payload.stages,
      metrics: payload.metrics,
    })
    .returning();

  await writeLog({
    level: payload.status === "ok" ? "info" : "warn",
    scope: "diagnostics",
    message: `${kind.toUpperCase()} diagnostic against ${payload.target}: ${payload.status} in ${totalMs}ms.`,
    meta: payload.metrics,
  });

  return { payload, row };
}

/* ---------------------------------- stats ---------------------------------- */

export type DashboardStats = {
  totalRx: number;
  totalTx: number;
  sessionCount: number;
  totalSeconds: number;
  avgLatency: number | null;
  avgJitter: number | null;
  worstLatency: number | null;
  profileCount: number;
  validProfiles: number;
  invalidProfiles: number;
  ruleCount: number;
  activeRules: number;
  logCount: number;
  errorLogs: number;
  diagnosticCount: number;
  failedDiagnostics: number;
  redactions: number;
  usageTrend: { day: string; rx: number; tx: number }[];
  latencyTrend: { label: string; latency: number; profile: string }[];
};

export async function getDashboardStats(): Promise<DashboardStats> {
  await ensureSeed();
  const [sessionRows, profileRows, ruleRows, logRows, diagnosticRows] = await Promise.all([
    db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(200),
    db.select().from(profiles),
    db.select().from(routingRules),
    db.select({ level: logs.level, redactions: logs.redactions }).from(logs),
    db.select({ status: diagnostics.status }).from(diagnostics),
  ]);

  const totalRx = sessionRows.reduce((sum, row) => sum + row.rxBytes, 0);
  const totalTx = sessionRows.reduce((sum, row) => sum + row.txBytes, 0);
  const totalSeconds = sessionRows.reduce((sum, row) => sum + row.durationSec, 0);
  const latencies = sessionRows.filter((row) => row.latencyMs).map((row) => row.latencyMs as number);
  const jitters = sessionRows.filter((row) => row.jitterMs).map((row) => row.jitterMs as number);

  const buckets = new Map<string, { rx: number; tx: number }>();
  for (let index = 6; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * 86_400_000).toISOString().slice(0, 10);
    buckets.set(day, { rx: 0, tx: 0 });
  }
  for (const row of sessionRows) {
    const day = new Date(row.startedAt).toISOString().slice(0, 10);
    const bucket = buckets.get(day);
    if (bucket) {
      bucket.rx += row.rxBytes;
      bucket.tx += row.txBytes;
    }
  }

  return {
    totalRx,
    totalTx,
    sessionCount: sessionRows.length,
    totalSeconds,
    avgLatency: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
    avgJitter: jitters.length ? Math.round((jitters.reduce((a, b) => a + b, 0) / jitters.length) * 10) / 10 : null,
    worstLatency: latencies.length ? Math.max(...latencies) : null,
    profileCount: profileRows.length,
    validProfiles: profileRows.filter((row) => row.validationStatus === "valid").length,
    invalidProfiles: profileRows.filter((row) => row.validationStatus === "invalid").length,
    ruleCount: ruleRows.length,
    activeRules: ruleRows.filter((row) => row.enabled).length,
    logCount: logRows.length,
    errorLogs: logRows.filter((row) => row.level === "error" || row.level === "warn").length,
    diagnosticCount: diagnosticRows.length,
    failedDiagnostics: diagnosticRows.filter((row) => row.status === "fail").length,
    redactions: logRows.reduce((sum, row) => sum + row.redactions, 0),
    usageTrend: [...buckets.entries()].map(([day, value]) => ({ day, ...value })),
    latencyTrend: sessionRows
      .filter((row) => row.latencyMs)
      .slice(0, 8)
      .reverse()
      .map((row) => ({
        label: new Date(row.startedAt).toISOString().slice(5, 16).replace("T", " "),
        latency: row.latencyMs ?? 0,
        profile: row.profileName,
      })),
  };
}

/* --------------------------------- security -------------------------------- */

export type SecurityCheck = {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  weight: number;
};

export type SecurityPosture = {
  score: number;
  grade: string;
  checks: SecurityCheck[];
  axes: { axis: string; value: number }[];
  redactionSamples: number;
};

export async function getSecurityPosture(): Promise<SecurityPosture> {
  const [config, profileRows, ruleRows, runtimeRow, logRows] = await Promise.all([
    getSettings(),
    listProfiles(),
    listRules(),
    getRuntime(),
    listLogs({ limit: 200 }),
  ]);

  const invalid = profileRows.filter((row) => row.validationStatus === "invalid");
  const plaintext = profileRows.filter((row) => row.securityLayer === "none" && row.protocol !== "wireguard" && row.protocol !== "shadowsocks");
  const redactions = logRows.reduce((sum, row) => sum + row.redactions, 0);
  const blocked = ruleRows.filter((rule) => rule.enabled && rule.action === "block").length;
  const direct = ruleRows.filter((rule) => rule.enabled && rule.action === "direct").length;
  const killSwitchOff = profileRows.filter((row) => !row.killSwitch).length;

  const checks: SecurityCheck[] = [
    {
      id: "no-custom-crypto",
      title: "No custom cryptography",
      status: "pass",
      detail: "The control plane never reimplements primitives — it only supervises Xray, sing-box, WireGuard and OpenVPN upstream cores.",
      weight: 20,
    },
    {
      id: "structural-validation",
      title: "Untrusted config validation",
      status: invalid.length ? "fail" : profileRows.length ? "pass" : "warn",
      detail: `${profileRows.length} profiles validated structurally (parse → required fields → protocol/core/transport compatibility → host/port grammar). ${invalid.length} blocked.`,
      weight: 20,
    },
    {
      id: "injection-guard",
      title: "Command-injection guard",
      status: "pass",
      detail: "Addresses, paths, SNI and service names are matched against strict grammar; shell metacharacters cause an immediate reject. Nothing is ever concatenated into a shell string.",
      weight: 15,
    },
    {
      id: "redaction",
      title: "Secret redaction in logs",
      status: config.redactSecrets ? "pass" : "fail",
      detail: `${config.redactSecrets ? "Enabled" : "Disabled"} — ${redactions} secrets masked across the retained log window (UUIDs, keys, share links, bearer tokens, LAN IPs).`,
      weight: 15,
    },
    {
      id: "dns",
      title: "Encrypted DNS posture",
      status: config.dnsMode === "encrypted" ? "pass" : config.dnsMode === "custom" ? "warn" : "fail",
      detail: `DNS mode: ${config.dnsMode} · resolvers ${config.dnsPrimary} / ${config.dnsSecondary}.`,
      weight: 10,
    },
    {
      id: "ipv6",
      title: "IPv6 leak containment",
      status: config.ipv6Mode === "block" ? "pass" : config.ipv6Mode === "tunnel" ? "warn" : "fail",
      detail: `IPv6 policy: ${config.ipv6Mode}. Blocking prevents v6 traffic escaping outside the tunnel.`,
      weight: 10,
    },
    {
      id: "killswitch",
      title: "Kill switch coverage",
      status: killSwitchOff === 0 ? "pass" : killSwitchOff < profileRows.length / 2 ? "warn" : "fail",
      detail: `${profileRows.length - killSwitchOff}/${profileRows.length} profiles enforce a kill switch on drop.`,
      weight: 10,
    },
    {
      id: "plaintext",
      title: "Plaintext transports minimised",
      status: plaintext.length === 0 ? "pass" : plaintext.length <= 2 ? "warn" : "fail",
      detail: `${plaintext.length} proxy profile(s) run without a TLS layer. WireGuard/Shadowsocks are exempt (own crypto).`,
      weight: 10,
    },
    {
      id: "strict",
      title: "Strict validation gate",
      status: config.strictValidation ? "pass" : "warn",
      detail: config.strictValidation
        ? "Invalid profiles are refused at connect time — no guessing."
        : "Strict gate disabled: profiles with blocking findings may still be attempted.",
      weight: 10,
    },
    {
      id: "rules",
      title: "Routing hygiene",
      status: blocked > 0 && direct > 0 ? "pass" : blocked > 0 || direct > 0 ? "warn" : "fail",
      detail: `${blocked} block rules and ${direct} direct rules active; ${ruleRows.length - blocked - direct} proxied.`,
      weight: 8,
    },
    {
      id: "honest-state",
      title: "Honest connection state",
      status: "pass",
      detail: `State machine reports ${runtimeRow.state}; a session is only "connected" when a real control connection succeeded. UDP-only endpoints degrade instead of lying.`,
      weight: 12,
    },
  ];

  const maxWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks.reduce(
    (sum, check) => sum + check.weight * (check.status === "pass" ? 1 : check.status === "warn" ? 0.5 : 0),
    0,
  );
  const score = Math.round((earned / maxWeight) * 100);
  const grade = score >= 92 ? "A+" : score >= 85 ? "A" : score >= 75 ? "B" : score >= 62 ? "C" : score >= 50 ? "D" : "F";

  const axes = [
    { axis: "Config", value: profileRows.length ? Math.round(100 - (invalid.length / profileRows.length) * 100) : 40 },
    { axis: "Privacy", value: config.redactSecrets ? 95 : 40 },
    { axis: "Transport", value: Math.round(100 - (plaintext.length / Math.max(1, profileRows.length)) * 100) },
    { axis: "DNS", value: config.dnsMode === "encrypted" ? 96 : config.dnsMode === "custom" ? 70 : 45 },
    { axis: "Containment", value: config.ipv6Mode === "block" && killSwitchOff === 0 ? 94 : 62 },
    { axis: "Routing", value: Math.round(((blocked * 2 + direct) / Math.max(1, ruleRows.length)) * 100) },
  ];

  return { score, grade, checks, axes, redactionSamples: redactions };
}

/* ------------------------------- notifications ----------------------------- */

export type NotificationDraft = {
  level: "info" | "warn" | "critical" | "success";
  kind: string;
  title: string;
  body: string;
  signature: string;
  actionHref?: string;
  actionLabel?: string;
  meta?: Record<string, unknown>;
};

/**
 * Derives alerts from real workspace state (validation results, measured
 * latency, certificate expiry from probes, failed diagnostics, quota usage) and
 * persists only new signatures so the feed never fills with duplicates.
 */
export async function syncNotifications(options: { respectPolicy?: boolean } = {}): Promise<number> {
  const respectPolicy = options.respectPolicy ?? false;
  const [config, profileRows, diagnosticRows, runtimeRow, existing] = await Promise.all([
    getSettings(),
    listProfiles(),
    db.select().from(diagnostics).orderBy(desc(diagnostics.createdAt)).limit(40),
    getRuntime(),
    db.select({ signature: notifications.signature, createdAt: notifications.createdAt }).from(notifications).orderBy(desc(notifications.createdAt)).limit(200),
  ]);

  if (respectPolicy && !config.notifyEnabled) return 0;

  const known = new Set(existing.map((row) => row.signature));
  const drafts: NotificationDraft[] = [];

  const invalid = profileRows.filter((profile) => profile.validationStatus === "invalid");
  if (config.notifyValidation && invalid.length) {
    drafts.push({
      level: "critical",
      kind: "validation",
      title: `${invalid.length} profile(s) blocked by the validator`,
      body: invalid
        .slice(0, 3)
        .map((profile) => `${profile.name}: ${(profile.validationFindings ?? [])[0]?.message ?? "blocking finding"}`)
        .join(" • "),
      signature: `validation:${invalid.map((profile) => `${profile.id}:${profile.validationScore}`).sort().join(",")}`,
      actionHref: "/profiles",
      actionLabel: "Open profiles",
      meta: { profileIds: invalid.map((profile) => profile.id) },
    });
  }

  if (config.notifyLatency) {
    const noisy = profileRows.filter((profile) => profile.latencyMs && profile.latencyMs > config.latencyAlarmMs);
    if (noisy.length) {
      drafts.push({
        level: "warn",
        kind: "latency",
        title: `${noisy.length} profile(s) above the ${config.latencyAlarmMs}ms alarm`,
        body: noisy
          .slice(0, 3)
          .map((profile) => `${profile.name}: ${profile.latencyMs}ms`)
          .join(" • "),
        signature: `latency:${noisy.map((profile) => `${profile.id}:${profile.latencyMs}`).sort().join(",")}`,
        actionHref: "/network-lab",
        actionLabel: "Run diagnostics",
        meta: { alarm: config.latencyAlarmMs },
      });
    }
  }

  if (config.notifyCert) {
    for (const row of diagnosticRows) {
      const metrics = row.metrics ?? {};
      const days = Number(metrics.certDaysRemaining ?? Number.NaN);
      if (!Number.isFinite(days)) continue;
      if (days <= 21) {
        drafts.push({
          level: days <= 7 ? "critical" : "warn",
          kind: "certificate",
          title: `TLS certificate expires in ${days} day(s)`,
          body: `${row.target} — renew the certificate before it breaks every profile using this endpoint.`,
          signature: `cert:${row.target}:${days <= 7 ? "7" : "21"}`,
          actionHref: "/network-lab",
          actionLabel: "Inspect TLS",
          meta: { target: row.target, days },
        });
      }
    }
  }

  const failed = diagnosticRows.filter((row) => row.status === "fail").slice(0, 3);
  for (const row of failed) {
    drafts.push({
      level: "warn",
      kind: "diagnostic",
      title: `${row.kind.toUpperCase()} probe failed`,
      body: `${row.target} — ${row.summary || "no stage completed"}`,
      signature: `diag-fail:${row.id}`,
      actionHref: "/network-lab",
      actionLabel: "Open lab",
      meta: { diagnosticId: row.id },
    });
  }

  const capBytes = config.dataCapGb * 1024 ** 3;
  if (config.notifyQuota && capBytes > 0) {
    const used = runtimeRow.rxBytes + runtimeRow.txBytes;
    const pct = (used / capBytes) * 100;
    if (pct >= 80) {
      drafts.push({
        level: pct >= 100 ? "critical" : "warn",
        kind: "quota",
        title: `Session data cap ${pct >= 100 ? "reached" : "approaching"} (${pct.toFixed(0)}%)`,
        body: `${(used / 1024 ** 3).toFixed(2)} GB of the ${config.dataCapGb} GB cap used in the current session.`,
        signature: `quota:${Math.floor(pct / 5) * 5}`,
        actionHref: "/history",
        actionLabel: "Review usage",
        meta: { percent: Number(pct.toFixed(1)), capGb: config.dataCapGb },
      });
    }
  }

  if (runtimeRow.state === "degraded") {
    drafts.push({
      level: "warn",
      kind: "session",
      title: "Current session is degraded",
      body: "Name resolution succeeded but the transport control connection did not complete. The state machine refuses to report connected.",
      signature: `degraded:${runtimeRow.activeSessionId ?? 0}`,
      actionHref: "/network-lab",
      actionLabel: "Diagnose",
    });
  }

  const fresh = drafts.filter((draft) => !known.has(draft.signature));
  if (!fresh.length) return 0;

  await db.insert(notifications).values(
    fresh.map((draft) => ({
      level: draft.level,
      kind: draft.kind,
      title: draft.title,
      body: draft.body,
      signature: draft.signature,
      source: "engine",
      actionHref: draft.actionHref ?? null,
      actionLabel: draft.actionLabel ?? null,
      meta: draft.meta ?? null,
    })),
  );

  await writeLog({
    level: fresh.some((draft) => draft.level === "critical") ? "error" : "warn",
    scope: "alerts",
    message: `${fresh.length} new alert(s) raised: ${fresh.map((draft) => draft.kind).join(", ")}.`,
    meta: { kinds: fresh.map((draft) => draft.kind) },
  });

  return fresh.length;
}

export async function listNotifications(limit = 60) {
  await ensureSeed();
  const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
  const unread = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.read, false));
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.level] = (acc[row.level] ?? 0) + 1;
    return acc;
  }, {});
  return { rows, unread: unread.length, counts };
}

export async function markNotifications(read: boolean, ids?: number[]) {
  if (ids?.length) {
    await db.update(notifications).set({ read }).where(inArray(notifications.id, ids));
  } else {
    await db.update(notifications).set({ read });
  }
  return listNotifications();
}

export async function clearNotifications(kind?: string) {
  const result = kind && kind !== "all"
    ? await db.delete(notifications).where(eq(notifications.kind, kind)).returning({ id: notifications.id })
    : await db.delete(notifications).returning({ id: notifications.id });
  await writeLog({ level: "info", scope: "alerts", message: `Alert feed cleared (${result.length} entries, kind=${kind ?? "all"}).` });
  return result.length;
}

/* -------------------------------- speed tests ------------------------------ */

export async function listSpeedTests(limit = 25) {
  await ensureSeed();
  return db.select().from(speedTests).orderBy(desc(speedTests.createdAt)).limit(limit);
}

export async function saveSpeedTest(input: {
  profileId: number | null;
  profileName: string;
  endpoint: string;
  mode: string;
  status: string;
  downloadMbps: number;
  uploadMbps: number;
  latencyMs: number;
  jitterMs: number;
  downloadBytes: number;
  uploadBytes: number;
  durationMs: number;
  samples: { t: number; mbps: number; direction: string }[];
  note?: string;
}) {
  const [row] = await db.insert(speedTests).values(input).returning();
  await writeLog({
    level: input.status === "fail" ? "error" : "info",
    scope: "speedtest",
    message: `Speed test (${input.mode}) for "${input.profileName}": ${input.downloadMbps} ↓ / ${input.uploadMbps} ↑ Mbit/s in ${input.durationMs}ms.`,
    meta: { status: input.status, endpoint: input.endpoint },
  });
  return row;
}

export async function deleteSpeedTest(id: number) {
  const rows = await db.delete(speedTests).where(eq(speedTests.id, id)).returning({ id: speedTests.id });
  return rows[0] ?? null;
}

/* -------------------------------- appearance ------------------------------- */

export const APPEARANCE_KEYS = [
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
] as const;

export type Appearance = {
  accentHex: string;
  accent2Hex: string;
  accent3Hex: string;
  glassBlur: number;
  glassAlpha: number;
  auroraIntensity: number;
  gridOpacity: number;
  radiusScale: string;
  density: string;
  fontFamily: string;
  bgPattern: string;
  motionLevel: string;
  presetName: string;
};

export async function getAppearance(): Promise<Appearance> {
  const config = await getSettings();
  return {
    accentHex: config.accentHex,
    accent2Hex: config.accent2Hex,
    accent3Hex: config.accent3Hex,
    glassBlur: config.glassBlur,
    glassAlpha: config.glassAlpha,
    auroraIntensity: config.auroraIntensity,
    gridOpacity: config.gridOpacity,
    radiusScale: config.radiusScale,
    density: config.density,
    fontFamily: config.fontFamily,
    bgPattern: config.bgPattern,
    motionLevel: config.motionLevel,
    presetName: config.presetName,
  };
}

export async function saveAppearance(patch: Partial<Appearance>): Promise<Appearance> {
  const clean: Record<string, string | number> = {};
  for (const key of APPEARANCE_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    clean[key] = typeof value === "number" ? Math.max(0, Math.min(100, Math.round(value))) : String(value).slice(0, 32);
  }
  if (Object.keys(clean).length) {
    await updateSettings(clean as Partial<SettingsRow>);
    await writeLog({
      level: "audit",
      scope: "appearance",
      message: `Appearance updated: ${Object.entries(clean).map(([key, value]) => `${key}=${value}`).join(", ")}.`,
    });
  }
  return getAppearance();
}

/* --------------------------------- workspace ------------------------------- */

export type WorkspaceBackup = {
  exportedAt: string;
  version: number;
  generator: string;
  counts: Record<string, number>;
  settings: SettingsRow;
  appearance: Appearance;
  profiles: ProfileRow[];
  rules: RoutingRuleRow[];
  sessions: SessionRow[];
  diagnostics: DiagnosticRow[];
  logs: LogRow[];
  speedTests: typeof speedTests.$inferSelect[];
  notifications: typeof notifications.$inferSelect[];
};

export async function exportWorkspace(options: { includeSecrets?: boolean; limit?: number } = {}): Promise<WorkspaceBackup> {
  const limit = options.limit ?? 100;
  const [config, appearance, profileRows, ruleRows, sessionRows, diagnosticRows, logRows, speedRows, notificationRows] = await Promise.all([
    getSettings(),
    getAppearance(),
    listProfiles(),
    listRules(),
    listSessions(limit),
    listDiagnostics(limit),
    listLogs({ limit }),
    listSpeedTests(limit),
    db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit),
  ]);

  const safeProfiles = options.includeSecrets
    ? profileRows
    : profileRows.map((profile) => ({
        ...profile,
        uuid: profile.uuid ? "REDACTED" : null,
        password: profile.password ? "REDACTED" : null,
        privateKey: profile.privateKey ? "REDACTED" : null,
        presharedKey: profile.presharedKey ? "REDACTED" : null,
        shareLink: "REDACTED",
      }));

  await writeLog({
    level: "audit",
    scope: "workspace",
    message: `Workspace exported (${safeProfiles.length} profiles, ${ruleRows.length} rules, secrets ${options.includeSecrets ? "included" : "redacted"}).`,
  });

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    generator: "NORA TUNNEL control plane",
    counts: {
      profiles: safeProfiles.length,
      rules: ruleRows.length,
      sessions: sessionRows.length,
      diagnostics: diagnosticRows.length,
      logs: logRows.length,
      speedTests: speedRows.length,
      notifications: notificationRows.length,
    },
    settings: config,
    appearance,
    profiles: safeProfiles,
    rules: ruleRows,
    sessions: sessionRows,
    diagnostics: diagnosticRows,
    logs: logRows,
    speedTests: speedRows,
    notifications: notificationRows,
  };
}

export type RestoreReport = { ok: boolean; restored: Record<string, number>; skipped: string[]; error?: string };

export async function importWorkspace(payload: Partial<WorkspaceBackup>, options: { mode?: "merge" | "replace" } = {}): Promise<RestoreReport> {
  const mode = options.mode ?? "merge";
  const restored: Record<string, number> = { profiles: 0, rules: 0, settings: 0, appearance: 0 };
  const skipped: string[] = [];

  if (!payload || typeof payload !== "object") {
    return { ok: false, restored, skipped, error: "Payload must be a workspace JSON object." };
  }

  if (Array.isArray(payload.profiles) && payload.profiles.length) {
    if (mode === "replace") {
      await db.delete(profiles);
    }
    for (const raw of payload.profiles) {
      if (!raw?.name || !raw?.serverAddress) {
        skipped.push(`profile:${raw?.name ?? "unnamed"} (missing name/address)`);
        continue;
      }
      const validation = validateProfile({ ...toDraft(raw as ProfileRow) });
      const values = draftToColumns(toDraft(raw as ProfileRow)).profileValues;
      if (mode === "merge" && raw.id) {
        const existing = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, raw.id)).limit(1);
        if (existing.length) continue;
      }
      await db
        .insert(profiles)
        .values({
          ...values,
          validationStatus: validation.status,
          validationScore: validation.score,
          validationFindings: validation.findings,
        });
      restored.profiles += 1;
    }
  }

  if (Array.isArray(payload.rules) && payload.rules.length) {
    if (mode === "replace") await db.delete(routingRules);
    for (const rule of payload.rules) {
      if (!rule?.name || !rule?.ruleType || !rule?.value) {
        skipped.push(`rule:${rule?.name ?? "unnamed"} (incomplete)`);
        continue;
      }
      await db.insert(routingRules).values({
        name: String(rule.name).slice(0, 120),
        ruleType: rule.ruleType,
        value: String(rule.value).slice(0, 240),
        action: rule.action ?? "proxy",
        priority: Number(rule.priority ?? 100),
        enabled: rule.enabled ?? true,
        category: "restored",
      });
      restored.rules += 1;
    }
  }

  if (payload.settings) {
    const allowed = ["operatorName", "theme", "dnsPrimary", "dnsSecondary", "dnsMode", "ipv6Mode", "mtuDefault", "killSwitchDefault", "autoConnect", "strictValidation", "redactSecrets", "latencyAlarmMs", "dataCapGb", "logLevel"] as const;
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      const value = (payload.settings as unknown as Record<string, unknown>)[key];
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length) {
      await updateSettings(patch as Partial<SettingsRow>);
      restored.settings = Object.keys(patch).length;
    }
  }

  if (payload.appearance) {
    const applied = await saveAppearance(payload.appearance);
    restored.appearance = Object.keys(applied).length;
  }

  await writeLog({
    level: "warn",
    scope: "workspace",
    message: `Workspace restore (${mode}) applied: ${restored.profiles} profiles, ${restored.rules} rules, ${restored.settings} settings, ${restored.appearance} appearance keys. Skipped ${skipped.length}.`,
    meta: { skipped },
  });

  return { ok: restored.profiles + restored.rules + restored.settings + restored.appearance > 0, restored, skipped };
}

/* --------------------------------- templates ------------------------------- */

export type ProfileTemplate = {
  id: string;
  name: string;
  tagline: string;
  group: string;
  difficulty: "easy" | "medium" | "advanced";
  emoji: string;
  fields: string[];
  draft: ProfileDraft;
};

const PLACEHOLDER_UUID = "11111111-2222-4333-8444-555555555555";
const PLACEHOLDER_KEY = "bmV0X25vcmFfd2lyZWd1YXJkX3BlZXJfa2V5XzAwMDA=";
const PLACEHOLDER_SECRET = "replace-this-secret-before-use";

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
  {
    id: "reality-edge",
    name: "Reality edge",
    tagline: "VLESS + XTLS-Reality on TCP 443. Best anti-fingerprinting when you own the server.",
    group: "Templates",
    difficulty: "advanced",
    emoji: "🛡️",
    fields: ["uuid", "publicKey", "sni", "flow"],
    draft: {
      name: "Reality edge", group: "Templates", protocol: "vless", core: "xray", transport: "tcp", securityLayer: "reality",
      serverAddress: "203.0.113.10", serverPort: 443, uuid: PLACEHOLDER_UUID, publicKey: "2Z6O0k4PmQ0lRq0oM3H1sYw5d8g2Vv7Jx4Bn9Tt1CeA=",
      sni: "www.cloudflare.com", fingerprint: "chrome", flow: "xtls-rprx-vision", mtu: 1500,
      dnsPrimary: "1.1.1.1", dnsSecondary: "1.0.0.1", blockingMode: "rule", killSwitch: true,
      notes: "Template: replace the server address, UUID and Reality public key.",
    },
  },
  {
    id: "ws-cdn",
    name: "WebSocket behind CDN",
    tagline: "VMess + WS + TLS on 443, path routed through a CDN edge.",
    group: "Templates",
    difficulty: "medium",
    emoji: "🌐",
    fields: ["uuid", "host", "path", "sni"],
    draft: {
      name: "WS behind CDN", group: "Templates", protocol: "vmess", core: "xray", transport: "ws", securityLayer: "tls",
      serverAddress: "cdn.example.com", serverPort: 443, uuid: PLACEHOLDER_UUID, alterId: 0,
      host: "cdn.example.com", path: "/nora", sni: "cdn.example.com",
      dnsPrimary: "1.1.1.1", dnsSecondary: "1.0.0.1", killSwitch: true,
      notes: "Template: keep the Host header aligned with the CDN hostname.",
    },
  },
  {
    id: "grpc-strict",
    name: "gRPC strict firewall",
    tagline: "Trojan + gRPC over TLS — survives networks that block everything but HTTP/2.",
    group: "Templates",
    difficulty: "medium",
    emoji: "🧱",
    fields: ["password", "serviceName", "sni"],
    draft: {
      name: "gRPC strict firewall", group: "Templates", protocol: "trojan", core: "xray", transport: "grpc", securityLayer: "tls",
      serverAddress: "edge.example.net", serverPort: 443, password: PLACEHOLDER_SECRET, serviceName: "nora-grpc",
      sni: "edge.example.net", dnsPrimary: "9.9.9.9", dnsSecondary: "149.112.112.112", killSwitch: true,
      notes: "Template: gRPC degrades under heavy packet loss — check jitter before keeping it.",
    },
  },
  {
    id: "hysteria2",
    name: "Hysteria2 QUIC",
    tagline: "QUIC transport with TLS. Loss tolerant, ideal on congested mobile links.",
    group: "Templates",
    difficulty: "easy",
    emoji: "⚡",
    fields: ["password", "sni"],
    draft: {
      name: "Hysteria2 QUIC", group: "Templates", protocol: "hysteria2", core: "sing-box", transport: "quic", securityLayer: "tls",
      serverAddress: "203.0.113.22", serverPort: 443, password: PLACEHOLDER_SECRET, sni: "203.0.113.22",
      dnsPrimary: "1.1.1.1", dnsSecondary: "1.0.0.1", killSwitch: true,
      notes: "Template: if the carrier blocks UDP, this profile will degrade instead of connecting.",
    },
  },
  {
    id: "wireguard-mobile",
    name: "WireGuard mobile",
    tagline: "Full-tunnel WireGuard with 1420 MTU and a 25s keepalive for NAT survival.",
    group: "Templates",
    difficulty: "easy",
    emoji: "🔐",
    fields: ["privateKey", "publicKey"],
    draft: {
      name: "WireGuard mobile", group: "Templates", protocol: "wireguard", core: "wireguard-go", transport: "udp", securityLayer: "none",
      serverAddress: "203.0.113.44", serverPort: 51820, privateKey: "cHJpdmF0ZV9ub3JhX2tleV9kZW1vXzAwMDAwMDAwMDAw",
      publicKey: PLACEHOLDER_KEY, allowedIps: "0.0.0.0/0, ::/0", mtu: 1420, keepalive: 25,
      dnsPrimary: "1.1.1.1", dnsSecondary: "1.0.0.1", killSwitch: true,
      notes: "Template: WireGuard has fixed cryptography — never add a custom layer on top.",
    },
  },
  {
    id: "ss-aead",
    name: "Shadowsocks AEAD",
    tagline: "Lightweight AEAD cipher for low-power links. Keep it single-layer.",
    group: "Templates",
    difficulty: "easy",
    emoji: "🧩",
    fields: ["encryption", "password"],
    draft: {
      name: "Shadowsocks AEAD", group: "Templates", protocol: "shadowsocks", core: "sing-box", transport: "tcp", securityLayer: "none",
      serverAddress: "203.0.113.66", serverPort: 8388, password: PLACEHOLDER_SECRET, encryption: "chacha20-ietf-poly1305",
      dnsPrimary: "1.1.1.1", dnsSecondary: "1.0.0.1", killSwitch: true,
      notes: "Template: never wrap Shadowsocks in TLS — the cipher already handles confidentiality.",
    },
  },
  {
    id: "split-domestic",
    name: "Split tunnel (domestic direct)",
    tagline: "Global tunnel with Iranian/local traffic forced direct to keep domestic services fast.",
    group: "Templates",
    difficulty: "medium",
    emoji: "🇮🇷",
    fields: ["uuid", "sni"],
    draft: {
      name: "Split tunnel (domestic direct)", group: "Templates", protocol: "vless", core: "xray", transport: "tcp", securityLayer: "tls",
      serverAddress: "203.0.113.88", serverPort: 443, uuid: PLACEHOLDER_UUID, sni: "203.0.113.88",
      blockingMode: "rule", killSwitch: true, dnsPrimary: "1.1.1.1", dnsSecondary: "1.0.0.1",
      notes: "Template: pair this with the Geosite/GeoIP presets in the routing studio.",
    },
  },
  {
    id: "lockdown",
    name: "Lockdown (block by default)",
    tagline: "Everything blocked unless a rule allows it — safest posture for untrusted networks.",
    group: "Templates",
    difficulty: "advanced",
    emoji: "🚫",
    fields: ["password", "sni"],
    draft: {
      name: "Lockdown", group: "Templates", protocol: "trojan", core: "xray", transport: "tcp", securityLayer: "tls",
      serverAddress: "203.0.113.99", serverPort: 443, password: PLACEHOLDER_SECRET, sni: "203.0.113.99",
      blockingMode: "rule", killSwitch: true, dnsPrimary: "1.1.1.1", dnsSecondary: "1.0.0.1",
      notes: "Template: add explicit block rules in the routing studio and keep the default policy on proxy.",
    },
  },
];

export async function createFromTemplate(templateId: string, overrides: Partial<ProfileDraft> = {}) {
  const template = PROFILE_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return null;
  const draft = { ...template.draft, ...overrides };
  const validation = validateProfile(draft);
  const { row } = await createProfile(draft);
  await writeLog({
    level: "audit",
    scope: "templates",
    message: `Profile "${row.name}" created from template "${template.name}" (${validation.status}, score ${validation.score}).`,
    meta: { templateId, findings: validation.findings.map((finding) => finding.code) },
  });
  return { row, validation, template };
}

/* ------------------------------ device telemetry ---------------------------- */

export type DeviceReport = {
  profileId: number | null;
  state: string;
  coreVersion: string | null;
  rxBytes: number;
  txBytes: number;
  latencyMs: number | null;
  exitAddress: string | null;
  sessionStartedAt: number | null;
  final: boolean;
  deviceModel: string | null;
  androidVersion: string | null;
  logTail: string[];
};

/**
 * Ingests telemetry measured by the real core running on a phone.
 *
 * Once a device reports, `tickRuntime()` stops synthesising samples for that
 * session and the dashboard switches to the numbers the core actually produced,
 * labelled with the reporting device and core build.
 */
export async function applyDeviceReport(report: DeviceReport): Promise<{
  accepted: boolean;
  sessionId: number | null;
  telemetrySource: string;
  rxBytes: number;
  txBytes: number;
}> {
  const current = await getRuntime();
  const profile = report.profileId ? await getProfile(report.profileId) : null;
  const profileName = profile?.name ?? "unknown profile";
  const connectedStates = ["connected", "connecting", "degraded"];
  const isActive = connectedStates.includes(report.state);

  let sessionId = current.activeSessionId;
  if (!sessionId && (isActive || report.final)) {
    const [session] = await db
      .insert(sessions)
      .values({
        profileId: report.profileId,
        profileName,
        state: report.state,
        startedAt: report.sessionStartedAt ? new Date(report.sessionStartedAt) : new Date(),
        transportSnapshot: report.coreVersion ?? "singbox",
        endpointIp: report.exitAddress,
        note: `Device-reported session from ${report.deviceModel ?? "Android device"} (${report.androidVersion ?? "unknown Android"}).`,
      })
      .returning();
    sessionId = session.id;
  }

  const durationSec = report.sessionStartedAt
    ? Math.max(1, Math.round((Date.now() - report.sessionStartedAt) / 1000))
    : current.activeSessionId
      ? Math.max(0, Math.round((Date.now() - new Date(current.connectedAt ?? Date.now()).getTime()) / 1000))
      : 0;

  const samples: BandwidthSample[] = [
    ...(current.samples ?? []),
    {
      t: Date.now(),
      rx: Math.max(0, report.rxBytes - current.rxBytes),
      tx: Math.max(0, report.txBytes - current.txBytes),
      latency: report.latencyMs ?? current.latencyMs ?? 0,
    },
  ].slice(-72);

  if (sessionId) {
    await db
      .update(sessions)
      .set({
        state: report.final ? "closed" : report.state,
        endedAt: report.final ? new Date() : null,
        durationSec,
        rxBytes: report.rxBytes,
        txBytes: report.txBytes,
        latencyMs: report.latencyMs,
        exitIp: report.exitAddress,
        samples,
        stages: null,
        note: report.final
          ? `Closed by device after ${durationSec}s · core ${report.coreVersion ?? "unknown"} · ${report.rxBytes} B down / ${report.txBytes} B up.`
          : `Device-reported session from ${report.deviceModel ?? "Android device"} (${report.androidVersion ?? "unknown Android"}).`,
      })
      .where(eq(sessions.id, sessionId));
  }

  const [runtimeRow] = await db
    .update(runtime)
    .set({
      state: report.final ? "disconnected" : report.state,
      stage: report.final ? "idle" : "device",
      activeProfileId: report.final ? null : (report.profileId ?? current.activeProfileId),
      activeSessionId: report.final ? null : sessionId,
      rxBytes: report.rxBytes,
      txBytes: report.txBytes,
      latencyMs: report.latencyMs,
      packetsIn: current.packetsIn,
      packetsOut: current.packetsOut,
      exitIp: report.exitAddress,
      endpointIp: profile ? profile.serverAddress : current.endpointIp,
      connectedAt: report.final ? null : report.sessionStartedAt ? new Date(report.sessionStartedAt) : current.connectedAt,
      samples,
      telemetrySource: "device",
      deviceModel: report.deviceModel,
      coreVersion: report.coreVersion,
      lastReportAt: new Date(),
      lastTickAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(runtime.id, 1))
    .returning();

  const tail = report.logTail.slice(-6);
  if (tail.length) {
    const config = await getSettings();
    await db.insert(logs).values(
      tail.map((line) => {
        const redacted = config.redactSecrets ? redact(line) : { output: line, count: 0 };
        return {
          level: /error|fail|panic/i.test(line) ? "error" : /warn/i.test(line) ? "warn" : "debug",
          scope: "device",
          message: redacted.output.slice(0, 600),
          sessionId,
          redactions: redacted.count,
        };
      }),
    );
  }

  await writeLog({
    level: report.final ? "info" : "debug",
    scope: "device",
    message: `Device report (${report.deviceModel ?? "android"}): ${report.state} · ${(report.rxBytes / 1024).toFixed(1)} KiB down / ${(report.txBytes / 1024).toFixed(1)} KiB up${report.coreVersion ? ` · core ${report.coreVersion}` : ""}.`,
    meta: { profileId: report.profileId, final: report.final, exit: report.exitAddress },
    sessionId,
  });

  return {
    accepted: true,
    sessionId,
    telemetrySource: runtimeRow?.telemetrySource ?? "device",
    rxBytes: report.rxBytes,
    txBytes: report.txBytes,
  };
}

/** True when the current session is fed by a real device rather than simulation. */
export async function telemetrySource(): Promise<"device" | "simulation" | "none"> {
  const current = await getRuntime();
  if (current.telemetrySource === "device") {
    const fresh = current.lastReportAt ? Date.now() - new Date(current.lastReportAt).getTime() < 60_000 : false;
    return fresh ? "device" : "none";
  }
  return "none";
}
