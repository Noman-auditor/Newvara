"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, Field, Icon, Panel, SectionTitle, Toggle } from "@/components/ui";
import type { SettingsRow } from "@/db/schema";

const ACCENTS = ["violet", "cyan", "emerald", "amber", "rose"];

export function SettingsView({ settings }: { settings: SettingsRow }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = form.theme;
    document.documentElement.dataset.accent = form.accent;
    setDirty(JSON.stringify(form) !== JSON.stringify(settings));
  }, [form, settings]);

  const update = <K extends keyof SettingsRow>(key: K, value: SettingsRow[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operatorName: form.operatorName,
          theme: form.theme,
          accent: form.accent,
          dnsPrimary: form.dnsPrimary,
          dnsSecondary: form.dnsSecondary,
          dnsMode: form.dnsMode,
          ipv6Mode: form.ipv6Mode,
          mtuDefault: form.mtuDefault,
          killSwitchDefault: form.killSwitchDefault,
          autoConnect: form.autoConnect,
          strictValidation: form.strictValidation,
          redactSecrets: form.redactSecrets,
          latencyAlarmMs: form.latencyAlarmMs,
          dataCapGb: form.dataCapGb,
          logLevel: form.logLevel,
        }),
      });
      const json = (await response.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        push({ title: "Settings saved", detail: "Workspace defaults updated.", tone: "good" });
        router.refresh();
      } else {
        push({ title: "Save failed", detail: json.error, tone: "bad" });
      }
    } finally {
      setSaving(false);
    }
  };

  const danger = async (action: "purge-logs" | "reset-rules" | "revalidate") => {
    if (action === "purge-logs") {
      await fetch("/api/logs?scope=all", { method: "DELETE" });
      push({ title: "Logs purged", tone: "info" });
    }
    if (action === "reset-rules") {
      await fetch("/api/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
      push({ title: "Routing table reset", detail: "Baseline presets restored.", tone: "warn" });
    }
    if (action === "revalidate") {
      const response = await fetch("/api/security", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "audit-config" }),
      });
      const json = (await response.json()) as { ok: boolean; posture?: { score: number } };
      push({ title: "Profiles re-scored", detail: json.posture ? `posture ${json.posture.score}/100` : undefined, tone: "good" });
    }
    router.refresh();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Panel>
          <SectionTitle eyebrow="workspace" title="Identity & appearance" action={dirty ? <Badge tone="warn">unsaved</Badge> : <Badge tone="good">synced</Badge>} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Operator name">
              <input className="input" value={form.operatorName} onChange={(event) => update("operatorName", event.target.value)} />
            </Field>
            <Field label="Theme">
              <select className="select" value={form.theme} onChange={(event) => update("theme", event.target.value)}>
                <option value="dark">Nora dark glass</option>
                <option value="light">Daylight glass</option>
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <span className="label">Accent tint</span>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  className="btn px-3 py-1.5 text-[11px]"
                  data-accent={accent}
                  onClick={() => update("accent", accent)}
                  style={form.accent === accent ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                >
                  {accent}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="networking" title="DNS, MTU & IPv6" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="DNS mode" hint="encrypted = DoT/DoH resolvers, plain = ISP resolvers">
              <select className="select" value={form.dnsMode} onChange={(event) => update("dnsMode", event.target.value)}>
                <option value="encrypted">Encrypted (DoT/DoH)</option>
                <option value="custom">Custom resolver</option>
                <option value="plain">Plain / system</option>
              </select>
            </Field>
            <Field label="Default MTU">
              <input className="input num" type="number" value={form.mtuDefault} onChange={(event) => update("mtuDefault", Number(event.target.value))} />
            </Field>
            <Field label="Primary resolver">
              <input className="input num" value={form.dnsPrimary} onChange={(event) => update("dnsPrimary", event.target.value)} />
            </Field>
            <Field label="Secondary resolver">
              <input className="input num" value={form.dnsSecondary} onChange={(event) => update("dnsSecondary", event.target.value)} />
            </Field>
            <Field label="IPv6 policy" hint="block prevents v6 traffic escaping outside the tunnel">
              <select className="select" value={form.ipv6Mode} onChange={(event) => update("ipv6Mode", event.target.value)}>
                <option value="block">Block IPv6</option>
                <option value="tunnel">Tunnel IPv6</option>
                <option value="allow">Allow outside tunnel</option>
              </select>
            </Field>
            <Field label="Latency alarm (ms)" hint="threshold used by dashboards and log warnings">
              <input className="input num" type="number" value={form.latencyAlarmMs} onChange={(event) => update("latencyAlarmMs", Number(event.target.value))} />
            </Field>
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="policy" title="Safety gates" />
          <div className="grid gap-2">
            <Toggle
              checked={form.strictValidation}
              onChange={(value) => update("strictValidation", value)}
              label="Strict validation gate"
              hint="Refuse to connect profiles with blocking findings."
            />
            <Toggle
              checked={form.redactSecrets}
              onChange={(value) => update("redactSecrets", value)}
              label="Redact secrets in logs and exports"
              hint="UUIDs, keys, share links, tokens and LAN addresses are masked at write time."
            />
            <Toggle
              checked={form.killSwitchDefault}
              onChange={(value) => update("killSwitchDefault", value)}
              label="Kill switch by default"
              hint="Applied to new profiles so traffic cannot leak outside the tunnel."
            />
            <Toggle
              checked={form.autoConnect}
              onChange={(value) => update("autoConnect", value)}
              label="Auto-connect on launch"
              hint="Reconnect the last healthy profile when the workspace opens."
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Data cap per session (GB)">
              <input className="input num" type="number" value={form.dataCapGb} onChange={(event) => update("dataCapGb", Number(event.target.value))} />
            </Field>
            <Field label="Log level">
              <select className="select" value={form.logLevel} onChange={(event) => update("logLevel", event.target.value)}>
                {["debug", "info", "warn", "error"].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => void save()} disabled={saving}>
            <Icon name={saving ? "refresh" : "check"} className={`h-3.5 w-3.5 ${saving ? "spin-slow" : ""}`} />
            {saving ? "Saving…" : "Save workspace settings"}
          </button>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel>
          <SectionTitle eyebrow="maintenance" title="Quick actions" />
          <div className="space-y-2">
            <button type="button" className="btn w-full justify-start" onClick={() => void danger("revalidate")}>
              <Icon name="shield" className="h-3.5 w-3.5" />
              Re-run security audit
            </button>
            <button type="button" className="btn w-full justify-start" onClick={() => void danger("reset-rules")}>
              <Icon name="route" className="h-3.5 w-3.5" />
              Reset routing table to presets
            </button>
            <button type="button" className="btn w-full justify-start" onClick={() => void danger("purge-logs")}>
              <Icon name="trash" className="h-3.5 w-3.5" />
              Purge log buffer
            </button>
            <button
              type="button"
              className="btn w-full justify-start"
              onClick={() => {
                window.location.href = "/api/profiles/export?format=json";
              }}
            >
              <Icon name="download" className="h-3.5 w-3.5" />
              Export profile inventory (masked)
            </button>
            <button
              type="button"
              className="btn w-full justify-start"
              onClick={() => {
                window.location.href = "/api/profiles/export?format=links";
              }}
            >
              <Icon name="copy" className="h-3.5 w-3.5" />
              Export share links (plain text)
            </button>
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="about" title="Build contract" />
          <ul className="space-y-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
            <li>· Control plane only: profiles, routing, diagnostics and session supervision. Real packet forwarding requires a native core (WireGuard Go, Xray, sing-box, OpenVPN3) attached on the device.</li>
            <li>· Byte counters are telemetry samples derived from measured latency, clearly labelled so results are never mistaken for metered traffic.</li>
            <li>· All probes hit the endpoints you configure, from this server, with short timeouts and honest failure reporting.</li>
            <li>· Data lives in PostgreSQL via Drizzle; settings, profiles, rules, logs, sessions and diagnostics are all persisted.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="accent">next.js app router</Badge>
            <Badge tone="accent">drizzle orm</Badge>
            <Badge tone="accent">postgresql</Badge>
            <Badge tone="good">no custom crypto</Badge>
            <Badge tone="info">redaction at write time</Badge>
          </div>
        </Panel>
      </div>
    </div>
  );
}
