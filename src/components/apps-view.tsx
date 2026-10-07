"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { Badge, EmptyState, Icon, Panel, SectionTitle, Segmented } from "@/components/ui";
import { Donut } from "@/components/charts";
import { APP_BUNDLES, APP_CATALOG, APP_CATEGORIES, type AppEntry } from "@/lib/apps";
import type { RoutingRuleRow } from "@/db/schema";

type Action = "proxy" | "direct" | "block";

const ACTION_TONE: Record<Action, "good" | "info" | "bad"> = { proxy: "good", direct: "info", block: "bad" };

function ruleToAction(rule: RoutingRuleRow | undefined, fallback: Action): Action {
  if (!rule) return fallback;
  return (rule.action as Action) ?? fallback;
}

export function AppsView({ rules, defaultAction }: { rules: RoutingRuleRow[]; defaultAction: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Action>>({});

  const processRules = useMemo(() => {
    const map = new Map<string, RoutingRuleRow>();
    for (const rule of rules) {
      if (rule.ruleType === "process") map.set(rule.value.toLowerCase(), rule);
    }
    return map;
  }, [rules]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return APP_CATALOG.filter((app) => {
      if (category !== "all" && app.category !== category) return false;
      if (!needle) return true;
      return `${app.label} ${app.package} ${app.category}`.toLowerCase().includes(needle);
    });
  }, [query, category]);

  const effectivePlan = useMemo(() => {
    const plan: Record<string, Action> = {};
    for (const app of APP_CATALOG) {
      const override = overrides[app.package];
      plan[app.package] = override ?? ruleToAction(processRules.get(app.package.toLowerCase()), app.recommended);
    }
    return plan;
  }, [overrides, processRules]);

  const counts = useMemo(() => {
    const tally: Record<Action, number> = { proxy: 0, direct: 0, block: 0 };
    for (const action of Object.values(effectivePlan)) tally[action] += 1;
    return tally;
  }, [effectivePlan]);

  const setAction = async (app: AppEntry, action: Action) => {
    setBusy(app.package);
    const existing = processRules.get(app.package.toLowerCase());
    try {
      if (action === app.recommended && existing) {
        await fetch(`/api/rules?id=${existing.id}`, { method: "DELETE" });
      } else if (existing) {
        await fetch("/api/rules", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: existing.id, action, enabled: true }),
        });
      } else {
        await fetch("/api/rules", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: `App: ${app.label}`,
            ruleType: "process",
            value: app.package,
            rule_action: action,
            priority: 35,
            enabled: true,
          }),
        });
      }
      setOverrides((current) => ({ ...current, [app.package]: action }));
      push({ title: `${app.label} → ${action}`, detail: app.package, tone: action === "block" ? "bad" : action === "proxy" ? "good" : "info" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const applyBundle = async (bundle: (typeof APP_BUNDLES)[number]) => {
    setBusy(bundle.id);
    try {
      const targets = APP_CATALOG.filter((app) => bundle.categories.includes(app.category));
      for (const app of targets) {
        const existing = processRules.get(app.package.toLowerCase());
        if (existing) {
          await fetch("/api/rules", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: existing.id, action: bundle.action, enabled: true }),
          });
        } else {
          await fetch("/api/rules", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: `App: ${app.label}`,
              ruleType: "process",
              value: app.package,
              rule_action: bundle.action,
              priority: 35,
              enabled: true,
            }),
          });
        }
        setOverrides((current) => ({ ...current, [app.package]: bundle.action }));
      }
      push({ title: `${bundle.name} applied`, detail: `${targets.length} app(s) → ${bundle.action}`, tone: "good" });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const generatedRules = APP_CATALOG.filter((app) => processRules.has(app.package.toLowerCase()));

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel>
          <SectionTitle
            eyebrow="split tunnel"
            title="Per-app routing"
            description="Each choice compiles into a process rule in the shared routing table, so the decision simulator can prove it too."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <input className="input w-40" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search app or package…" />
                <Segmented
                  value={category}
                  onChange={setCategory}
                  size="sm"
                  options={[{ value: "all", label: "All" }, ...APP_CATEGORIES.map((item) => ({ value: item, label: item }))]}
                />
              </div>
            }
          />
          <div className="space-y-2">
            {visible.map((app) => {
              const action = effectivePlan[app.package];
              const customised = action !== app.recommended;
              return (
                <div key={app.package} className="flex flex-wrap items-center gap-3 rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <span className="grid h-9 w-9 place-items-center rounded-xl border text-base" style={{ borderColor: "var(--line-strong)" }}>
                    {app.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm">
                      {app.label}
                      <Badge tone={ACTION_TONE[action]}>{action}</Badge>
                      {customised ? <Badge tone="accent">custom</Badge> : null}
                    </p>
                    <p className="num truncate text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {app.package}
                    </p>
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-dim)" }}>
                      {app.why}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {(["proxy", "direct", "block"] as Action[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        disabled={busy === app.package}
                        className="btn px-2.5 py-1 text-[11px]"
                        style={action === option ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
                        onClick={() => void setAction(app, option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {visible.length === 0 ? <EmptyState title="No apps match" description="Try another search term or category." /> : null}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <SectionTitle eyebrow="balance" title="Routing split" />
            <div className="flex items-center justify-between gap-4">
              <Donut value={Math.round(((counts.proxy + counts.block) / Math.max(1, counts.proxy + counts.direct + counts.block)) * 100)} sublabel="off-tunnel" label={`${counts.direct}`} />
              <div className="flex-1 space-y-2">
                {(["proxy", "direct", "block"] as Action[]).map((action) => (
                  <div key={action} className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: "var(--line)" }}>
                    <span className="flex items-center gap-2 text-xs">
                      <Badge tone={ACTION_TONE[action]}>{action}</Badge>
                    </span>
                    <span className="num text-sm">{counts[action]}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
              <p>
                Default policy: <span className="num" style={{ color: "var(--text)" }}>{defaultAction}</span> · apps without a rule follow it.
              </p>
              <p>{generatedRules.length} app rule(s) currently stored in the routing table.</p>
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="bundles" title="One-tap app policies" description="Applies a whole category at once — fast and reversible through the routing studio." />
            <div className="space-y-2">
              {APP_BUNDLES.map((bundle) => (
                <div key={bundle.id} className="rounded-2xl border p-3" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">
                        {bundle.emoji} {bundle.name}
                      </p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {bundle.description}
                      </p>
                    </div>
                    <button type="button" className="btn px-2.5 py-1.5 text-[11px]" disabled={busy !== null} onClick={() => void applyBundle(bundle)}>
                      <Icon name={busy === bundle.id ? "refresh" : "bolt"} className={`h-3.5 w-3.5 ${busy === bundle.id ? "spin-slow" : ""}`} />
                      {bundle.action}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="honesty" title="What per-app routing means here" />
            <ul className="space-y-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
              <li>· Nora Tunnel stores the intent (proxy / direct / block per package) and compiles it into the routing table you can test in the simulator.</li>
              <li>· Enforcing it on a phone needs the native VpnService + core integration — this web control plane will not pretend it is already filtering packets.</li>
              <li>· Package names come from a representative Android catalog; add your own through a process rule in the routing studio.</li>
            </ul>
          </Panel>
        </div>
      </section>
    </div>
  );
}
