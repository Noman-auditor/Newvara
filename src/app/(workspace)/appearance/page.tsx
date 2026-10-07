import { AppearanceView } from "@/components/appearance-view";
import { PageHeader } from "@/components/ui";
import { getAppearance, getSettings } from "@/lib/store";
import { THEME_PRESETS } from "@/components/theme-provider";

export const dynamic = "force-dynamic";

export default async function AppearancePage() {
  const [appearance, settings] = await Promise.all([getAppearance(), getSettings()]);

  return (
    <div>
      <PageHeader
        eyebrow="appearance studio"
        title="Customise the entire interface"
        description="Presets, custom accent trios, glass depth, aurora glow, backdrop patterns, corner radius, density, typography and motion — every axis is live, persisted in PostgreSQL, and applied before first paint."
        stats={[
          { label: "preset", value: String(appearance.presetName) },
          { label: "theme", value: String(settings.theme) },
          { label: "density", value: String(appearance.density) },
          { label: "type", value: String(appearance.fontFamily) },
        ]}
      />
      <AppearanceView initialTheme={settings.theme === "light" ? "light" : "dark"} />
    </div>
  );
}
