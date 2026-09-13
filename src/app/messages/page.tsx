import { query } from "@/lib/db";
import type { MessageStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  contact_name: string;
  to_phone: string;
  template_name: string;
  category: string;
  status: MessageStatus;
  rendered_body: string;
  attempts: number;
  error_title: string | null;
  error_detail: string | null;
  wa_message_id: string | null;
  created_at: Date;
  sent_at: Date | null;
}

const BADGE: Record<MessageStatus, string> = {
  queued: "badge-warn",
  sending: "badge-warn",
  sent: "badge-ok",
  delivered: "badge-ok",
  read: "badge-ok",
  failed: "badge-danger",
  cancelled: "",
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status && status !== "all" ? status : null;

  const messages = await query<Row>(
    `select m.id, c.name as contact_name, m.to_phone, m.template_name, m.category,
            m.status, m.rendered_body, m.attempts, m.error_title, m.error_detail,
            m.wa_message_id, m.created_at, m.sent_at
       from messages m
       join contacts c on c.id = m.contact_id
      where ($1::text is null or m.status = $1)
      order by m.created_at desc
      limit 200`,
    [filter],
  );

  const counts = await query<{ status: MessageStatus; count: string }>(
    `select status, count(*) as count from messages group by status`,
  );
  const total = counts.reduce((sum, row) => sum + Number(row.count), 0);

  return (
    <>
      <div className="page-head">
        <h1>Messages</h1>
        <p>Every send, with its delivery status as WhatsApp reports it back.</p>
      </div>

      <div className="toolbar">
        <FilterLink current={filter} value={null} label={`All (${total})`} />
        {counts
          .sort((a, b) => Number(b.count) - Number(a.count))
          .map((row) => (
            <FilterLink
              key={row.status}
              current={filter}
              value={row.status}
              label={`${row.status} (${row.count})`}
            />
          ))}
      </div>

      <div className="card">
        {messages.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Nothing here yet</div>
            <div className="small">
              {filter ? `No messages with status "${filter}".` : "Send something from the dashboard."}
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Message</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((message) => (
                  <tr key={message.id}>
                    <td>
                      <strong>{message.contact_name}</strong>
                      <div className="small muted mono">{message.to_phone}</div>
                    </td>
                    <td style={{ maxWidth: 380 }}>
                      {message.rendered_body}
                      {message.error_title && (
                        <div className="small" style={{ color: "var(--danger)", marginTop: 4 }}>
                          {message.error_title}
                          {message.error_detail ? `: ${message.error_detail}` : ""}
                          {message.attempts > 1 && ` (${message.attempts} attempts)`}
                        </div>
                      )}
                    </td>
                    <td className="nowrap">
                      <div className="small mono">{message.template_name}</div>
                      <span
                        className={`badge ${
                          message.category === "MARKETING" ? "badge-marketing" : "badge-utility"
                        }`}
                      >
                        {message.category}
                      </span>
                    </td>
                    <td className="nowrap">
                      <span className={`badge ${BADGE[message.status]}`}>{message.status}</span>
                    </td>
                    <td className="nowrap small muted">
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(message.sent_at ?? message.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function FilterLink({
  current,
  value,
  label,
}: {
  current: string | null;
  value: string | null;
  label: string;
}) {
  const active = current === value;
  return (
    <a
      href={value ? `/messages?status=${value}` : "/messages"}
      className={`badge ${active ? "badge-ok" : ""}`}
      style={{ textDecoration: "none", padding: "4px 10px" }}
    >
      {label}
    </a>
  );
}
