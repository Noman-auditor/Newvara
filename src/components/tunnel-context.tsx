"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TunnelSnapshot } from "@/lib/snapshot";
import type { ProbeStage } from "@/lib/types";
import { useToast } from "@/components/toast";

type TunnelApi = {
  snapshot: TunnelSnapshot;
  busy: boolean;
  refreshing: boolean;
  stages: ProbeStage[] | null;
  refresh: (tick?: boolean) => Promise<void>;
  connect: (profileId: number) => Promise<boolean>;
  disconnect: () => Promise<void>;
  toggle: () => Promise<void>;
};

export const FALLBACK_SNAPSHOT: TunnelSnapshot = {
  state: "disconnected",
  stage: "idle",
  latencyMs: null,
  jitterMs: null,
  rxBytes: 0,
  txBytes: 0,
  packetsIn: 0,
  packetsOut: 0,
  drops: 0,
  uptimeSec: 0,
  connectedAt: null,
  endpointIp: null,
  controlEgressIp: null,
  samples: [],
  sessionId: null,
  activeProfile: null,
  rules: { total: 0, active: 0, proxy: 0, direct: 0, block: 0 },
  settings: {
    theme: "dark",
    accent: "violet",
    dnsPrimary: "1.1.1.1",
    dnsSecondary: "1.0.0.1",
    dnsMode: "encrypted",
    ipv6Mode: "block",
    strictValidation: true,
    redactSecrets: true,
    latencyAlarmMs: 220,
    operatorName: "local-operator",
    dataCapGb: 50,
    autoConnect: false,
  },
  telemetry: { source: "none", deviceReporting: false, deviceModel: null, coreVersion: null, lastReportAt: null },
  honesty: "No paired device is reporting yet, so no measured counters are available.",
};

const TunnelContext = createContext<TunnelApi>({
  snapshot: FALLBACK_SNAPSHOT,
  busy: false,
  refreshing: false,
  stages: null,
  refresh: async () => undefined,
  connect: async () => false,
  disconnect: async () => undefined,
  toggle: async () => undefined,
});

export function useTunnel() {
  return useContext(TunnelContext);
}

export function TunnelProvider({ initial, children }: { initial: TunnelSnapshot; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<TunnelSnapshot>(initial);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stages, setStages] = useState<ProbeStage[] | null>(null);
  const { push } = useToast();
  const inFlight = useRef(false);

  const refresh = useCallback(
    async (tick = true) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRefreshing(true);
      try {
        const response = await fetch(`/api/tunnel${tick ? "?tick=1" : ""}`, { cache: "no-store" });
        const json = (await response.json()) as { ok: boolean; snapshot?: TunnelSnapshot; error?: string };
        if (json.ok && json.snapshot) setSnapshot(json.snapshot);
      } catch {
        /* offline — keep last snapshot */
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [],
  );

  const connect = useCallback(
    async (profileId: number) => {
      setBusy(true);
      try {
        const response = await fetch("/api/tunnel", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "connect", profileId }),
        });
        const json = (await response.json()) as {
          ok: boolean;
          result?: { ok: boolean; error?: string; state?: string; stages?: ProbeStage[]; note?: string };
          snapshot?: TunnelSnapshot;
          error?: string;
        };
        if (json.snapshot) setSnapshot(json.snapshot);
        if (json.result?.stages) setStages(json.result.stages);
        if (json.result?.ok) {
          push({
            title: json.result.state === "degraded" ? "Session degraded" : "Tunnel session established",
            detail:
              json.result.note ??
              "Control-plane handshake succeeded. Byte counters are telemetry samples in this web build.",
            tone: json.result.state === "degraded" ? "warn" : "good",
          });
          return true;
        }
        push({ title: "Connection refused", detail: json.result?.error ?? json.error ?? "Handshake failed", tone: "bad" });
        return false;
      } catch (error) {
        push({ title: "Connection failed", detail: (error as Error).message, tone: "bad" });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [push],
  );

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/tunnel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disconnect", reason: "operator request" }),
      });
      const json = (await response.json()) as { ok: boolean; snapshot?: TunnelSnapshot };
      if (json.snapshot) setSnapshot(json.snapshot);
      push({ title: "Session closed", detail: "Telemetry committed to history.", tone: "info" });
    } catch (error) {
      push({ title: "Disconnect failed", detail: (error as Error).message, tone: "bad" });
    } finally {
      setBusy(false);
    }
  }, [push]);

  const toggle = useCallback(async () => {
    if (snapshot.state === "connected" || snapshot.state === "degraded") {
      await disconnect();
      return;
    }
    if (snapshot.activeProfile?.id) {
      await connect(snapshot.activeProfile.id);
      return;
    }
    try {
      const response = await fetch("/api/profiles", { cache: "no-store" });
      const json = (await response.json()) as { profiles?: { id: number; validationStatus: string }[] };
      const candidate = json.profiles?.find((profile) => profile.validationStatus !== "invalid") ?? json.profiles?.[0];
      if (candidate) await connect(candidate.id);
      else push({ title: "No profiles yet", detail: "Import a share link first.", tone: "warn" });
    } catch (error) {
      push({ title: "Could not pick a profile", detail: (error as Error).message, tone: "bad" });
    }
  }, [snapshot, connect, disconnect, push]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const api = useMemo(
    () => ({ snapshot, busy, refreshing, stages, refresh, connect, disconnect, toggle }),
    [snapshot, busy, refreshing, stages, refresh, connect, disconnect, toggle],
  );

  return <TunnelContext.Provider value={api}>{children}</TunnelContext.Provider>;
}
