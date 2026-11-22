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
 * Auto-reply: when the script property AUTO_REPLY is "on", this script sends IRep's "We've received your
 * message" reply (replacing Gmail's vacation responder, which can't skip automated senders). It replies only
 * to people: never to no-reply, notification, bounce or mailer-daemon addresses, DocuSign, Vercel, Anthropic
 * receipts, Interac, mailing lists, other auto-replies, or IRep's own addresses; and at most once per sender
 * every 4 days. Turn Gmail's vacation responder OFF when you turn AUTO_REPLY on, or people get two replies.
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
const OWN = /@(ireppm\.ca|ireprealty\.com)$/i;
const AUTOMATED = /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?)([._+-]|@)|@([\w-]+\.)*(docusign\.(net|com)|mail\.vercel\.com|vercel\.com|mail\.anthropic\.com|interac\.ca|amazonses\.com)$/i;
const AUTO_REPLY_SUBJECT = "We've received your message – IRep Property Management";
const REPLY_DAYS = 4;

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
  const automated = isAutomated_(msg, from.email);
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
    automated: automated,
  });
  if (res.getResponseCode() !== 200) return;
  const out = JSON.parse(res.getContentText() || '{}');
  (out.uploads || []).forEach((u) => {
    const file = files.find((a) => a.getName() === u.name);
    if (file) UrlFetchApp.fetch(u.url, { method: 'put', contentType: u.type, payload: file.getBytes(), muteHttpExceptions: true });
  });
  if ((out.uploads || []).length) post_({ message_id: id, done: true });
  done.add(id);
  if (direction === 'in') autoReply_(msg, from.email, automated);
}
function header_(msg, name) {
  try { return String(msg.getHeader(name) || ''); } catch (e) { return ''; }
}
// Automated mail: system senders, auto-replies, bulk and mailing-list mail.
function isAutomated_(msg, email) {
  if (AUTOMATED.test(email)) return true;
  const autoSubmitted = header_(msg, 'Auto-Submitted').trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (/^(bulk|list|junk)$/i.test(header_(msg, 'Precedence').trim())) return true;
  if (header_(msg, 'List-Unsubscribe')) return true;
  if (header_(msg, 'X-Autoreply') || header_(msg, 'X-Autorespond')) return true;
  return false;
}
// IRep's "We've received your message" reply, for people only, once per sender every 4 days.
function autoReply_(msg, email, automated) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('AUTO_REPLY') !== 'on') return;
  if (!email || automated || OWN.test(email)) return;
  const subject = msg.getSubject() || '';
  if (subject.indexOf("We've received your message") === 0 || /^(auto(matic)?[ -]?reply|out of office)/i.test(subject)) return; // loop guard
  if (Date.now() - msg.getDate().getTime() > 60 * 60 * 1000) return; // only new mail, never a backlog
  const sent = JSON.parse(props.getProperty('replied') || '{}');
  const last = sent[email] || 0;
  if (Date.now() - last < REPLY_DAYS * 86400000) return;
  GmailApp.sendEmail(email, AUTO_REPLY_SUBJECT + ' Re: ' + subject, AUTO_REPLY_TEXT, { htmlBody: AUTO_REPLY_HTML, name: 'IRep Property Management Administration' });
  sent[email] = Date.now();
  Object.keys(sent).forEach((k) => { if (Date.now() - sent[k] > 30 * 86400000) delete sent[k]; });
  props.setProperty('replied', JSON.stringify(sent));
}
const AUTO_REPLY_TEXT = [
  'Hello,', '',
  "Thank you for contacting IRep Property Management. We've received your email and a member of our team will respond within these timelines:", '',
  '- Administrative requests and general inquiries: within 48 business hours',
  '- Non-urgent maintenance requests: within 5 business days',
  '- Urgent maintenance (for example: no heat, active water leak, no water or power, sewage backup, lockout): please also contact Chuck, our maintenance lead, directly at 519-999-9742, or log it in your portal at ireppm.ca',
  "- Emergencies (fire, gas smell, or anyone's life in danger): call 911 first, then let us know.", '',
  'Business hours are Monday to Friday, 9:00 a.m. to 5:00 p.m., excluding statutory holidays.', '',
  "For landlords: for any maintenance repair over $250, we'll send you the details and quote for approval. We need your approval or response within 48 hours so the repair isn't delayed. If we don't hear back within 48 hours, we may go ahead with repairs needed to keep the unit safe, habitable and compliant with the Residential Tenancies Act.", '',
  'To help us respond faster, please include:', '- Your property address and unit', '- A short description of the request', "- Photos, if it's a maintenance issue", '',
  'You can also log maintenance requests, view statements and receipts, and upload documents any time through your Owner or Tenant Portal at ireppm.ca.', '',
  "For your security, please don't send banking or ID documents by email unless we've asked you to. Upload them through your portal instead.", '',
  'Thank you,', 'IRep Property Management', 'administration@ireppm.ca | 519-590-7200 | ireppm.ca', '',
  '--', 'IRep Property Management Inc.', '6-2557 Dougall Ave, Suite 223, Windsor, ON N8X 1T5', '519-590-7200 | administration@ireppm.ca | ireppm.ca',
  'Owners: ireppm.ca/owner · Tenants: ireppm.ca/account', 'Urgent maintenance: Chuck, 519-999-9742 · Emergencies: call 911',
].join('\n');
const AUTO_REPLY_HTML =
  '<p>Hello,</p><p>Thank you for contacting IRep Property Management. We\'ve received your email and a member of our team will respond within these timelines:</p><ul>' +
  '<li><b>Administrative requests and general inquiries:</b> within 48 business hours</li>' +
  '<li><b>Non-urgent maintenance requests:</b> within 5 business days</li>' +
  '<li><b>Urgent maintenance</b> (for example: no heat, active water leak, no water or power, sewage backup, lockout): please also contact Chuck, our maintenance lead, directly at <b>519-999-9742</b>, or log it in your portal at ireppm.ca</li>' +
  '<li><b>Emergencies</b> (fire, gas smell, or anyone\'s life in danger): <b>call 911 first</b>, then let us know.</li></ul>' +
  '<p>Business hours are Monday to Friday, 9:00 a.m. to 5:00 p.m., excluding statutory holidays.</p>' +
  '<p><b>For landlords:</b> for any maintenance repair over <b>$250</b>, we\'ll send you the details and quote for approval. We need your approval or response <b>within 48 hours</b> so the repair isn\'t delayed. If we don\'t hear back within 48 hours, we may go ahead with repairs needed to keep the unit safe, habitable and compliant with the Residential Tenancies Act.</p>' +
  '<p><b>To help us respond faster, please include:</b></p><ul><li>Your property address and unit</li><li>A short description of the request</li><li>Photos, if it\'s a maintenance issue</li></ul>' +
  '<p>You can also log maintenance requests, view statements and receipts, and upload documents any time through your Owner or Tenant Portal at <b>ireppm.ca</b>.</p>' +
  '<p>For your security, please don\'t send banking or ID documents by email unless we\'ve asked you to. Upload them through your portal instead.</p>' +
  '<p>Thank you,<br>IRep Property Management<br>administration@ireppm.ca | 519-590-7200 | ireppm.ca</p>' +
  '<p>--<br><i>IRep Property Management Inc.</i><br>6-2557 Dougall Ave, Suite 223, Windsor, ON N8X 1T5<br>519-590-7200 | administration@ireppm.ca | ireppm.ca<br>Owners: ireppm.ca/owner · Tenants: ireppm.ca/account<br>Urgent maintenance: Chuck, 519-999-9742 · Emergencies: call 911</p>';
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
