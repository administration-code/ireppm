"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase";
import { loadTenancyOptions } from "@/lib/rent";
import { fillTemplate, mergeContext } from "@/lib/email-merge";
import TenancyPicker from "@/components/admin/TenancyPicker";
import EmailTabs from "./EmailTabs";

// Staff: fill a template for a tenancy or landlord and save it as a draft to review.
export default function NewEmail() {
  const router = useRouter();
  const params = useSearchParams();
  const [templates, setTemplates] = useState([]);
  const [tenancies, setTenancies] = useState([]);
  const [owners, setOwners] = useState([]);
  const [f, setF] = useState({
    template: params.get("template") || "",
    tenancy_id: params.get("tenancy") || "",
    owner_id: params.get("owner") || "",
    amount: params.get("amount") || "",
    date: "",
    custom: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const sb = getBrowserClient();
    Promise.all([
      sb.from("email_templates").select("key, name, audience, subject, body").order("sort_order"),
      loadTenancyOptions({ includePast: true }).catch(() => []),
      sb.from("owners").select("id, name, email").order("name"),
    ]).then(([t, ten, o]) => {
      setTemplates(t.data || []);
      setTenancies(ten);
      setOwners(o.data || []);
    });
  }, []);

  // From a task's prepared draft (e.g. an LMR top-up): make the draft straight away.
  useEffect(() => {
    const taskId = params.get("task");
    if (!taskId) return;
    (async () => {
      const sb = getBrowserClient();
      const { data: task } = await sb.from("staff_tasks").select("*").eq("id", taskId).maybeSingle();
      if (!task?.data?.body) return;
      const { data, error } = await sb
        .from("email_drafts")
        .insert({
          template_key: task.data.template || null,
          to_emails: task.data.to || [],
          subject: task.data.subject || task.title,
          body: task.data.body,
          tenancy_id: task.tenancy_id,
          property_id: task.property_id,
          task_id: task.id,
        })
        .select("id")
        .single();
      if (error) return setMsg(error.message);
      router.replace(`/admin/emails/${data.id}`);
    })();
  }, [params, router]);

  const template = templates.find((t) => t.key === f.template);
  const forLandlord = template?.audience === "landlord" || (template?.audience === "any" && f.owner_id && !f.tenancy_id);

  async function create(e) {
    e.preventDefault();
    if (!template) return setMsg("Choose a template.");
    if (!f.tenancy_id && !f.owner_id) return setMsg("Choose who it's for.");
    setBusy(true);
    const { values, to, ids } = await mergeContext({ tenancyId: f.tenancy_id, ownerId: f.owner_id, amount: f.amount, date: f.date, custom: f.custom });
    const { data, error } = await getBrowserClient()
      .from("email_drafts")
      .insert({ template_key: template.key, to_emails: to, subject: fillTemplate(template.subject, values), body: fillTemplate(template.body, values), ...ids })
      .select("id")
      .single();
    setBusy(false);
    if (error) return setMsg(error.message);
    router.push(`/admin/emails/${data.id}`);
  }

  const needs = (k) => template && (template.body.includes(`{{${k}}}`) || template.subject.includes(`{{${k}}}`));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <EmailTabs title="New Email" subtitle="Pick a template and who it's for. You'll see the filled-in draft and can edit it before sending." />
      <form className="boxed stack" onSubmit={create} noValidate>
        <div className="field">
          <label htmlFor="ne-t">Template</label>
          <select id="ne-t" value={f.template} onChange={(e) => setF((s) => ({ ...s, template: e.target.value }))}>
            <option value="">Choose…</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {template?.audience === "landlord" || (template?.audience === "any" && !f.tenancy_id) ? (
          <div className="field">
            <label htmlFor="ne-o">Landlord</label>
            <select id="ne-o" value={f.owner_id} onChange={(e) => setF((s) => ({ ...s, owner_id: e.target.value }))}>
              <option value="">Choose…</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {!forLandlord ? (
          <TenancyPicker id="ne-ten" label="Tenancy" tenancies={tenancies} value={f.tenancy_id} onChange={(v) => setF((s) => ({ ...s, tenancy_id: v?.target ? v.target.value : v }))} />
        ) : null}
        <div className="row2">
          {needs("amount") ? (
            <div className="field">
              <label htmlFor="ne-amt">Amount ($)</label>
              <input id="ne-amt" inputMode="decimal" value={f.amount} onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} />
            </div>
          ) : null}
          {needs("date") ? (
            <div className="field">
              <label htmlFor="ne-date">Date</label>
              <input id="ne-date" type="date" value={f.date} onChange={(e) => setF((s) => ({ ...s, date: e.target.value }))} />
            </div>
          ) : null}
        </div>
        {needs("custom") ? (
          <div className="field">
            <label htmlFor="ne-c">Your text for this email</label>
            <textarea id="ne-c" rows={4} value={f.custom} onChange={(e) => setF((s) => ({ ...s, custom: e.target.value }))} />
          </div>
        ) : null}
        {msg ? <div className="warnbox">{msg}</div> : null}
        <div>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Creating…" : "Create Draft"}
          </button>
        </div>
        <p className="small" style={{ margin: 0 }}>Nothing is sent until you review the draft and click Send.</p>
      </form>
    </div>
  );
}
