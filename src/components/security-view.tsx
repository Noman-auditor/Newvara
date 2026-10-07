"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, Dot, Field, Icon, Meter, Panel, SectionTitle } from "@/components/ui";
import { Donut, Radar } from "@/components/charts";
import { CORES } from "@/lib/protocols";
import type { SecurityPosture } from "@/lib/store";

const EXAMPLE = `2026-02-11T09:12:44Z core handshake ok server=203.0.113.9:443
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJub3JhIn0.9aQxZm9uY2s1
vless://9d2b7c44-6f1a-4a1e-8f5b-2c3d4e5f6a7b@203.0.113.9:443?security=reality#edge
PrivateKey = QF9k1sJ1s0P4mH2jW8xR3vL6tZ7bY5nC0dE1fG2hI3k=
password=nora-demo-secret-2026 lan=192.168.1.24`;

export function SecurityView({ posture }: { posture: SecurityPosture }) {
  const router = useRouter();
  const { push } = useToast();
  const [text, setText] = useState(EXAMPLE);
  const [redacted, setRedacted] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ count: number; kinds: string[] } | null>(null);
  const [auditing, setAuditing] = useState(false);

  const runRedaction = async () => {
    const response = await fetch("/api/security", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "redact", text }),
    });
    const json = (await response.json()) as { ok: boolean; output?: string; count?: number; kinds?: string[] };
    if (json.ok) {
      setRedacted(json.output ?? "");
      setSummary({ count: json.count ?? 0, kinds: json.kinds ?? [] });
      router.refresh();
    }
  };

  const reaudit = async () => {
    setAuditing(true);
    try {
      const response = await fetch("/api/security", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "audit-config" }),
      });
      const json = (await response.json()) as { ok: boolean; posture?: SecurityPosture };
      if (json.ok && json.posture) {
        push({ title: `Posture re-scored: ${json.posture.score}/100`, detail: `grade ${json.posture.grade}`, tone: "good" });
        router.refresh();
      }
    } finally {
      setAuditing(false);
    }
  };

  const failing = posture.checks.filter((check) => check.status !== "pass");

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel strong className="flex flex-col items-center justify-center">
          <SectionTitle eyebrow="posture" title="Aggregate score" />
          <Donut value={posture.score} size={170} label={`${posture.score}`} sublabel={`grade ${posture.grade}`} />
          <p className="mt-3 text-center text-[11px]" style={{ color: "var(--text-dim)" }}>
            {failing.length === 0 ? "Every control is passing." : `${failing.length} open finding(s) across ${posture.checks.length} controls.`}
          </p>
          <button type="button" className="btn btn-primary mt-4 w-full" onClick={() => void reaudit()} disabled={auditing}>
            <Icon name={auditing ? "refresh" : "shield"} className={`h-3.5 w-3.5 ${auditing ? "spin-slow" : ""}`} />
            {auditing ? "Re-auditing…" : "Re-audit configuration"}
          </button>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="axes" title="Security dimensions" />
          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
            <Radar axes={posture.axes} />
            <div className="space-y-3">
              {posture.axes.map((axis) => (
                <div key={axis.axis}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span style={{ color: "var(--text-dim)" }}>{axis.axis}</span>
                    <span className="num">{axis.value}</span>
                  </div>
                  <div className="mt-1">
                    <Meter value={axis.value} tone={axis.value >= 85 ? "good" : axis.value >= 65 ? "warn" : "bad"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="cryptography" title="Upstream core inventory" />
          <div className="space-y-2">
            {CORES.map((core) => (
              <div key={core.id} className="rounded-xl border p-2.5" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">{core.label}</span>
                  <Badge tone="muted">{core.license}</Badge>
                </div>
                <p className="num mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  upstream: {core.upstream}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-dim)" }}>
            No cryptographic primitive is implemented in this project — the control plane supervises vetted upstream cores and never substitutes them with custom code.
          </p>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel>
          <SectionTitle eyebrow="controls" title="Security checks" description="Each control is evaluated against the live workspace state, not against a static checklist." />
          <div className="grid gap-2">
            {posture.checks.map((check) => (
              <div key={check.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-1.5">
                      <Dot tone={check.status === "pass" ? "good" : check.status === "warn" ? "warn" : "bad"} pulse={check.status !== "pass"} />
                    </span>
                    <div>
                      <p className="text-sm">{check.title}</p>
                      <p className="mt-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                        {check.detail}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={check.status === "pass" ? "good" : check.status === "warn" ? "warn" : "bad"}>{check.status}</Badge>
                    <p className="num mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                      weight {check.weight}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <SectionTitle
              eyebrow="redaction lab"
              title="What would be masked?"
              description="Paste any log line, diagnostic export or config fragment — the same redaction engine that guards the stored logs is applied here."
            />
            <Field label="Input">
              <textarea className="textarea num" rows={7} value={text} onChange={(event) => setText(event.target.value)} />
            </Field>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => void runRedaction()}>
                <Icon name="lock" className="h-3.5 w-3.5" />
                Redact
              </button>
              <button type="button" className="btn" onClick={() => setText("")}>
                Clear
              </button>
            </div>

            {redacted !== null ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={summary && summary.count > 0 ? "good" : "muted"}>{summary?.count ?? 0} match(es)</Badge>
                  {summary?.kinds.map((kind) => (
                    <span key={kind} className="chip">
                      {kind}
                    </span>
                  ))}
                </div>
                <pre className="num max-h-52 overflow-auto whitespace-pre-wrap rounded-xl border p-3 text-[11px] scroll-thin" style={{ borderColor: "var(--line)" }}>
                  {redacted}
                </pre>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="principles" title="Non-negotiables" />
            <ul className="space-y-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
              <li>· Imported configuration is untrusted input: parse → validate structure → validate required fields → validate protocol/core/transport compatibility → validate server address and port → normalise → reject malformed input.</li>
              <li>· Configuration values are never concatenated into shell commands; the address, path, SNI and service-name grammars reject shell metacharacters.</li>
              <li>· No fake connection state and no fake statistics: a session reads connected only after a real handshake, UDP-only endpoints degrade instead of lying.</li>
              <li>· Sensitive values are redacted from logs and diagnostic exports before they are persisted.</li>
            </ul>
          </Panel>
        </div>
      </section>
    </div>
  );
}
