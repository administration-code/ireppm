/**
 * IRep PM — administration@ inbox feed (Inbox page, and maintenance requests from tenant emails).
 * Runs inside the Gmail account administration@ireppm.ca. Every 10 minutes it sends each new inbox
 * email (sender, subject, text) to https://ireppm.ca/api/admin-mail/intake, then uploads its photos
 * and videos so they can go on the maintenance request. It only reads mail: it never replies,
 * forwards, labels or deletes anything. Interac e-Transfer emails are skipped.
 *
 * Setup (once, signed in to Google as administration@ireppm.ca):
 *  1. script.google.com → New project → paste this whole file → Save.
 *  2. Project Settings → Script Properties → Add property: SECRET = the INBOUND_MAIL_SECRET value in Vercel.
 *  3. Run "testConnection" (allow access). The log should say "Connected".
 *  4. Run "setup" to start the 10-minute check.
 */
const ENDPOINT = 'https://ireppm.ca/api/admin-mail/intake';

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
function checkInbox() {
  const props = PropertiesService.getScriptProperties();
  const done = new Set(JSON.parse(props.getProperty('done') || '[]'));
  const threads = GmailApp.search('in:inbox newer_than:2d -from:payments.interac.ca -from:me', 0, 100);
  threads.forEach((thread) => {
    thread.getMessages().forEach((msg) => {
      const id = msg.getId();
      if (done.has(id)) return;
      const from = msg.getFrom();
      const m = from.match(/^(.*?)\s*<(.+)>$/);
      const files = msg.getAttachments({ includeInlineImages: true, includeAttachments: true })
        .filter((a) => /^(image|video)\//.test(a.getContentType()) && a.getSize() <= 50 * 1024 * 1024)
        .slice(0, 8);
      const res = post_({
        message_id: id,
        from_name: m ? m[1].replace(/"/g, '') : '',
        from_email: m ? m[2] : from,
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
    });
  });
  props.setProperty('done', JSON.stringify(Array.from(done).slice(-3000)));
}
