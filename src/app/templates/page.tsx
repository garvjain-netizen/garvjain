import { TemplateForm } from "@/components/TemplateForm";
import { query } from "@/lib/db";
import { AVAILABLE_VARIABLES } from "@/lib/templates";
import type { Template } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await query<Template>(`select * from templates order by kind, name`);

  return (
    <>
      <div className="page-head">
        <h1>Templates</h1>
        <p>
          WhatsApp only lets a business start a conversation with a template Meta has approved.
          These rows mirror what exists in WhatsApp Manager.
        </p>
      </div>

      <div className="toolbar">
        <TemplateForm availableVariables={AVAILABLE_VARIABLES} />
      </div>

      <div className="card">
        {templates.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No templates</div>
            <div className="small">
              The scheduler needs one <code>birthday</code> and one <code>renewal</code> template,
              both approved, before it can queue anything.
            </div>
          </div>
        ) : (
          templates.map((template) => (
            <div className="row" key={template.id}>
              <div className="row-main">
                <div className="row-title">
                  <span className="mono">{template.name}</span>
                  <span
                    className={`badge ${
                      template.category === "MARKETING" ? "badge-marketing" : "badge-utility"
                    }`}
                  >
                    {template.category}
                  </span>
                  <span
                    className={`badge ${
                      template.status === "APPROVED"
                        ? "badge-ok"
                        : template.status === "REJECTED"
                          ? "badge-danger"
                          : "badge-warn"
                    }`}
                  >
                    {template.status}
                  </span>
                  {!template.active && <span className="badge">inactive</span>}
                </div>
                <div className="row-sub">
                  {template.language} · used for {template.kind}
                  {template.variables.length > 0 && ` · ${template.variables.join(", ")}`}
                </div>
                <div className="preview">{template.body}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <h2 className="section">Available variables</h2>
      <div className="card card-pad">
        <div className="small muted" style={{ marginBottom: 8 }}>
          Any of these can fill a {"{{n}}"} placeholder. Values are collapsed to a single line
          before sending — Meta rejects parameters containing newlines.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {AVAILABLE_VARIABLES.map((variable) => (
            <span key={variable} className="badge mono">{variable}</span>
          ))}
        </div>
      </div>
    </>
  );
}
