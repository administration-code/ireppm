/**
 * IRep PM — Interac e-Transfer feed.
 * Runs inside the Gmail account that receives the Interac deposit emails
 * (ireppm@ireprealty.com: Interac sends the "Funds Deposited" notices for
 * payment@ireppm.ca there). Every 5 minutes it sends new deposits to
 * https://ireppm.ca/api/payments/interac, where they're matched to tenants.
 *
 * Setup (once, signed in to Google as ireppm@ireprealty.com):
 *  1. script.google.com → New project → paste this whole file → Save.
 *  2. Project Settings (gear) → Script Properties → Add property:
 *       Property: SECRET    Value: the same value as PAYMENTS_WEBHOOK_SECRET in Vercel
 *  3. Back in the editor, pick "testConnection" → Run → allow access.
 *     The log should say "Connected". If it says 401, the SECRET doesn't match Vercel.
 *  4. Pick "setup" → Run. This starts the 5-minute check and sends the backlog.
 * Safe to re-run: the website ignores an e-Transfer it has already recorded, and
 * links one staff already entered by hand (same amount, within two days).
 */
const ENDPOINT = 'https://ireppm.ca/api/payments/interac';
const START_DATE = '2026/10/19'; // e-Transfers before this are already in the website

function secret_() {
  const s = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!s) throw new Error('Add the SECRET script property first (Project Settings → Script Properties).');
  return s;
}

function post_(payload) {
  return UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-payments-secret': secret_() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

function testConnection() {
  const res = post_({ ping: true });
  const code = res.getResponseCode();
  if (code === 200) console.log('Connected: the website accepted the secret.');
  else if (code === 401) console.error('401: the SECRET script property does not match PAYMENTS_WEBHOOK_SECRET in Vercel.');
  else console.error('Unexpected ' + code + ': ' + res.getContentText().slice(0, 200));
  const n = GmailApp.search('from:notify@payments.interac.ca deposited after:' + START_DATE, 0, 100).length;
  console.log('Interac deposit emails found in this mailbox since ' + START_DATE + ': ' + n);
}

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkInterac').timeBased().everyMinutes(5).create();
  checkInterac();
}

function checkInterac() {
  const props = PropertiesService.getScriptProperties();
  const done = new Set(JSON.parse(props.getProperty('done') || '[]'));
  const query = 'from:notify@payments.interac.ca deposited after:' + START_DATE + ' newer_than:60d';
  const threads = GmailApp.search(query, 0, 200);
  const sent = [];
  let failed = 0;

  threads.forEach((thread) => {
    thread.getMessages().forEach((msg) => {
      const id = msg.getId();
      if (done.has(id)) return;
      const p = parseInterac(msg);
      if (!p) { done.add(id); return; } // not a deposit notice
      const res = post_(p);
      if (res.getResponseCode() === 200) { done.add(id); sent.push(p.reference); }
      else { failed++; console.warn('Failed ' + id + ': ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200)); }
    });
  });

  props.setProperty('done', JSON.stringify(Array.from(done).slice(-2000)));
  if (sent.length) console.log('Sent ' + sent.length + ': ' + sent.join(', '));
  if (failed) throw new Error(failed + ' e-Transfer(s) could not be sent; see the log above.'); // Google emails you on failures
}

function parseInterac(msg) {
  const body = msg.getPlainBody() || '';
  if (!/deposited/i.test(body + msg.getSubject())) return null;
  const pick = (re) => { const m = body.match(re); return m ? m[1].trim() : ''; };
  const amount = pick(/Amount:\s*\$([\d,]+\.\d{2})/i) || pick(/\$([\d,]+\.\d{2})/);
  const reference = pick(/Reference Number:\s*(\S+)/i);
  const sentFrom = pick(/Sent From:\s*(.+)/i) || (msg.getSubject().match(/from (.+?) and it has/i) || [])[1] || '';
  const message = pick(/Message:\s*\n([\s\S]*?)\n\s*\n/i);
  if (!amount || !reference) return null;
  return {
    gmail_id: msg.getId(),
    reference: reference,
    sent_from: sentFrom,
    amount: Number(amount.replace(/,/g, '')),
    received_at: msg.getDate().toISOString(),
    message: message.slice(0, 500),
    to: msg.getTo(),
  };
}
