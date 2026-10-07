import { RoutingView } from "@/components/routing-view";
import { PageHeader } from "@/components/ui";
import { getProfile, getRuntime, listRules } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  const [rules, runtimeRow] = await Promise.all([listRules(), getRuntime()]);
  const active = runtimeRow.activeProfileId ? await getProfile(runtimeRow.activeProfileId) : null;
  const defaultAction = active?.blockingMode === "direct" ? "direct" : "proxy";

  return (
    <div>
      <PageHeader
        eyebrow="routing studio"
        title="Rule table & decision simulator"
        description="Priority ordered rules decide whether a flow is proxied, sent direct or blocked. The simulator walks the exact same engine the core adapter would compile."
        stats={[
          { label: "rules", value: String(rules.length) },
          { label: "active", value: String(rules.filter((rule) => rule.enabled).length), tone: "tone-good" },
          { label: "block rules", value: String(rules.filter((rule) => rule.action === "block").length), tone: "tone-bad" },
          { label: "default policy", value: defaultAction },
        ]}
      />
      <RoutingView rules={rules} defaultAction={defaultAction} />
    </div>
  );
}
