import { AppsView } from "@/components/apps-view";
import { PageHeader } from "@/components/ui";
import { getProfile, getRuntime, listRules } from "@/lib/store";
import { APP_CATALOG } from "@/lib/apps";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const [rules, runtimeRow] = await Promise.all([listRules(), getRuntime()]);
  const active = runtimeRow.activeProfileId ? await getProfile(runtimeRow.activeProfileId) : null;
  const processRules = rules.filter((rule) => rule.ruleType === "process");

  return (
    <div>
      <PageHeader
        eyebrow="split tunnel"
        title="Per-app routing"
        description="Decide which Android packages ride the tunnel, which stay direct and which are blocked outright. Choices are stored as process rules and verified by the decision simulator."
        stats={[
          { label: "apps in catalog", value: String(APP_CATALOG.length) },
          { label: "app rules", value: String(processRules.length) },
          { label: "blocked apps", value: String(processRules.filter((rule) => rule.action === "block").length) },
          { label: "default", value: active?.blockingMode ?? "rule" },
        ]}
      />
      <AppsView rules={rules} defaultAction={active?.blockingMode === "direct" ? "direct" : "proxy"} />
    </div>
  );
}
