"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTunnel } from "@/components/tunnel-context";
import { useToast } from "@/components/toast";
import { Badge, CopyButton, Dot, EmptyState, Field, Icon, Modal, Panel, SectionTitle, Segmented, Toggle } from "@/components/ui";
import {
  CORES,
  FINGERPRINTS,
  PROTOCOL_CAPS,
  SECURITY_LAYERS,
  TRANSPORTS,
  buildShareLink,
  defaultDraft,
  maskSecret,
  protocolCaps,
  protocolLabel,
  validateProfile,
} from "@/lib/protocols";
import type { ProfileRow } from "@/db/schema";
import type { ProfileDraft, ProtocolId, ValidationResult } from "@/lib/types";

type ImportRow = {
  origin: string;
  ok: boolean;
  name?: string;
  protocol?: string;
  status?: string;
  score?: number;
  error?: string;
  warnings?: string[];
  findings?: { code: string; severity: string; message: string }[];
};

const PROTOCOLS = Object.keys(PROTOCOL_CAPS) as ProtocolId[];

type TemplateMeta = {
  id: string;
  name: string;
  tagline: string;
  difficulty: string;
  emoji: string;
  fields: string[];
  protocol: string;
  core: string;
  transport: string;
  securityLayer: string;
};

const DIFFICULTY_TONE: Record<string, "good" | "warn" | "bad"> = { easy: "good", medium: "warn", advanced: "bad" };

export function ProfilesView({ profiles, groups }: { profiles: ProfileRow[]; groups: string[] }) {
  const router = useRouter();
  const { push } = useToast();
  const { connect, busy, snapshot } = useTunnel();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [mode, setMode] = useState<"grid" | "matrix" | "templates">("grid");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importGroup, setImportGroup] = useState("Imported");
  const [importing, setImporting] = useState(false);
  const [detail, setDetail] = useState<ProfileRow | null>(null);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (group !== "all" && profile.group !== group) return false;
      if (favoritesOnly && !profile.favorite) return false;
      if (!needle) return true;
      return `${profile.name} ${profile.serverAddress} ${profile.protocol} ${profile.core} ${profile.transport}`
        .toLowerCase()
        .includes(needle);
    });
  }, [profiles, query, group, favoritesOnly]);

  const caps = draft ? protocolCaps(draft.protocol) : null;

  const runValidation = useCallback(async (next: ProfileDraft, id: number | null) => {
    try {
      const response = await fetch(id ? `/api/profiles/${id}` : "/api/profiles", {
        method: id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...next, dryRun: true }),
      });
      const json = (await response.json()) as { validation?: ValidationResult };
      if (json.validation) setValidation(json.validation);
    } catch {
      setValidation(validateProfile(next));
    }
  }, []);

  useEffect(() => {
    if (mode !== "templates" || templates.length) return;
    void (async () => {
      const response = await fetch("/api/templates", { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; templates?: TemplateMeta[] };
      if (json.ok && json.templates) setTemplates(json.templates);
    })();
  }, [mode, templates.length]);

  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => void runValidation(draft, editingId), 260);
    return () => clearTimeout(timer);
  }, [draft, editingId, runValidation]);

  const startCreate = () => {
    const next = defaultDraft("vless");
    next.name = "";
    setDraft(next);
    setEditingId(null);
    setValidation(validateProfile(next));
  };

  const startEdit = (profile: ProfileRow) => {
    const next: ProfileDraft = {
      name: profile.name,
      group: profile.group,
      protocol: profile.protocol,
      core: profile.core,
      transport: profile.transport,
      securityLayer: profile.securityLayer,
      serverAddress: profile.serverAddress,
      serverPort: profile.serverPort,
      uuid: profile.uuid ?? "",
      password: profile.password ?? "",
      publicKey: profile.publicKey ?? "",
      privateKey: profile.privateKey ?? "",
      presharedKey: profile.presharedKey ?? "",
      sni: profile.sni ?? "",
      host: profile.host ?? "",
      path: profile.path ?? "",
      serviceName: profile.serviceName ?? "",
      flow: profile.flow ?? "",
      fingerprint: profile.fingerprint ?? "chrome",
      alterId: profile.alterId ?? 0,
      encryption: profile.encryption ?? "",
      mtu: profile.mtu ?? 1420,
      dnsPrimary: profile.dnsPrimary ?? "1.1.1.1",
      dnsSecondary: profile.dnsSecondary ?? "1.0.0.1",
      allowedIps: profile.allowedIps ?? "0.0.0.0/0, ::/0",
      keepalive: profile.keepalive ?? 25,
      blockingMode: profile.blockingMode,
      killSwitch: profile.killSwitch,
      notes: profile.notes ?? "",
    };
    setDraft(next);
    setEditingId(profile.id);
    setValidation(validateProfile(next));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/profiles/${editingId}` : "/api/profiles", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = (await response.json()) as { ok: boolean; validation?: ValidationResult; error?: string };
      if (!json.ok) {
        push({ title: "Save failed", detail: json.error ?? "unknown error", tone: "bad" });
        return;
      }
      push({
        title: editingId ? "Profile updated" : "Profile created",
        detail: json.validation ? `${json.validation.status} · score ${json.validation.score} · ${json.validation.findings.length} finding(s)` : undefined,
        tone: json.validation?.status === "invalid" ? "warn" : "good",
      });
      setDraft(null);
      setEditingId(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (profile: ProfileRow) => {
    const response = await fetch(`/api/profiles/${profile.id}`, { method: "DELETE" });
    if (response.ok) {
      push({ title: "Profile deleted", detail: profile.name, tone: "info" });
      router.refresh();
    }
  };

  const patch = async (profile: ProfileRow, patchBody: Record<string, unknown>) => {
    await fetch(`/api/profiles/${profile.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patchBody),
    });
    router.refresh();
  };

  const previewImport = async (commit: boolean) => {
    setImporting(true);
    try {
      const response = await fetch("/api/profiles/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: importText, group: importGroup, commit }),
      });
      const json = (await response.json()) as { ok: boolean; results?: ImportRow[]; accepted?: number; error?: string };
      if (!json.ok || !json.results) {
        push({ title: "Import failed", detail: json.error ?? "unknown", tone: "bad" });
        return;
      }
      setImportRows(json.results);
      if (commit) {
        push({
          title: `${json.accepted} profile(s) imported`,
          detail: `${json.results.length - (json.accepted ?? 0)} rejected by the validator`,
          tone: (json.accepted ?? 0) > 0 ? "good" : "warn",
        });
        router.refresh();
      }
    } finally {
      setImporting(false);
    }
  };

  const createFromTemplate = useCallback(
    async (templateId: string) => {
      setTemplateBusy(templateId);
      try {
        const response = await fetch("/api/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ templateId }),
        });
        const json = (await response.json()) as { ok: boolean; profile?: ProfileRow; validation?: ValidationResult; error?: string };
        if (json.ok && json.profile) {
          push({
            title: `Template applied: ${json.profile.name}`,
            detail: `${json.validation?.status ?? "valid"} · score ${json.validation?.score ?? 100} — edit the placeholders before connecting.`,
            tone: "good",
          });
          router.refresh();
        } else {
          push({ title: "Template failed", detail: json.error ?? "unknown error", tone: "bad" });
        }
      } finally {
        setTemplateBusy(null);
      }
    },
    [push, router],
  );

  const update = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <div className="space-y-4">
      <Panel className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, host, protocol…"
            className="input pl-9"
          />
        </div>
        <select value={group} onChange={(event) => setGroup(event.target.value)} className="select w-auto">
          <option value="all">All groups</option>
          {groups.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          onClick={() => setFavoritesOnly((value) => !value)}
          style={favoritesOnly ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
        >
          <Icon name="star" className="h-3.5 w-3.5" />
          Favourites
        </button>
        <Segmented
          value={mode}
          onChange={setMode}
          size="sm"
          options={[
            { value: "grid", label: "Cards" },
            { value: "matrix", label: "Matrix" },
            { value: "templates", label: `Templates ${templates.length}` },
          ]}
        />
        <button type="button" className="btn" onClick={() => setImportOpen(true)}>
          <Icon name="download" className="h-3.5 w-3.5" />
          Import
        </button>
        <button type="button" className="btn btn-primary" onClick={startCreate}>
          <Icon name="plus" className="h-3.5 w-3.5" />
          New profile
        </button>
      </Panel>

      {mode === "templates" ? (
        <section className="space-y-4">
          <Panel>
            <SectionTitle
              eyebrow="starter kits"
              title="Templates with placeholder credentials"
              description="Each template creates a validated profile with clearly fake secrets, so you only replace the fields that matter. Validation findings tell you exactly what is still a placeholder."
            />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {templates.map((template) => (
                <div key={template.id} className="flex flex-col rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      {template.emoji} {template.name}
                    </p>
                    <Badge tone={DIFFICULTY_TONE[template.difficulty] ?? "muted"}>{template.difficulty}</Badge>
                  </div>
                  <p className="mt-1 flex-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                    {template.tagline}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="chip">{template.protocol}</span>
                    <span className="chip">{template.core}</span>
                    <span className="chip">{template.transport}</span>
                    <span className="chip">{template.securityLayer}</span>
                  </div>
                  <p className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    replace: {template.fields.join(", ")}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary mt-3 w-full"
                    disabled={templateBusy !== null}
                    onClick={() => void createFromTemplate(template.id)}
                  >
                    <Icon name={templateBusy === template.id ? "refresh" : "plus"} className={`h-3.5 w-3.5 ${templateBusy === template.id ? "spin-slow" : ""}`} />
                    {templateBusy === template.id ? "Creating…" : "Create profile"}
                  </button>
                </div>
              ))}
              {templates.length === 0 ? (
                <div className="md:col-span-2 xl:col-span-4">
                  <EmptyState title="Loading templates…" description="Template metadata is served from /api/templates." />
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="how templates stay honest" title="Placeholders are validated, not hidden" />
            <ul className="space-y-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
              <li>· Credentials in templates are obviously fake, and the validator reports key/UUID format findings so a placeholder can never silently ship.</li>
              <li>· Every template is created through the same pipeline as an import: parse → structural validation → capability check → normalise.</li>
              <li>· Templates are plain data in this repository, so you can extend the gallery with your own provider conventions.</li>
            </ul>
          </Panel>
        </section>
      ) : null}

      {mode === "matrix" ? (
        <Panel>
          <SectionTitle
            eyebrow="capability guard"
            title="Protocol · core · transport compatibility"
            description="Every field is validated against this matrix before a profile can be saved or connected. Core capability mismatch is a blocking finding."
          />
          <div className="overflow-x-auto scroll-thin">
            <table className="data min-w-[720px]">
              <thead>
                <tr>
                  <th>Protocol</th>
                  <th>Cores</th>
                  <th>Transports</th>
                  <th>Security layers</th>
                  <th>Credential</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {PROTOCOLS.map((protocol) => {
                  const item = PROTOCOL_CAPS[protocol];
                  return (
                    <tr key={protocol}>
                      <td className="font-medium">{item.label}</td>
                      <td className="num text-[11px]">{item.cores.join(", ")}</td>
                      <td className="num text-[11px]">{item.transports.join(", ")}</td>
                      <td>{item.security.map((layer) => <Badge key={layer} tone={layer === "reality" ? "good" : layer === "tls" ? "info" : "muted"} className="mr-1">{layer}</Badge>)}</td>
                      <td>
                        <Badge tone="accent">{item.credential}</Badge>
                      </td>
                      <td className="max-w-[280px] text-[11px]" style={{ color: "var(--text-dim)" }}>{item.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((profile) => {
            const tone = profile.validationStatus === "valid" ? "good" : profile.validationStatus === "invalid" ? "bad" : "warn";
            const active = snapshot.activeProfile?.id === profile.id;
            return (
              <Panel key={profile.id} className={`rise ${active ? "scan relative overflow-hidden" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{profile.name}</p>
                      {profile.favorite ? <Icon name="star" className="h-3.5 w-3.5" /> : null}
                      {active ? <Badge tone="good"><Dot tone="good" pulse /> live</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {profile.group} · {protocolLabel(profile.protocol)} · {profile.core}/{profile.transport} · {profile.securityLayer}
                    </p>
                  </div>
                  <Badge tone={tone}>{profile.validationScore}</Badge>
                </div>

                <div className="num mt-3 flex items-center gap-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
                  <Icon name="globe" className="h-3.5 w-3.5" />
                  {profile.serverAddress}:{profile.serverPort}
                  {profile.latencyMs ? <span className="chip ml-auto">{profile.latencyMs}ms</span> : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone={profile.killSwitch ? "good" : "warn"}>kill switch {profile.killSwitch ? "on" : "off"}</Badge>
                  <Badge tone="muted">{profile.blockingMode}</Badge>
                  <Badge tone="muted">mtu {profile.mtu}</Badge>
                  {profile.validationFindings?.length ? (
                    <Badge tone={tone}>{profile.validationFindings.length} finding(s)</Badge>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="btn px-2.5 py-1.5 text-[11px]"
                    disabled={busy}
                    onClick={() => void connect(profile.id)}
                  >
                    <Icon name="play" className="h-3.5 w-3.5" />
                    Connect
                  </button>
                  <button type="button" className="btn px-2.5 py-1.5 text-[11px]" onClick={() => setDetail(profile)}>
                    <Icon name="shield" className="h-3.5 w-3.5" />
                    Report
                  </button>
                  <button type="button" className="btn px-2.5 py-1.5 text-[11px]" onClick={() => startEdit(profile)}>
                    <Icon name="gear" className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <a className="btn px-2.5 py-1.5 text-[11px]" href={`/api/profiles/export?id=${profile.id}`}>
                    <Icon name="download" className="h-3.5 w-3.5" />
                    Config
                  </a>
                  <button
                    type="button"
                    className="btn px-2.5 py-1.5 text-[11px]"
                    onClick={() => void patch(profile, { favorite: !profile.favorite })}
                  >
                    <Icon name="star" className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="btn btn-danger px-2.5 py-1.5 text-[11px]" onClick={() => void remove(profile)}>
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </Panel>
            );
          })}
          {filtered.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState
                title="No profiles match"
                description="Adjust filters or import a share link (vless://, vmess://, trojan://, ss://, hy2://, wg://)."
                action={
                  <button type="button" className="btn btn-primary mt-2" onClick={() => setImportOpen(true)}>
                    Import profiles
                  </button>
                }
              />
            </div>
          ) : null}
        </div>
      )}

      <Modal
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        title={editingId ? "Edit profile" : "New profile"}
        description="Fields adapt to the selected protocol. Validation runs as you type — nothing is executed."
        width="max-w-4xl"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create profile"}
            </button>
          </>
        }
      >
        {draft ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input className="input" value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Zurich Reality Edge" />
                </Field>
                <Field label="Group">
                  <input className="input" value={draft.group ?? ""} onChange={(event) => update("group", event.target.value)} placeholder="NORA Core" />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Protocol">
                  <select
                    className="select"
                    value={draft.protocol}
                    onChange={(event) => {
                      const next = defaultDraft(event.target.value as ProtocolId);
                      setDraft({ ...next, name: draft.name, group: draft.group, serverAddress: draft.serverAddress, serverPort: next.serverPort, notes: draft.notes });
                    }}
                  >
                    {PROTOCOLS.map((protocol) => (
                      <option key={protocol} value={protocol}>
                        {PROTOCOL_CAPS[protocol].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Core" hint={caps ? `compatible: ${caps.cores.join(", ")}` : undefined}>
                  <select className="select" value={draft.core} onChange={(event) => update("core", event.target.value)}>
                    {(caps?.cores ?? CORES.map((core) => core.id)).map((core) => (
                      <option key={core} value={core}>
                        {CORES.find((item) => item.id === core)?.label ?? core}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Transport" hint={caps ? `compatible: ${caps.transports.join(", ")}` : undefined}>
                  <select className="select" value={draft.transport} onChange={(event) => update("transport", event.target.value)}>
                    {(caps?.transports ?? TRANSPORTS.map((transport) => transport.id)).map((transport) => (
                      <option key={transport} value={transport}>
                        {TRANSPORTS.find((item) => item.id === transport)?.label ?? transport}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Server address" hint="hostname or IP — shell metacharacters are rejected">
                  <input className="input num" value={draft.serverAddress} onChange={(event) => update("serverAddress", event.target.value)} placeholder="203.0.113.7" />
                </Field>
                <Field label="Port">
                  <input
                    className="input num"
                    type="number"
                    value={draft.serverPort ?? 443}
                    onChange={(event) => update("serverPort", Number(event.target.value))}
                  />
                </Field>
                <Field label="Security layer">
                  <select className="select" value={draft.securityLayer} onChange={(event) => update("securityLayer", event.target.value)}>
                    {(caps?.security ?? SECURITY_LAYERS.map((layer) => layer.id)).map((layer) => (
                      <option key={layer} value={layer}>
                        {SECURITY_LAYERS.find((item) => item.id === layer)?.label ?? layer}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {["vless", "vmess", "tuic"].includes(draft.protocol) ? (
                  <Field label="UUID" hint="8-4-4-4-12 hexadecimal">
                    <input className="input num" value={draft.uuid ?? ""} onChange={(event) => update("uuid", event.target.value)} placeholder="8f1c…-…-…-…" />
                  </Field>
                ) : null}
                {["trojan", "shadowsocks", "hysteria2", "openvpn", "tuic"].includes(draft.protocol) ? (
                  <Field label="Secret / password">
                    <input className="input" value={draft.password ?? ""} onChange={(event) => update("password", event.target.value)} />
                  </Field>
                ) : null}
                {draft.protocol === "shadowsocks" ? (
                  <Field label="Cipher method" hint="AEAD only">
                    <select className="select" value={draft.encryption ?? "aes-256-gcm"} onChange={(event) => update("encryption", event.target.value)}>
                      {["aes-128-gcm", "aes-256-gcm", "chacha20-ietf-poly1305", "xchacha20-ietf-poly1305", "2022-blake3-aes-256-gcm"].map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {draft.protocol === "wireguard" ? (
                  <>
                    <Field label="Peer public key">
                      <input className="input num" value={draft.publicKey ?? ""} onChange={(event) => update("publicKey", event.target.value)} />
                    </Field>
                    <Field label="Local private key" hint="stored server-side; masked in every export">
                      <input className="input num" value={draft.privateKey ?? ""} onChange={(event) => update("privateKey", event.target.value)} />
                    </Field>
                    <Field label="Preshared key (optional)">
                      <input className="input num" value={draft.presharedKey ?? ""} onChange={(event) => update("presharedKey", event.target.value)} />
                    </Field>
                  </>
                ) : null}
                {draft.securityLayer === "reality" ? (
                  <Field label="Reality public key">
                    <input className="input num" value={draft.publicKey ?? ""} onChange={(event) => update("publicKey", event.target.value)} />
                  </Field>
                ) : null}
                {draft.securityLayer !== "none" ? (
                  <Field label="SNI / server name">
                    <input className="input num" value={draft.sni ?? ""} onChange={(event) => update("sni", event.target.value)} placeholder="www.example.com" />
                  </Field>
                ) : null}
                {draft.securityLayer !== "none" ? (
                  <Field label="uTLS fingerprint">
                    <select className="select" value={draft.fingerprint ?? "chrome"} onChange={(event) => update("fingerprint", event.target.value)}>
                      {FINGERPRINTS.map((fp) => (
                        <option key={fp} value={fp}>
                          {fp}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {["ws", "httpupgrade", "h2"].includes(draft.transport) ? (
                  <>
                    <Field label="Path">
                      <input className="input num" value={draft.path ?? ""} onChange={(event) => update("path", event.target.value)} placeholder="/nora-ws" />
                    </Field>
                    <Field label="Host header">
                      <input className="input num" value={draft.host ?? ""} onChange={(event) => update("host", event.target.value)} />
                    </Field>
                  </>
                ) : null}
                {draft.transport === "grpc" ? (
                  <Field label="gRPC service name">
                    <input className="input num" value={draft.serviceName ?? ""} onChange={(event) => update("serviceName", event.target.value)} />
                  </Field>
                ) : null}
                {draft.protocol === "vless" ? (
                  <Field label="Flow control">
                    <input className="input num" value={draft.flow ?? ""} onChange={(event) => update("flow", event.target.value)} placeholder="xtls-rprx-vision" />
                  </Field>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="MTU" hint={draft.protocol === "wireguard" ? "1280–1500 for UDP tunnels" : "576–1500"}>
                  <input className="input num" type="number" value={draft.mtu ?? 1420} onChange={(event) => update("mtu", Number(event.target.value))} />
                </Field>
                <Field label="Primary DNS">
                  <input className="input num" value={draft.dnsPrimary ?? ""} onChange={(event) => update("dnsPrimary", event.target.value)} />
                </Field>
                <Field label="Secondary DNS">
                  <input className="input num" value={draft.dnsSecondary ?? ""} onChange={(event) => update("dnsSecondary", event.target.value)} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Routing policy">
                  <select className="select" value={draft.blockingMode ?? "rule"} onChange={(event) => update("blockingMode", event.target.value)}>
                    <option value="rule">Rule based (split tunnel)</option>
                    <option value="global">Global (everything proxied)</option>
                    <option value="direct">Direct (bypass tunnel)</option>
                  </select>
                </Field>
                <Field label="Allowed IPs">
                  <input className="input num" value={draft.allowedIps ?? ""} onChange={(event) => update("allowedIps", event.target.value)} />
                </Field>
              </div>

              <Toggle
                checked={draft.killSwitch ?? true}
                onChange={(value) => update("killSwitch", value)}
                label="Drop traffic outside the tunnel"
                hint="Kill-switch behaviour recorded with the profile and reported in the security centre."
              />

              <Field label="Operator notes">
                <textarea className="textarea" rows={2} value={draft.notes ?? ""} onChange={(event) => update("notes", event.target.value)} />
              </Field>
            </div>

            <div className="space-y-3">
              <Panel strong>
                <SectionTitle eyebrow="live validation" title="Structural report" />
                {validation ? (
                  <>
                    <div className="flex items-center gap-3">
                      <Badge tone={validation.status === "valid" ? "good" : validation.status === "invalid" ? "bad" : "warn"}>{validation.status}</Badge>
                      <span className="num text-sm">score {validation.score}/100</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {validation.findings.length === 0 ? (
                        <p className="text-xs tone-good">No findings — this profile is ready to connect.</p>
                      ) : null}
                      {validation.findings.map((finding) => (
                        <div key={finding.code} className="rounded-xl border p-2.5" style={{ borderColor: "var(--line)" }}>
                          <p className="flex items-center gap-2 text-[11px]">
                            <Badge tone={finding.severity === "critical" || finding.severity === "error" ? "bad" : finding.severity === "warning" ? "warn" : "info"}>
                              {finding.severity}
                            </Badge>
                            <span className="num">{finding.code}</span>
                          </p>
                          <p className="mt-1 text-xs">{finding.message}</p>
                          {finding.hint ? (
                            <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
                              {finding.hint}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                    Waiting for input…
                  </p>
                )}
              </Panel>

              <Panel>
                <SectionTitle eyebrow="preview" title="Share link & secrets" />
                <p className="num break-all rounded-xl border p-2.5 text-[11px]" style={{ borderColor: "var(--line)" }}>
                  {draft.serverAddress && draft.name ? buildShareLink(draft) : "Fill in the address to generate a link."}
                </p>
                <div className="mt-3 space-y-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                  <p>uuid: <span className="num">{maskSecret(draft.uuid)}</span></p>
                  <p>secret: <span className="num">{maskSecret(draft.password)}</span></p>
                  <p>keys: <span className="num">{maskSecret(draft.publicKey)}</span></p>
                </div>
                <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
                  Exports mask secrets by default; the sing-box artifact exports real values because a core needs them.
                </p>
              </Panel>

              {caps ? (
                <Panel>
                  <SectionTitle eyebrow="core notes" title={caps.label} />
                  <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                    {caps.notes}
                  </p>
                </Panel>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import tunnel configurations"
        description="Paste share links or a WireGuard INI block. Everything is parsed and validated as untrusted input — nothing is executed."
        width="max-w-3xl"
        footer={
          <>
            <button type="button" className="btn" onClick={() => void previewImport(false)} disabled={importing || !importText.trim()}>
              {importing ? "Validating…" : "Validate only"}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void previewImport(true)} disabled={importing || !importText.trim()}>
              Import validated
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <Field label="Configuration input" hint="One link per line — vless://, vmess://, trojan://, ss://, hysteria2://, tuic://, wg://, WireGuard INI">
              <textarea
                className="textarea num"
                rows={6}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder={`vless://uuid@203.0.113.9:443?security=reality&sni=www.cloudflare.com&type=tcp#Amsterdam%20Reality`}
              />
            </Field>
            <div className="space-y-3">
              <Field label="Target group">
                <input className="input" value={importGroup} onChange={(event) => setImportGroup(event.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {["Reality edge", "Trojan CDN", "WireGuard"].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    className="btn px-2 py-1 text-[11px]"
                    onClick={() =>
                      setImportText((current) =>
                        `${current}${current ? "\n" : ""}${
                          sample === "Reality edge"
                            ? "vless://9d2b7c44-6f1a-4a1e-8f5b-2c3d4e5f6a7b@203.0.113.9:443?security=reality&sni=www.cloudflare.com&fp=chrome&type=tcp&flow=xtls-rprx-vision#Reality%20edge"
                            : sample === "Trojan CDN"
                              ? "trojan://nora-cdn-secret@one.one.one.one:443?security=tls&type=grpc&serviceName=nora-edge#Trojan%20CDN"
                              : "[Interface]\nPrivateKey = QF9k1sJ1s0P4mH2jW8xR3vL6tZ7bY5nC0dE1fG2hI3k=\nAddress = 172.16.0.2/32\nDNS = 1.1.1.1\nMTU = 1420\n\n[Peer]\nPublicKey = bmV0X25vcmFfd2lyZWd1YXJkX3BlZXJfa2V5XzAwMDA=\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = 203.0.113.44:51820"
                        }`,
                      )
                    }
                  >
                    + {sample}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {importRows.length ? (
            <div className="space-y-2">
              {importRows.map((row, index) => (
                <div key={`${row.origin}-${index}`} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={row.ok ? (row.status === "invalid" ? "warn" : "good") : "bad"}>{row.status ?? (row.ok ? "valid" : "rejected")}</Badge>
                    <span className="num text-[11px]">{row.origin}</span>
                    {row.name ? <span className="text-sm">{row.name}</span> : null}
                    {row.protocol ? <span className="chip">{row.protocol}</span> : null}
                    {row.score !== undefined ? <span className="num chip">score {row.score}</span> : null}
                  </div>
                  {row.error ? <p className="mt-2 text-[11px] tone-bad">{row.error}</p> : null}
                  {row.findings?.length ? (
                    <ul className="mt-2 space-y-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                      {row.findings.map((finding) => (
                        <li key={finding.code}>
                          <span className="num mr-2" style={{ color: "var(--text-faint)" }}>
                            {finding.severity}
                          </span>
                          {finding.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {row.warnings?.length ? (
                    <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {row.warnings.join(" · ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
              Validation output appears here before anything touches the database.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Validation report · ${detail.name}` : "Validation report"}
        description="Findings recorded when the profile was last saved or re-validated."
        width="max-w-2xl"
      >
        {detail ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={detail.validationStatus === "valid" ? "good" : detail.validationStatus === "invalid" ? "bad" : "warn"}>{detail.validationStatus}</Badge>
              <span className="num text-sm">score {detail.validationScore}/100</span>
              <span className="chip">{protocolLabel(detail.protocol)}</span>
              <span className="chip">{detail.core}/{detail.transport}</span>
              <span className="chip">{detail.securityLayer}</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(detail.validationFindings ?? []).map((finding) => (
                <div key={finding.code} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-center gap-2">
                    <Badge tone={finding.severity === "critical" || finding.severity === "error" ? "bad" : finding.severity === "warning" ? "warn" : "info"}>
                      {finding.severity}
                    </Badge>
                    <span className="num text-[11px]">{finding.field ?? finding.code}</span>
                  </div>
                  <p className="mt-2 text-xs">{finding.message}</p>
                  {finding.hint ? (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {finding.hint}
                    </p>
                  ) : null}
                </div>
              ))}
              {(detail.validationFindings ?? []).length === 0 ? (
                <p className="text-xs tone-good">No findings recorded — structurally clean.</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <CopyButton value={detail.shareLink ?? ""} label="Copy share link" />
              <a className="btn" href={`/api/profiles/export?id=${detail.id}`}>
                <Icon name="download" className="h-3.5 w-3.5" />
                Download sing-box config
              </a>
              <a className="btn" href={`/api/profiles/export?id=${detail.id}&format=links`}>
                <Icon name="copy" className="h-3.5 w-3.5" />
                Raw link
              </a>
              <button
                type="button"
                className="btn"
                onClick={() => void patch(detail, { autoConnect: !detail.autoConnect })}
              >
                <Icon name="bolt" className="h-3.5 w-3.5" />
                Auto-connect {detail.autoConnect ? "on" : "off"}
              </button>
            </div>

            <div className="grid gap-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
              <p>secrets: uuid {maskSecret(detail.uuid)} · password {maskSecret(detail.password)} · key {maskSecret(detail.publicKey)}</p>
              <p>last validated: {detail.validatedAt ? new Date(detail.validatedAt).toLocaleString() : "—"}</p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
