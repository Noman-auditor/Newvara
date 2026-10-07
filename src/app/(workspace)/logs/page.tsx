import { LogsView } from "@/components/logs-view";
import { PageHeader } from "@/components/ui";
import { listLogs, logScopes } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const [rows, scopes] = await Promise.all([listLogs({ limit: 200 }), logScopes()]);
  const masked = rows.reduce((sum, row) => sum + row.redactions, 0);
  const errors = rows.filter((row) => row.level === "error").length;

  return (
    <div>
      <PageHeader
        eyebrow="log centre"
        title="Audit trail & redacted diagnostics"
        description="Every entry passes through the redaction engine before it is written, so exports are safe to share with a support channel."
        stats={[
          { label: "entries", value: String(rows.length) },
          { label: "scopes", value: String(scopes.length) },
          { label: "secrets masked", value: String(masked), tone: "tone-good" },
          { label: "errors", value: String(errors), tone: errors ? "tone-bad" : "tone-good" },
        ]}
      />
      <LogsView initial={rows} scopes={scopes} />
    </div>
  );
}
