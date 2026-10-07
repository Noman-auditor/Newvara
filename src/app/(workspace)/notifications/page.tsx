import { NotificationsView } from "@/components/notifications-view";
import { PageHeader } from "@/components/ui";
import { getSettings, listNotifications } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [data, settings] = await Promise.all([listNotifications(80), getSettings()]);

  return (
    <div>
      <PageHeader
        eyebrow="notification centre"
        title="Alerts derived from real state"
        description="Validation failures, latency alarms, certificate expiry, failed probes and quota pressure surface here — with a policy panel so you control the noise."
        stats={[
          { label: "unread", value: String(data.unread), tone: data.unread ? "tone-warn" : "tone-good" },
          { label: "stored", value: String(data.rows.length) },
          { label: "critical", value: String(data.counts.critical ?? 0), tone: (data.counts.critical ?? 0) ? "tone-bad" : "" },
          { label: "engine", value: settings.notifyEnabled ? "active" : "paused" },
        ]}
      />
      <NotificationsView
        initial={data.rows}
        policy={{
          notifyEnabled: settings.notifyEnabled,
          notifyLatency: settings.notifyLatency,
          notifyCert: settings.notifyCert,
          notifyValidation: settings.notifyValidation,
          notifyQuota: settings.notifyQuota,
          latencyAlarmMs: settings.latencyAlarmMs,
        }}
      />
    </div>
  );
}
