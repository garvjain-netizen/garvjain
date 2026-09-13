import { ModeBanner } from "@/components/ModeBanner";
import { SendAllButton } from "@/components/SendAllButton";
import { SendButton } from "@/components/SendButton";
import { getStats, getTodaysActions, type ActionItem } from "@/lib/dashboard";
import { todayIn } from "@/lib/dates";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, actions] = await Promise.all([getStats(), getTodaysActions()]);
  const today = todayIn(env.businessTimezone);
  const pending = actions.filter((a) => !a.alreadySent && !a.blocked);

  return (
    <>
      <ModeBanner />

      <div className="page-head">
        <h1>Today</h1>
        <p>
          {new Intl.DateTimeFormat("en-GB", { dateStyle: "full" }).format(
            new Date(`${today.iso}T00:00:00Z`),
          )}{" "}
          · {env.businessTimezone}
        </p>
      </div>

      <section className="stats">
        <Stat label="Birthdays today" value={stats.birthdaysToday} />
        <Stat label="Renewals in 30 days" value={stats.renewalsDue30} />
        <Stat label="Queued" value={stats.queued} />
        <Stat label="Sent today" value={stats.sentToday} />
        <Stat label="Failed" value={stats.failed} danger />
        <Stat label="Opted in" value={`${stats.optedIn}/${stats.contacts}`} />
      </section>

      <h2 className="section">Ready to send</h2>

      <div className="toolbar">
        <SendAllButton count={pending.length} />
        <span className="spacer" />
        <span className="small muted">
          Reminders fire at {env.renewalReminderDays.join(", ")} day(s) before each renewal
        </span>
      </div>

      <div className="card">
        {actions.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Nothing due today</div>
            <div className="small">
              No birthdays and no renewals at the configured reminder offsets.
            </div>
          </div>
        ) : (
          actions.map((item) => <ActionRow key={item.id} item={item} />)
        )}
      </div>
    </>
  );
}

function Stat({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  const isZero = value === 0 || value === "0";
  const classes = [
    "stat-value",
    isZero ? "is-zero" : "",
    danger && !isZero ? "is-danger" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={classes}>{value}</div>
    </div>
  );
}

function ActionRow({ item }: { item: ActionItem }) {
  const isBirthday = item.kind === "birthday";
  return (
    <div className="row">
      <div className="row-main">
        <div className="row-title">
          {item.contactName}
          <span className={`badge ${isBirthday ? "badge-marketing" : "badge-utility"}`}>
            {isBirthday ? "Birthday · Marketing" : "Renewal · Utility"}
          </span>
          {item.alreadySent && (
            <span className="badge badge-ok">Already {item.alreadySent.status}</span>
          )}
        </div>
        <div className="row-sub">
          <span className="mono">{item.phone}</span>
          {item.renewalLabel && ` · ${item.renewalLabel}`}
          {item.daysUntil !== null &&
            ` · due in ${item.daysUntil} day${item.daysUntil === 1 ? "" : "s"}`}
        </div>
        {item.preview && <div className="preview">{item.preview}</div>}
      </div>
      <div className="row-action">
        {item.alreadySent ? (
          <span className="badge">No action needed</span>
        ) : (
          <SendButton
            contactId={item.contactId}
            kind={item.kind}
            renewalId={item.renewalId}
            disabled={item.blocked !== null}
            disabledReason={item.blocked}
          />
        )}
      </div>
    </div>
  );
}
