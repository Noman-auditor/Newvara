"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";
import { useAutoRefresh, Badge, Dot, EmptyState, Icon, Panel, SectionTitle, Tabs, Toggle } from "@/components/ui";
import { Bars, Donut } from "@/components/charts";
import { relativeTime } from "@/lib/format";
import type { NotificationRow } from "@/db/schema";

type Policy = {
  notifyEnabled: boolean;
  notifyLatency: boolean;
  notifyCert: boolean;
  notifyValidation: boolean;
  notifyQuota: boolean;
  latencyAlarmMs: number;
};

const LEVEL_TONE: Record<string, "bad" | "warn" | "good" | "info"> = {
  critical: "bad",
  warn: "warn",
  success: "good",
  info: "info",
};

export function NotificationsView({ initial, policy }: { initial: NotificationRow[]; policy: Policy }) {
  const router = useRouter();
  const { push } = useToast();
  const [rows, setRows] = useState<NotificationRow[]>(initial);
  const [filter, setFilter] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(policy);

  const load = useCallback(async () => {
    const response = await fetch("/api/notifications?limit=80", { cache: "no-store" });
    const json = (await response.json()) as { ok: boolean; rows?: NotificationRow[] };
    if (json.ok && json.rows) setRows(json.rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useAutoRefresh(() => void load(), 15000, live);

  const counts = useMemo(() => {
    const tally: Record<string, number> = { all: rows.length };
    for (const row of rows) {
      tally[row.kind] = (tally[row.kind] ?? 0) + 1;
      tally[row.level] = (tally[row.level] ?? 0) + 1;
    }
    return tally;
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (unreadOnly && row.read) return false;
        if (filter === "all") return true;
        return row.kind === filter || row.level === filter;
      }),
    [rows, filter, unreadOnly],
  );

  const unread = rows.filter((row) => !row.read).length;
  const rating = rows.length ? Math.round((rows.filter((row) => row.level === "success" || row.level === "info").length / rows.length) * 100) : 100;

  const mark = async (read: boolean, ids?: number[]) => {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark", read, ids }),
      });
      const json = (await response.json()) as { ok: boolean; rows?: NotificationRow[] };
      if (json.ok && json.rows) setRows(json.rows);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const clear = async (kind?: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear", kind }),
      });
      const json = (await response.json()) as { ok: boolean; rows?: NotificationRow[]; removed?: number };
      if (json.ok && json.rows) setRows(json.rows);
      push({ title: "Alerts cleared", detail: `${json.removed ?? 0} entr(ies) removed`, tone: "info" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const rescan = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const json = (await response.json()) as { ok: boolean; rows?: NotificationRow[]; raised?: number };
      if (json.ok && json.rows) setRows(json.rows);
      push({
        title: json.raised ? `${json.raised} new alert(s) raised` : "No new findings",
        detail: "State re-evaluated against validation, latency, certificates, quota and probes.",
        tone: json.raised ? "warn" : "good",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const updatePolicy = async (patch: Partial<Policy>) => {
    setSettings((current) => ({ ...current, ...patch }));
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel>
          <SectionTitle
            eyebrow="alert feed"
            title="Everything the control plane wants you to know"
            description="Alerts are derived from real state — validator findings, measured latency, certificate expiry from TLS probes, failed diagnostics and session quota — and de-duplicated by signature."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Toggle checked={live} onChange={setLive} label="Live" />
                <button type="button" className="btn" onClick={() => void rescan()} disabled={busy}>
                  <Icon name="refresh" className={`h-3.5 w-3.5 ${busy ? "spin-slow" : ""}`} />
                  Re-scan state
                </button>
              </div>
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              tabs={[
                { value: "all", label: "All", count: counts.all },
                { value: "critical", label: "Critical", count: counts.critical ?? 0 },
                { value: "warn", label: "Warning", count: counts.warn ?? 0 },
                { value: "info", label: "Info", count: counts.info ?? 0 },
                { value: "certificate", label: "Certificates", count: counts.certificate ?? 0 },
                { value: "latency", label: "Latency", count: counts.latency ?? 0 },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <button
              type="button"
              className="btn ml-auto px-2.5 py-1 text-[11px]"
              style={unreadOnly ? { background: "var(--accent-soft)", borderColor: "var(--line-strong)" } : undefined}
              onClick={() => setUnreadOnly((value) => !value)}
            >
              <Icon name="filter" className="h-3.5 w-3.5" />
              unread only ({unread})
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {filtered.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border p-3 transition"
                style={{ borderColor: row.read ? "var(--line)" : "var(--line-strong)", background: row.read ? "transparent" : "var(--accent-soft)" }}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span className="mt-1">
                    <Dot tone={LEVEL_TONE[row.level] ?? "info"} pulse={row.level === "critical"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {row.title}
                      <Badge tone={LEVEL_TONE[row.level] ?? "info"}>{row.level}</Badge>
                      <span className="chip">{row.kind}</span>
                      {!row.read ? <Badge tone="accent">new</Badge> : null}
                    </p>
                    <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-dim)" }}>
                      {row.body}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="num text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {relativeTime(row.createdAt)} · {row.source}
                      </span>
                      {row.actionHref ? (
                        <Link className="btn px-2 py-1 text-[11px]" href={row.actionHref}>
                          {row.actionLabel ?? "Open"}
                        </Link>
                      ) : null}
                      <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => void mark(!row.read, [row.id])}>
                        mark {row.read ? "unread" : "read"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 ? (
              <EmptyState
                title="No alerts in this view"
                description="Run a diagnostic or connect a profile, then re-scan state to populate the feed."
              />
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => void mark(true)} disabled={busy || unread === 0}>
              <Icon name="check" className="h-3.5 w-3.5" />
              Mark all read
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void clear("all")} disabled={busy || rows.length === 0}>
              <Icon name="trash" className="h-3.5 w-3.5" />
              Clear feed
            </button>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <SectionTitle eyebrow="health" title="Alert mix" />
            <div className="flex items-center justify-between gap-4">
              <Donut value={rating} label={`${rating}`} sublabel="quiet ratio" />
              <div className="flex-1">
                <Bars
                  values={[counts.critical ?? 0, counts.warn ?? 0, counts.info ?? 0, counts.success ?? 0]}
                  tones={["bad", "warn", "info", "good"]}
                  labels={["crit", "warn", "info", "ok"]}
                />
              </div>
            </div>
            <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
              {unread} unread of {rows.length} stored alerts.
            </p>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="policy" title="What should raise an alert" />
            <div className="space-y-2">
              <Toggle checked={settings.notifyEnabled} onChange={(value) => void updatePolicy({ notifyEnabled: value })} label="Alerts enabled" hint="Master switch for the background engine." />
              <Toggle checked={settings.notifyValidation} onChange={(value) => void updatePolicy({ notifyValidation: value })} label="Validator findings" hint="Critical when a profile is blocked by structural validation." />
              <Toggle checked={settings.notifyLatency} onChange={(value) => void updatePolicy({ notifyLatency: value })} label="Latency alarm" hint={`Raises when measured RTT exceeds ${settings.latencyAlarmMs}ms.`} />
              <Toggle checked={settings.notifyCert} onChange={(value) => void updatePolicy({ notifyCert: value })} label="Certificate expiry" hint="Uses the real notAfter date read during TLS probes." />
              <Toggle checked={settings.notifyQuota} onChange={(value) => void updatePolicy({ notifyQuota: value })} label="Session quota" hint="Warns at 80% and escalates when the cap is reached." />
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="automation tips" title="Keep the feed useful" />
            <ul className="space-y-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
              <li>· Alerts de-duplicate by signature, so a repeated condition does not spam the feed.</li>
              <li>· Certificate warnings fire from measured probe data, not from a guess — run a TLS probe to refresh them.</li>
              <li>· Clearing the feed is logged to the audit trail with the number of entries removed.</li>
            </ul>
          </Panel>
        </div>
      </section>
    </div>
  );
}
