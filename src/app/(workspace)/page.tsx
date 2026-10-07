import { DashboardView } from "@/components/dashboard-view";
import {
  getDashboardStats,
  getSecurityPosture,
  listDiagnostics,
  listLogs,
  listNotifications,
  listProfiles,
  listSessions,
  syncNotifications,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await syncNotifications({ respectPolicy: true });
  const [stats, sessions, diagnostics, logs, profiles, posture, alerts] = await Promise.all([
    getDashboardStats(),
    listSessions(12),
    listDiagnostics(8),
    listLogs({ limit: 14 }),
    listProfiles(),
    getSecurityPosture(),
    listNotifications(6),
  ]);

  const lastDiagnostic = diagnostics[0] ?? null;

  return (
    <DashboardView
      stats={stats}
      sessions={sessions}
      diagnostics={diagnostics}
      logs={logs}
      profiles={profiles}
      posture={posture}
      alerts={alerts.rows}
      activeDiag={{
        kind: lastDiagnostic?.kind ?? null,
        payload: lastDiagnostic?.summary ?? null,
        stages: (lastDiagnostic?.stages ?? []).map((stage) => ({
          stage: stage.stage,
          label: stage.label,
          status: stage.status,
          durationMs: stage.durationMs,
          detail: stage.detail,
        })),
      }}
    />
  );
}
