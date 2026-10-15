"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase";
import { orNull, text } from "@/lib/admin-properties";
import { STATUS as MAINT_STATUS } from "@/lib/maintenance";
import { STAGES, TASK_SELECT, checklistProgress, sortTasks } from "@/lib/turnovers";

async function saveTask(id, changes) {
  const { data, error } = await getBrowserClient().from("turnover_tasks").update(changes).eq("id", id).select(TASK_SELECT);
  if (error || !data?.length) throw new Error("That didn't save. Try again.");
  return data[0];
}

function TaskRow({ task, unitId, onSaved }) {
  const [fields, setFields] = useState({
    due_date: text(task.due_date),
    assigned_to: text(task.assigned_to),
    notes: text(task.notes),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(changes) {
    setBusy(true);
    setError("");
    try {
      onSaved(await saveTask(task.id, changes));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const saveField = (key) => () => {
    const value = key === "due_date" ? fields[key] || null : orNull(fields[key]);
    if (value === (task[key] ?? null)) return;
    save({ [key]: value });
  };
  const edit = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  const workOrderHref = `/admin/maintenance/new?unit=${unitId}&task=${task.id}&title=${encodeURIComponent(task.title)}`;
  const base = `task-${task.id}`;

  return (
    <li className={`task${task.done ? " is-done" : ""}${task.not_needed ? " is-skipped" : ""}`}>
      <div className="task-main">
        <label className="check-line task-title">
          <input
            type="checkbox"
            checked={task.done}
            disabled={busy || task.not_needed}
            onChange={(e) => save({ done: e.target.checked })}
          />
          <span>
            <b>{task.title}</b>
            {task.help ? <span className="task-help">{task.help}</span> : null}
          </span>
        </label>
        <label className="check-line small">
          <input
            type="checkbox"
            checked={task.not_needed}
            disabled={busy}
            onChange={(e) => save({ not_needed: e.target.checked, ...(e.target.checked ? { done: false } : {}) })}
          />
          Not needed
        </label>
      </div>

      <div className="task-fields">
        <div className="field">
          <label htmlFor={`${base}-due`}>Due</label>
          <input id={`${base}-due`} type="date" value={fields.due_date} onChange={edit("due_date")} onBlur={saveField("due_date")} />
        </div>
        <div className="field">
          <label htmlFor={`${base}-who`}>Assigned to</label>
          <input
            id={`${base}-who`}
            value={fields.assigned_to}
            onChange={edit("assigned_to")}
            onBlur={saveField("assigned_to")}
            placeholder="e.g. Chuck"
            autoComplete="off"
          />
        </div>
        <div className="field task-notes">
          <label htmlFor={`${base}-notes`}>Notes</label>
          <textarea id={`${base}-notes`} rows={1} value={fields.notes} onChange={edit("notes")} onBlur={saveField("notes")} />
        </div>
      </div>

      <div className="task-work">
        {task.maintenance ? (
          <>
            <Link href={`/admin/maintenance/${task.maintenance.id}`}>Work order: {task.maintenance.title}</Link>
            <span className={`pill ms-${task.maintenance.status}`}>{MAINT_STATUS[task.maintenance.status] || task.maintenance.status}</span>
          </>
        ) : (
          <Link className="btn ghost sm" href={workOrderHref}>
            Create work order
          </Link>
        )}
        {task.done && task.done_at ? (
          <span className="small">Done {new Date(task.done_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</span>
        ) : null}
        {error ? (
          <span className="small err" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function AddTask({ turnoverId, stage, nextOrder, onAdded }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return setError("Add a short title for the task.");
    setBusy(true);
    const { data, error: err } = await getBrowserClient()
      .from("turnover_tasks")
      .insert({ turnover_id: turnoverId, stage, title: title.trim(), sort_order: nextOrder })
      .select(TASK_SELECT)
      .single();
    setBusy(false);
    if (err) return setError("We couldn't add the task. Try again.");
    onAdded(data);
    setTitle("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
        Add task
      </button>
    );
  }
  return (
    <form className="task-add" onSubmit={add} noValidate>
      <label className="visually-hidden" htmlFor={`add-${stage}`}>
        New task title
      </label>
      <input
        id={`add-${stage}`}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setError("");
        }}
        placeholder="Task title"
        maxLength={120}
        autoComplete="off"
        autoFocus
      />
      <button type="submit" className="btn primary sm" disabled={busy}>
        {busy ? "Adding…" : "Add"}
      </button>
      <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error ? (
        <span className="small err" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}

export default function TurnoverChecklist({ turnoverId, unitId, tasks, onTasks }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sorted = sortTasks(tasks);
  const { finished, total } = checklistProgress(tasks);

  const replace = (task) => onTasks(tasks.map((t) => (t.id === task.id ? task : t)));

  async function addStandard() {
    setBusy(true);
    setError("");
    const sb = getBrowserClient();
    const added = await sb.rpc("add_turnover_checklist", { p_turnover_id: turnoverId, p_from_stage: "notice" });
    const fresh = await sb.from("turnover_tasks").select(TASK_SELECT).eq("turnover_id", turnoverId);
    setBusy(false);
    if (added.error || fresh.error) return setError("We couldn't add the checklist. Try again.");
    onTasks(fresh.data || []);
  }

  return (
    <section className="boxed stack" aria-labelledby="sec-checklist">
      <div className="sec-head">
        <h2 id="sec-checklist" className="sec-title">
          Checklist
        </h2>
        {total ? (
          <span className="small">
            <span className="num">
              {finished} of {total}
            </span>{" "}
            done or not needed
          </span>
        ) : null}
      </div>

      {error ? <div className="warnbox">{error}</div> : null}

      {!total ? (
        <div className="empty">
          <h2>No checklist yet</h2>
          <p>Add the standard turnover checklist, from notice through leasing. You can add or skip tasks after.</p>
          <button type="button" className="btn primary" onClick={addStandard} disabled={busy}>
            {busy ? "Adding…" : "Add the standard checklist"}
          </button>
        </div>
      ) : (
        STAGES.map((stage) => {
          const list = sorted.filter((t) => t.stage === stage.key);
          const nextOrder = list.reduce((m, t) => Math.max(m, t.sort_order || 0), 0) + 10;
          return (
            <div key={stage.key} className="task-stage">
              <h3 className="sub-title">{stage.label}</h3>
              {list.length ? (
                <ul className="task-list">
                  {list.map((t) => (
                    <TaskRow key={t.id} task={t} unitId={unitId} onSaved={replace} />
                  ))}
                </ul>
              ) : (
                <p className="small">No tasks in this stage.</p>
              )}
              <AddTask turnoverId={turnoverId} stage={stage.key} nextOrder={nextOrder} onAdded={(t) => onTasks([...tasks, t])} />
            </div>
          );
        })
      )}
    </section>
  );
}
