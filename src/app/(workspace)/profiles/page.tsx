import { ProfilesView } from "@/components/profiles-view";
import { PageHeader } from "@/components/ui";
import { listProfiles, profileGroups } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const [profiles, groups] = await Promise.all([listProfiles(), profileGroups()]);
  const valid = profiles.filter((profile) => profile.validationStatus === "valid").length;
  const warnings = profiles.filter((profile) => profile.validationStatus === "warnings").length;
  const invalid = profiles.filter((profile) => profile.validationStatus === "invalid").length;
  const favorites = profiles.filter((profile) => profile.favorite).length;

  return (
    <div>
      <PageHeader
        eyebrow="profile library"
        title="Tunnel profiles"
        description="Import untrusted share links, validate them structurally, normalise field values and export deployable sing-box configuration. Nothing imported is ever executed."
        stats={[
          { label: "profiles", value: String(profiles.length) },
          { label: "clean", value: String(valid), tone: "tone-good" },
          { label: "with findings", value: `${warnings} / ${invalid}`, tone: warnings + invalid ? "tone-warn" : "" },
          { label: "favourites", value: String(favorites) },
        ]}
      />
      <ProfilesView profiles={profiles} groups={groups} />
    </div>
  );
}
