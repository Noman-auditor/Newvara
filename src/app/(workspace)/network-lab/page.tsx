import { LabView } from "@/components/lab-view";
import { PageHeader } from "@/components/ui";
import { getRuntime, listDiagnostics, listProfiles } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function NetworkLabPage() {
  const [profiles, diagnostics, runtimeRow] = await Promise.all([listProfiles(), listDiagnostics(30), getRuntime()]);
  const failed = diagnostics.filter((row) => row.status === "fail").length;

  return (
    <div>
      <PageHeader
        eyebrow="network lab"
        title="Diagnostics & measurements"
        description="DNS resolution, TCP reachability, TLS negotiation, HTTP fronting and latency sweeps — all measured live from the control plane with real socket timings."
        stats={[
          { label: "probe runs", value: String(diagnostics.length) },
          { label: "failures", value: String(failed), tone: failed ? "tone-warn" : "tone-good" },
          { label: "profiles", value: String(profiles.length) },
          { label: "active profile", value: runtimeRow.activeProfileId ? `#${runtimeRow.activeProfileId}` : "none" },
        ]}
      />
      <LabView profiles={profiles} diagnostics={diagnostics} activeProfileId={runtimeRow.activeProfileId} />
    </div>
  );
}
