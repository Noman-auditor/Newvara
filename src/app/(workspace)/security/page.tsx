import { SecurityView } from "@/components/security-view";
import { PageHeader } from "@/components/ui";
import { getSecurityPosture } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const posture = await getSecurityPosture();
  const failing = posture.checks.filter((check) => check.status === "fail").length;
  const warnings = posture.checks.filter((check) => check.status === "warn").length;

  return (
    <div>
      <PageHeader
        eyebrow="security centre"
        title="Posture, redaction & cryptography inventory"
        description="Live evaluation of the validation gate, injection guards, redaction pipeline, DNS/IPv6 containment and honest-state reporting."
        stats={[
          { label: "posture", value: `${posture.score}/100`, tone: posture.score >= 85 ? "tone-good" : "tone-warn" },
          { label: "grade", value: posture.grade },
          { label: "failing controls", value: String(failing), tone: failing ? "tone-bad" : "tone-good" },
          { label: "warnings", value: String(warnings), tone: warnings ? "tone-warn" : "tone-good" },
        ]}
      />
      <SecurityView posture={posture} />
    </div>
  );
}
