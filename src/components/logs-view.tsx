"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { useAutoRefresh, Badge, Icon, Panel, SectionTitle, Tabs, Toggle } from "@/components/ui";
import type { LogRow } from "@/db/schema";

const LEVELS = ["all", "debug", "info", "audit", "warn", "error"] as const;

export function LogsView({ initial, scopes }: { initial: LogRow[]; scopes: string[] }) {
  const { push } = useToast();
  const [rows, setRows] = useState<LogRow[]>(initial);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("all");
  const [scope, setScope] = useState("all");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState(true);
  const [note, setNote] = useState("");
  const [scopeList, setScopeList] = useState(scopes);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ level, scope, limit: "200" });
    if (query) params.set("q", query);
    const response = await fetch(`/api/logs?${params.toString()}`, { cache: "no-store" });
    const json = (await response.json()) as { ok: boolean; logs?: LogRow[]; scopes?: string[] };
    if (json.ok && json.logs) setRows(json.logs);
    if (json.ok && json.scopes) setScopeList(json.scopes);
  }, [level, scope, query]);

  // Initial fetch and refetch whenever the filters change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useAutoRefresh(() => void load(), 6000, live);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: rows.length };
    for (const row of rows) map[row.level] = (map[row.level] ?? 0) + 1;
    return map;
  }, [rows]);

  const redactions = rows.reduce((sum, row) => sum + row.redactions, 0);

  const purge = async () => {
    const response = await fetch(`/api/logs?scope=${scope}`, { method: "DELETE" });
    if (response.ok) {
      push({ title: "Log buffer purged", detail: `scope=${scope}`, tone: "info" });
      await load();
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nora-logs-${new Date().toISOString().slice(0, 19)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    push({ title: "Diagnostic export prepared", detail: "Secrets were already redacted at write time.", tone: "good" });
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await fetch("/api/logs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: note, level: "audit", scope: "operator" }),
    });
    setNote("");
    push({ title: "Note appended to the audit trail", tone: "good" });
    await load();
  };

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle
          eyebrow="filters"
          title="Log stream"
          description="Every entry is redacted before it is stored, so the audit trail can be exported safely."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Toggle checked={live} onChange={setLive} label="Live tail" />
              <button type="button" className="btn" onClick={() => void load()}>
                <Icon name="refresh" className="h-3.5 w-3.5" />
                Reload
              </button>
              <button type="button" className="btn" onClick={exportJson}>
                <Icon name="download" className="h-3.5 w-3.5" />
                Export JSON
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void purge()}>
                <Icon name="trash" className="h-3.5 w-3.5" />
                Purge
              </button>
            </div>
          }
        />
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            tabs={LEVELS.map((item) => ({ value: item, label: item, count: counts[item] ?? 0 }))}
            value={level}
            onChange={setLevel}
          />
          <select className="select w-auto" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="all">All scopes</option>
            {scopeList.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            className="input w-auto min-w-[200px] flex-1"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search message text…"
          />
          <span className="num chip">{redactions} secret(s) masked</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="input min-w-[220px] flex-1"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Append an operator note to the audit trail…"
          />
          <button type="button" className="btn" onClick={() => void addNote()}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            Add note
          </button>
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="max-h-[70vh] overflow-y-auto scroll-thin">
          <table className="data">
            <thead>
              <tr>
                <th>Time</th>
                <th>Level</th>
                <th>Scope</th>
                <th>Message</th>
                <th className="text-right">Masked</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="num whitespace-nowrap text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 19)}
                  </td>
                  <td>
                    <Badge tone={row.level === "error" ? "bad" : row.level === "warn" ? "warn" : row.level === "audit" ? "info" : row.level === "debug" ? "muted" : "good"}>
                      {row.level}
                    </Badge>
                  </td>
                  <td className="num text-[11px]">{row.scope}</td>
                  <td className="text-[12px]">{row.message}</td>
                  <td className="num text-right text-[11px]">{row.redactions || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="p-6 text-center text-xs" style={{ color: "var(--text-faint)" }}>
              No log entries match the current filters.
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
