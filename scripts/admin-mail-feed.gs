/**
 * IRep PM — administration@ mailbox feed (Communications timeline, Inbox, and maintenance requests
 * from tenant emails).
 * Runs inside the Gmail account administration@ireppm.ca. Every 10 minutes it sends each new email
 * received (inbox) and sent (sent mail) to https://ireppm.ca/api/admin-mail/intake: sender, recipients,
 * subject, text, thread and attachment names. The portal matches it to the tenant, landlord, applicant
 * or partner and labels it. For maintenance emails the portal asks for the photos and videos, and
 * this script uploads only those. It never uploads attachments that look like ID or licences.
 * It only reads mail: it never replies, forwards, labels or deletes anything.
 * Interac e-Transfer emails are skipped (the Interac feed handles those for rent matching).
 *
 * Setup (once, signed in to Google as administration@ireppm.ca):
 *  1. script.google.com → New project → paste this whole file → Save.
 *  2. Project Settings → Script Properties → Add property: SECRET = the INBOUND_MAIL_SECRET value in Vercel.
 *  3. Run "testConnection" (allow access). The log should say "Connected".
 *  4. Run "setup" to start the 10-minute check.
 *  (Already set up? Paste this file over the old one and Save. Nothing else changes.)
 */
// Goes through IRep's Supabase relay: Vercel challenges requests from Google's script servers.
const ENDPOINT = 'https://xtmvfqnnmrbgucfelvtu.supabase.co/functions/v1/mail-relay?to=admin-mail';
const INTERAC = /interac\.ca|payments\.interac/i;

function secret_() {
  const s = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!s) throw new Error('Add the SECRET script property first.');
  return s;
}
function post_(payload) {
  return UrlFetchApp.fetch(ENDPOINT, {
    method: 'post', contentType: 'application/json', headers: { 'x-mail-secret': secret_() },
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
}
function testConnection() {
  const code = post_({ ping: true }).getResponseCode();
  console.log(code === 200 ? 'Connected' : 'Unexpected ' + code + ' (401 means the SECRET does not match Vercel)');
}
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkInbox').timeBased().everyMinutes(10).create();
  checkInbox();
}
function addr_(s) {
  const m = String(s || '').match(/^(.*?)\s*<(.+)>$/);
  return { name: m ? m[1].replace(/"/g, '') : '', email: (m ? m[2] : String(s || '')).trim().toLowerCase() };
}
function list_(s) {
  return String(s || '').split(',').map((x) => addr_(x).email).filter((x) => x.indexOf('@') > 0);
}
function send_(msg, direction, done) {
  const id = msg.getId();
  if (done.has(id)) return;
  const from = addr_(msg.getFrom());
  if (INTERAC.test(from.email) || INTERAC.test(msg.getSubject())) { done.add(id); return; }
  const files = msg.getAttachments({ includeInlineImages: true, includeAttachments: true }).slice(0, 12);
  let draftId = '';
  try { draftId = msg.getHeader('X-IRep-Draft') || ''; } catch (e) {}
  const res = post_({
    message_id: id,
    thread_id: msg.getThread().getId(),
    direction: direction,
    draft_id: draftId,
    from_name: from.name,
    from_email: from.email,
    to_emails: list_(msg.getTo()).concat(list_(msg.getCc())),
    subject: msg.getSubject(),
    body: (msg.getPlainBody() || '').slice(0, 8000),
    received_at: msg.getDate().toISOString(),
    attachments: files.map((a) => ({ name: a.getName(), type: a.getContentType(), size: a.getSize() })),
  });
  if (res.getResponseCode() !== 200) return;
  const out = JSON.parse(res.getContentText() || '{}');
  (out.uploads || []).forEach((u) => {
    const file = files.find((a) => a.getName() === u.name);
    if (file) UrlFetchApp.fetch(u.url, { method: 'put', contentType: u.type, payload: file.getBytes(), muteHttpExceptions: true });
  });
  if ((out.uploads || []).length) post_({ message_id: id, done: true });
  done.add(id);
}
function checkInbox() {
  const props = PropertiesService.getScriptProperties();
  const done = new Set(JSON.parse(props.getProperty('done') || '[]'));
  const me = Session.getActiveUser().getEmail().toLowerCase();
  GmailApp.search('in:inbox newer_than:2d -from:interac.ca', 0, 100).forEach((thread) => {
    thread.getMessages().forEach((msg) => {
      if (addr_(msg.getFrom()).email !== me) send_(msg, 'in', done);
    });
  });
  GmailApp.search('in:sent newer_than:2d', 0, 100).forEach((thread) => {
    thread.getMessages().forEach((msg) => {
      if (addr_(msg.getFrom()).email === me) send_(msg, 'out', done);
    });
  });
  props.setProperty('done', JSON.stringify(Array.from(done).slice(-5000)));
}
