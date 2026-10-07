import { headers } from "next/headers";
import { ApkView } from "@/components/apk-view";
import { PageHeader } from "@/components/ui";
import { ANDROID_APP, buildSteps, lanAddresses } from "@/lib/android";

export const dynamic = "force-dynamic";

export default async function ApkPage() {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const port = Number(host.split(":")[1] ?? (proto === "https" ? 443 : 80));
  const lan = lanAddresses(port, proto);

  return (
    <div>
      <PageHeader
        eyebrow="deployment"
        title="APK & phone install"
        description="Push once, let GitHub Actions build the Android shell, then install the APK on your phone. The workflow, Capacitor config and manifest patcher are already part of this project."
        stats={[
          { label: "artifact", value: ANDROID_APP.artifact },
          { label: "workflow", value: "build-apk.yml" },
          { label: "min android", value: ANDROID_APP.minAndroid },
          { label: "workspace host", value: host.length > 24 ? `${host.slice(0, 22)}…` : host },
        ]}
      />
      <ApkView origin={origin} lan={lan} steps={buildSteps(origin)} />
    </div>
  );
}
