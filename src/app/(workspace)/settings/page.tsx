import { SettingsView } from "@/components/settings-view";
import { PageHeader } from "@/components/ui";
import { getSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div>
      <PageHeader
        eyebrow="workspace"
        title="Settings & defaults"
        description="Defaults applied to every new profile, the DNS posture used by probes and the safety gates that decide what the control plane will refuse to do."
        stats={[
          { label: "theme", value: settings.theme },
          { label: "accent", value: settings.accent },
          { label: "dns mode", value: settings.dnsMode },
          { label: "strict gate", value: settings.strictValidation ? "on" : "off", tone: settings.strictValidation ? "tone-good" : "tone-warn" },
        ]}
      />
      <SettingsView settings={settings} />
    </div>
  );
}
