import { ConsentToggle } from "@/components/ConsentToggle";
import { ContactForm } from "@/components/ContactForm";
import { CsvImport } from "@/components/CsvImport";
import { query } from "@/lib/db";
import { isOptedIn, type Contact } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Row extends Contact {
  renewal_count: string;
  next_renewal: string | null;
}

export default async function ContactsPage() {
  const contacts = await query<Row>(
    `select c.*,
            (select count(*) from renewals r
              where r.contact_id = c.id and r.status = 'active')      as renewal_count,
            (select min(r.renews_on) from renewals r
              where r.contact_id = c.id and r.status = 'active'
                and r.renews_on >= current_date)                      as next_renewal
       from contacts c
      order by c.created_at desc
      limit 500`,
  );

  const optedIn = contacts.filter(isOptedIn).length;

  return (
    <>
      <div className="page-head">
        <h1>Contacts</h1>
        <p>
          {contacts.length} contact{contacts.length === 1 ? "" : "s"} · {optedIn} opted in.
          Only opted-in contacts can be messaged.
        </p>
      </div>

      <div className="toolbar">
        <ContactForm />
        <CsvImport />
      </div>

      <div className="card">
        {contacts.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No contacts yet</div>
            <div className="small">Add one above, or import a CSV.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Birthday</th>
                  <th>Renewals</th>
                  <th>Consent</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => {
                  const consented = isOptedIn(contact);
                  return (
                    <tr key={contact.id}>
                      <td>
                        <strong>{contact.name}</strong>
                        {contact.email && <div className="small muted">{contact.email}</div>}
                      </td>
                      <td className="mono nowrap">{contact.phone_e164}</td>
                      <td className="nowrap">
                        {contact.date_of_birth ? (
                          formatDayMonth(contact.date_of_birth)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="nowrap">
                        {Number(contact.renewal_count) === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <>
                            {contact.renewal_count} active
                            {contact.next_renewal && (
                              <div className="small muted">next {contact.next_renewal}</div>
                            )}
                          </>
                        )}
                      </td>
                      <td>
                        {consented ? (
                          <>
                            <span className="badge badge-ok">Opted in</span>
                            {contact.opt_in_source && (
                              <div className="small muted">{contact.opt_in_source}</div>
                            )}
                          </>
                        ) : contact.opt_out_at ? (
                          <span className="badge badge-danger">Opted out</span>
                        ) : (
                          <span className="badge badge-warn">No consent</span>
                        )}
                      </td>
                      <td className="nowrap">
                        <ConsentToggle contactId={contact.id} optedIn={consented} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function formatDayMonth(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split("-");
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(Date.UTC(2000, Number(month) - 1, Number(day))),
  );
}
