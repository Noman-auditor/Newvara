import { HistoryView } from "@/components/history-view";
import { PageHeader } from "@/components/ui";
import { getDashboardStats, listSessions } from "@/lib/store";
import { formatBytes, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const [sessions, stats] = await Promise.all([listSessions(60), getDashboardStats()]);

  return (
    <div>
      <PageHeader
        eyebrow="session history"
        title="Connection record & telemetry archive"
        description="Locally stored sessions with throughput shape, latency drift, handshake stages and the note explaining how each session ended."
        stats={[
          { label: "sessions", value: String(stats.sessionCount) },
          { label: "downloaded", value: formatBytes(stats.totalRx) },
          { label: "uploaded", value: formatBytes(stats.totalTx) },
          { label: "connected time", value: formatDuration(stats.totalSeconds) },
        ]}
      />
      <HistoryView sessions={sessions} stats={stats} />
    </div>
  );
}
