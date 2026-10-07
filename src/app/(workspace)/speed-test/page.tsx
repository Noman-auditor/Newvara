import { SpeedTestView } from "@/components/speed-test-view";
import { PageHeader } from "@/components/ui";
import { getRuntime, listProfiles, listSpeedTests } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SpeedTestPage() {
  const [profiles, tests, runtimeRow] = await Promise.all([listProfiles(), listSpeedTests(40), getRuntime()]);
  const done = tests.filter((test) => test.status !== "fail");
  const summary = {
    count: tests.length,
    bestDownloadMbps: done.length ? Math.max(...done.map((test) => test.downloadMbps)) : 0,
    bestProfile: done.length ? done.reduce((acc, test) => (test.downloadMbps > acc.downloadMbps ? test : acc), done[0]).profileName : null,
    avgDownloadMbps: done.length ? Number((done.reduce((sum, test) => sum + test.downloadMbps, 0) / done.length).toFixed(2)) : 0,
    avgUploadMbps: done.length ? Number((done.reduce((sum, test) => sum + test.uploadMbps, 0) / done.length).toFixed(2)) : 0,
    avgLatencyMs: done.length ? Math.round(done.reduce((sum, test) => sum + test.latencyMs, 0) / done.length) : 0,
  };

  return (
    <div>
      <PageHeader
        eyebrow="speed lab"
        title="Throughput measurement"
        description="Streamed download and timed upload against the public speed endpoint, with endpoint reachability and idle latency measured alongside. Blocked directions are reported as failures."
        stats={[
          { label: "best download", value: summary.bestDownloadMbps ? `${summary.bestDownloadMbps} Mbit/s` : "—", tone: "tone-good" },
          { label: "average", value: summary.avgDownloadMbps ? `${summary.avgDownloadMbps} Mbit/s` : "—" },
          { label: "avg upload", value: summary.avgUploadMbps ? `${summary.avgUploadMbps} Mbit/s` : "—" },
          { label: "runs stored", value: String(summary.count) },
        ]}
      />
      <SpeedTestView profiles={profiles} tests={tests} summary={summary} activeProfileId={runtimeRow.activeProfileId} />
    </div>
  );
}
