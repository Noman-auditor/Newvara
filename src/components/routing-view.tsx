"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { Badge, Dot, EmptyState, Field, Icon, KV, Modal, Panel, SectionTitle } from "@/components/ui";
import { Bars, Donut } from "@/components/charts";
import { GEOIP_KEYS, GEOSITE_KEYS, RULE_PRESETS, RULE_TYPE_META, ruleCoverage } from "@/lib/routing";
import type { RoutingRuleRow } from "@/db/schema";
import type { RoutingDecision, RuleLike } from "@/lib/types";

const ACTIONS: { value: string; label: string; tone: "good" | "info" | "bad" }[] = [
  { value: "proxy", label: "Proxy", tone: "good" },
  { value: "direct", label: "Direct", tone: "info" },
  { value: "block", label: "Block", tone: "bad" },
];

const SAMPLES = ["www.google.com", "digikala.ir", "doubleclick.net", "api.github.com", "nora.local", "netflix.com"];

export function RoutingView({ rules, defaultAction }: { rules: RoutingRuleRow[]; defaultAction: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [rows, setRows] = useState<RuleLike[]>(rules);
  const [host, setHost] = useState("digikala.ir");
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("");
  const [app, setApp] = useState("");
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  const [testing, setTesting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Omit<RuleLike, "id">>({
    name: "",
    ruleType: "domain_suffix",
    value: "",
    action: "proxy",
    priority: 60,
    enabled: true,
  });

  useEffect(() => setRows(rules), [rules]);

  const coverage = useMemo(() => ruleCoverage(rows), [rows]);

  const persist = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json()) as { ok: boolean; rules?: RuleLike[]; error?: string };
      if (json.ok && json.rules) setRows(json.rules);
      if (!json.ok) push({ title: "Routing update failed", detail: json.error, tone: "bad" });
      router.refresh();
      return json;
    },
    [push, router],
  );

  const patchRule = useCallback(
    async (rule: RuleLike, patch: Partial<RuleLike>) => {
      setRows((current) => current.map((item) => (item.id === rule.id ? { ...item, ...patch } : item)));
      await fetch("/api/rules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: rule.id, ...patch }),
      });
      router.refresh();
    },
    [router],
  );

  const deleteRule = useCallback(
    async (rule: RuleLike) => {
      setRows((current) => current.filter((item) => item.id !== rule.id));
      await fetch(`/api/rules?id=${rule.id}`, { method: "DELETE" });
      push({ title: "Rule removed", detail: rule.name, tone: "info" });
      router.refresh();
    },
    [push, router],
  );

  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      const next = [...rows];
      const target = index + direction;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      setRows(next.map((rule, position) => ({ ...rule, priority: (position + 1) * 5 })));
      await persist({ action: "reorder", order: next.map((rule) => rule.id) });
    },
    [rows, persist],
  );

  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      const response = await fetch("/api/rules/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host,
          ip: ip || undefined,
          port: port ? Number(port) : undefined,
          app: app || undefined,
          defaultAction,
        }),
      });
      const json = (await response.json()) as { ok: boolean; decision?: RoutingDecision; error?: string };
      if (json.ok && json.decision) {
        setDecision(json.decision);
        router.refresh();
      } else {
        push({ title: "Simulation failed", detail: json.error, tone: "bad" });
      }
    } finally {
      setTesting(false);
    }
  }, [host, ip, port, app, defaultAction, push, router]);

  const meta = RULE_TYPE_META[draft.ruleType];

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel>
          <SectionTitle
            eyebrow="decision simulator"
            title="Where would this traffic go?"
            description="Evaluates the live rule table in priority order and explains every layer it inspected."
            action={
              <button type="button" className="btn btn-primary" onClick={() => void runTest()} disabled={testing}>
                <Icon name={testing ? "refresh" : "bolt"} className={`h-3.5 w-3.5 ${testing ? "spin-slow" : ""}`} />
                Evaluate
              </button>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Hostname or IP">
              <input className="input num" value={host} onChange={(event) => setHost(event.target.value)} placeholder="example.com" />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Resolved IP">
                <input className="input num" value={ip} onChange={(event) => setIp(event.target.value)} placeholder="203.0.113.7" />
              </Field>
              <Field label="Port">
                <input className="input num" value={port} onChange={(event) => setPort(event.target.value)} placeholder="443" />
              </Field>
              <Field label="App">
                <input className="input num" value={app} onChange={(event) => setApp(event.target.value)} placeholder="chrome" />
              </Field>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SAMPLES.map((sample) => (
              <button key={sample} type="button" className="btn px-2 py-1 text-[11px]" onClick={() => setHost(sample)}>
                {sample}
              </button>
            ))}
          </div>

          {decision ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                <Badge tone={decision.decision === "proxy" ? "good" : decision.decision === "direct" ? "info" : "bad"}>{decision.decision}</Badge>
                <p className="text-sm">{decision.reason}</p>
                <span className="num ml-auto chip">confidence {(decision.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border p-2 scroll-thin" style={{ borderColor: "var(--line)" }}>
                {decision.trace.map((step, index) => (
                  <div key={`${step.layer}-${index}`} className="flex items-start gap-2 rounded-lg px-2 py-1.5" style={{ background: step.result === "match" ? "var(--accent-soft)" : "transparent" }}>
                    <span className="mt-1">
                      <Dot tone={step.result === "match" ? "good" : step.result === "miss" ? "muted" : "info"} />
                    </span>
                    <span className="num w-24 shrink-0 text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {step.layer}
                    </span>
                    <span className="text-[11px]" style={{ color: step.result === "match" ? "var(--text)" : "var(--text-dim)" }}>
                      {step.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs" style={{ color: "var(--text-faint)" }}>
              No simulation yet. Pick a host above and evaluate against {rows.filter((rule) => rule.enabled).length} active rules.
            </p>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <SectionTitle eyebrow="coverage" title="Rule distribution" />
            <div className="flex items-center justify-between gap-4">
              <Donut value={Math.round(((coverage.proxy + coverage.block) / Math.max(1, coverage.proxy + coverage.direct + coverage.block)) * 100)} sublabel="steered" />
              <div className="flex-1 space-y-2">
                {ACTIONS.map((action) => {
                  const count = coverage[action.value] ?? 0;
                  return (
                    <div key={action.value}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span style={{ color: "var(--text-dim)" }}>{action.label}</span>
                        <span className="num">{count}</span>
                      </div>
                      <Bars values={[count, count, count]} tones={[action.tone, action.tone, action.tone]} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 grid gap-1">
              <KV label="rule count" value={`${rows.length} (${rows.filter((rule) => rule.enabled).length} active)`} />
              <KV label="default policy" value={defaultAction} />
              <KV label="presets available" value={String(RULE_PRESETS.length)} />
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="presets" title="One-click routing templates" />
            <div className="space-y-2">
              {RULE_PRESETS.map((preset) => (
                <div key={preset.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">{preset.name}</p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {preset.description}
                      </p>
                    </div>
                    <button type="button" className="btn px-2.5 py-1.5 text-[11px]" onClick={() => void persist({ action: "preset", presetId: preset.id })}>
                      <Icon name="plus" className="h-3.5 w-3.5" />
                      Apply
                    </button>
                  </div>
                  <p className="num mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {preset.rules.map((rule) => `${rule.action}:${rule.ruleType}=${rule.value}`).join("  ·  ")}
                  </p>
                </div>
              ))}
            </div>
            <button type="button" className="btn mt-3 w-full" onClick={() => void persist({ action: "reset" })}>
              <Icon name="refresh" className="h-3.5 w-3.5" />
              Reset table to baseline presets
            </button>
          </Panel>
        </div>
      </section>

      <Panel padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <SectionTitle eyebrow="routing table" title="Priority ordered rules" action={undefined} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" className="h-3.5 w-3.5" />
              Add rule
            </button>
          </div>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="data min-w-[860px]">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
                <th>Action</th>
                <th>State</th>
                <th className="text-right">Controls</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rule, index) => (
                <tr key={rule.id ?? `${rule.name}-${index}`}>
                  <td className="num">{String(rule.priority).padStart(3, "0")}</td>
                  <td className="font-medium">{rule.name}</td>
                  <td>
                    <Badge tone={RULE_TYPE_META[rule.ruleType]?.group === "domain" ? "info" : "muted"}>{RULE_TYPE_META[rule.ruleType]?.label ?? rule.ruleType}</Badge>
                  </td>
                  <td className="num text-[11px]">{rule.value}</td>
                  <td>
                    <select
                      className="select w-auto text-[11px]"
                      value={rule.action}
                      onChange={(event) => void patchRule(rule, { action: event.target.value })}
                    >
                      {ACTIONS.map((action) => (
                        <option key={action.value} value={action.value}>
                          {action.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn px-2 py-1 text-[11px]"
                      onClick={() => void patchRule(rule, { enabled: !rule.enabled })}
                      style={rule.enabled ? { background: "var(--accent-soft)" } : undefined}
                    >
                      <Dot tone={rule.enabled ? "good" : "muted"} pulse={rule.enabled} />
                      {rule.enabled ? "active" : "off"}
                    </button>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => void move(index, -1)} aria-label="Move up">
                        ↑
                      </button>
                      <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => void move(index, 1)} aria-label="Move down">
                        ↓
                      </button>
                      <button type="button" className="btn btn-danger px-2 py-1 text-[11px]" onClick={() => void deleteRule(rule)} aria-label="Delete">
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <div className="p-4"><EmptyState title="Routing table empty" description="Apply a preset or add a rule." /></div> : null}
        </div>
      </Panel>

      <Panel>
        <SectionTitle eyebrow="reference" title="Bundled demo sets" description="GeoIP and geosite sets ship as small honest subsets — replace them with upstream rule-sets in production." />
        <div className="flex flex-wrap gap-2">
          {GEOIP_KEYS.map((key) => (
            <span key={key} className="chip">geoip:{key}</span>
          ))}
          {GEOSITE_KEYS.map((key) => (
            <span key={key} className="chip">geosite:{key}</span>
          ))}
        </div>
      </Panel>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add routing rule"
        description="Rules are compiled in priority order; the first match wins and the rest are skipped."
        width="max-w-xl"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                if (!draft.name || !draft.value) {
                  push({ title: "Name and value are required", tone: "warn" });
                  return;
                }
                await persist({ ...draft, rule_action: draft.action });
                push({ title: "Rule added", detail: `${draft.name} → ${draft.action}`, tone: "good" });
                setCreateOpen(false);
                setDraft({ name: "", ruleType: "domain_suffix", value: "", action: "proxy", priority: 60, enabled: true });
              }}
            >
              Add rule
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rule name">
              <input className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Block trackers" />
            </Field>
            <Field label="Match type">
              <select className="select" value={draft.ruleType} onChange={(event) => setDraft({ ...draft, ruleType: event.target.value })}>
                {Object.entries(RULE_TYPE_META).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Match value" hint={meta?.hint}>
            <input
              className="input num"
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              placeholder={meta?.placeholder}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Action">
              <select className="select" value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })}>
                {ACTIONS.map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority" hint="lower runs first">
              <input
                className="input num"
                type="number"
                value={draft.priority}
                onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
              />
            </Field>
            <Field label="Enabled">
              <select className="select" value={draft.enabled ? "yes" : "no"} onChange={(event) => setDraft({ ...draft, enabled: event.target.value === "yes" })}>
                <option value="yes">Active</option>
                <option value="no">Disabled</option>
              </select>
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
