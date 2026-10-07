import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { getTunnelSnapshot } from "@/lib/snapshot";
import { getSettings, listNotifications } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const [snapshot, settings, alerts] = await Promise.all([getTunnelSnapshot(), getSettings(), listNotifications(1)]);

  return (
    <Shell
      initial={snapshot}
      unreadAlerts={alerts.unread}
      settings={{ operatorName: settings.operatorName, theme: settings.theme, accent: settings.accent }}
    >
      {children}
    </Shell>
  );
}
