/**
 * IRep PM — Interac e-Transfer feed.
 * Runs inside the Gmail account that receives the Interac deposit emails
 * (payment@ireppm.ca). Every 5 minutes it sends new "deposited" e-Transfers to
 * https://ireppm.ca/api/payments/interac, where they're matched to tenants.
 *
 * Setup (once): script.google.com → New project → paste this file → set SECRET
 * (same value as PAYMENTS_WEBHOOK_SECRET in Vercel) → Run "setup" → allow access.
 * Safe to re-run: the website ignores an e-Transfer it has already recorded.
 */
const ENDPOINT = 'https://ireppm.ca/api/payments/interac';
const SECRET = 'PASTE_SECRET_HERE';
const START_DATE = '2026/10/15'; // e-Transfers before this were imported from the tracker

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkInterac').timeBased().everyMinutes(5).create();
  checkInterac();
}

function checkInterac() {
  const props = PropertiesService.getScriptProperties();
  const done = new Set(JSON.parse(props.getProperty('done') || '[]'));
  const query = 'from:notify@payments.interac.ca deposited after:' + START_DATE + ' newer_than:14d';
  const threads = GmailApp.search(query, 0, 100);
  const sent = [];

  threads.forEach((thread) => {
    thread.getMessages().forEach((msg) => {
      const id = msg.getId();
      if (done.has(id)) return;
      const p = parseInterac(msg);
      if (!p) { done.add(id); return; } // not a deposit notice
      const res = UrlFetchApp.fetch(ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-payments-secret': SECRET },
        payload: JSON.stringify(p),
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() === 200) { done.add(id); sent.push(p.reference); }
      else console.warn('Failed ' + id + ': ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
    });
  });

  props.setProperty('done', JSON.stringify(Array.from(done).slice(-2000)));
  if (sent.length) console.log('Sent ' + sent.length + ': ' + sent.join(', '));
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
