"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Dot, Icon } from "@/components/ui";
import { relativeTime } from "@/lib/format";
import type { NotificationRow } from "@/db/schema";

const TONE: Record<string, "bad" | "warn" | "good" | "info"> = { critical: "bad", warn: "warn", success: "good", info: "info" };

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(initialUnread);
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);
  const router = useRouter();

  const load = useCallback(async (sync = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/notifications?limit=12${sync ? "" : "&sync=0"}`, { cache: "no-store" });
      const json = (await response.json()) as { ok: boolean; rows?: NotificationRow[]; unread?: number };
      if (json.ok) {
        setRows(json.rows ?? []);
        setUnread(json.unread ?? 0);
        loaded.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const timer = setInterval(() => void load(false), 45000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const markAll = async () => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "mark", read: true }),
    });
    await load(false);
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="btn relative px-2.5 py-1.5"
        onClick={() => {
          setOpen((value) => !value);
          if (!loaded.current) void load(true);
        }}
        aria-label="Notifications"
      >
        <Icon name="alert" className="h-3.5 w-3.5" />
        {unread > 0 ? <span className="bell-badge">{unread > 99 ? "99+" : unread}</span> : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="glass-strong absolute right-0 top-11 z-50 w-[min(92vw,24rem)] overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
              <div>
                <p className="eyebrow">alerts</p>
                <p className="text-sm font-medium">{unread} unread</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => void load(true)} disabled={loading}>
                  <Icon name="refresh" className={`h-3.5 w-3.5 ${loading ? "spin-slow" : ""}`} />
                </button>
                <button type="button" className="btn px-2 py-1 text-[11px]" onClick={() => void markAll()} disabled={unread === 0}>
                  mark read
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto scroll-thin">
              {rows.length === 0 ? (
                <p className="p-4 text-center text-xs" style={{ color: "var(--text-faint)" }}>
                  No alerts — the control plane has nothing to flag right now.
                </p>
              ) : null}
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 border-b p-3 transition last:border-0 hover:bg-white/5"
                  style={{ borderColor: "var(--line)", background: row.read ? undefined : "var(--accent-soft)" }}
                >
                  <span className="mt-1">
                    <Dot tone={TONE[row.level] ?? "info"} pulse={row.level === "critical"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[12.5px] font-medium">{row.title}</span>
                      <Badge tone={TONE[row.level] ?? "info"}>{row.level}</Badge>
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[11px]" style={{ color: "var(--text-dim)" }}>
                      {row.body}
                    </span>
                    <span className="num mt-1 block text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {relativeTime(row.createdAt)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="border-t p-2" style={{ borderColor: "var(--line)" }}>
              <Link href="/notifications" onClick={() => setOpen(false)} className="btn w-full justify-center">
                Open notification centre
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
