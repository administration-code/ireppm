/**
 * IRep PM — Interac e-Transfer feed (version 3, Nov 26 2026).
 * Runs inside a Gmail mailbox that receives Interac e-Transfer emails and sends each new one to
 * https://ireppm.ca/api/payments/interac, where it's matched to a tenant ("Rent Recorded").
 *
 * The same file runs in two mailboxes. It works out its role from the mailbox it's in:
 *  - payment@ireppm.ca (PRIMARY): Scotia sends every "Funds Deposited" notice here. Every deposit is
 *    sent to the website for matching.
 *  - ireppm@ireprealty.com (OLD ADDRESS): it's no longer registered for Autodeposit, so anything that
 *    arrives here was sent to the old address. The website emails that tenant an URGENT notice to
 *    use payment@ireppm.ca. Keeps running until you turn it off (delete its trigger).
 *
 * Setup (once in each mailbox, signed in to Google as that mailbox):
 *  1. script.google.com → New project (or open the existing one) → paste this whole file → Save.
 *  2. Project Settings (gear) → Script Properties → Add property:
 *       Property: SECRET    Value: the same value as PAYMENTS_WEBHOOK_SECRET in Vercel
 *  3. Pick "testConnection" → Run → allow access. The log says "Connected" and which role it has.
 *  4. Pick "setup" → Run. This starts the 5-minute check. Settings → e-Transfer Reader on the
 *     website then shows this mailbox and when it last checked.
 * Test: send a small e-Transfer to payment@ireppm.ca with IREP TEST in the message. It shows under
 * "Last test" in Settings and is NOT recorded as rent.
 *
 * Every e-Transfer the website records gets the Gmail label "Rent Recorded" (and "Rent to Match" if
 * it couldn't tell whose it is). This script only reads and labels mail: it never replies to,
 * forwards or deletes an Interac email. Safe to re-run: the website ignores anything already recorded.
 */
const VERSION = '3';
// Goes through IRep's Supabase relay: Vercel challenges requests from Google's script servers.
const ENDPOINT = 'https://xtmvfqnnmrbgucfelvtu.supabase.co/functions/v1/mail-relay?to=interac';
const START_DATE = '2026/10/19'; // e-Transfers before this are already in the website
const LEGACY = /ireprealty\.com/i;
const NEW_ADDRESS = /payment@ireppm\.ca/i;

function secret_() {
  const s = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!s) throw new Error('Add the SECRET script property first (Project Settings → Script Properties).');
  return s;
}

function mailbox_() {
  return String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
}
function isLegacy_() {
  return LEGACY.test(mailbox_());
}
function torontoToday_() {
  return Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd');
}

function post_(payload) {
  payload.mailbox = mailbox_();
  payload.version = VERSION;
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
  if (code === 200)
    console.log('Connected as ' + mailbox_() + ' (' + (isLegacy_() ? 'old address: e-Transfers sent to ireppm@ireprealty.com' : 'primary') + ').');
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

function label_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function checkInterac() {
  post_({ ping: true }); // heartbeat for Settings → e-Transfer Reader
  const props = PropertiesService.getScriptProperties();
  const done = new Set(JSON.parse(props.getProperty('done') || '[]'));
  const query = 'from:notify@payments.interac.ca deposited after:' + START_DATE + ' newer_than:60d';
  const threads = GmailApp.search(query, 0, 200)
    .concat(GmailApp.search('from:notify@payments.interac.ca "sent you money" after:' + START_DATE + ' newer_than:30d', 0, 100));
  const sent = [];
  let failed = 0;

  threads.forEach((thread) => {
    thread.getMessages().forEach((msg) => {
      const id = msg.getId();
      if (done.has(id)) return;
      const p = parseInterac(msg);
      if (!p) { done.add(id); return; } // not a deposit notice
      // Old mailbox: only e-Transfers sent to the old address; payment@ireppm.ca is handled by the primary reader.
      if (isLegacy_() && !p.pending && NEW_ADDRESS.test(p.to + ' ' + p.sent_to)) { done.add(id); return; }
      const res = post_(p);
      if (res.getResponseCode() === 200) {
        done.add(id);
        sent.push(p.reference);
        let out = {};
        try { out = JSON.parse(res.getContentText()); } catch (e) {}
        if (out.recorded) {
          thread.addLabel(label_('Rent Recorded'));
          if (out.matched === false) thread.addLabel(label_('Rent to Match'));
        }
      }
      else { failed++; console.warn('Failed ' + id + ': ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200)); }
    });
  });

  props.setProperty('done', JSON.stringify(Array.from(done).slice(-2000)));
  if (sent.length) console.log('Sent ' + sent.length + ': ' + sent.join(', '));
  if (failed) throw new Error(failed + ' e-Transfer(s) could not be sent; see the log above.'); // Google emails you on failures
}

function parseInterac(msg) {
  const body = msg.getPlainBody() || '';
  const subject = msg.getSubject() || '';
  const deposited = /deposited/i.test(body + subject);
  const pending = !deposited && /sent you money/i.test(subject + body);
  if (!deposited && !pending) return null;
  const pick = (re) => { const m = body.match(re); return m ? m[1].trim() : ''; };
  const amount = pick(/Amount:\s*\$([\d,]+\.\d{2})/i) || pick(/\$([\d,]+\.\d{2})/);
  const reference = pick(/Reference Number:\s*(\S+)/i);
  const sentFrom = pick(/Sent From:\s*(.+)/i) || (subject.match(/from (.+?) and it has/i) || [])[1] ||
    (subject.match(/:\s*(.+?) sent you money/i) || [])[1] || '';
  // Deposit notices for payment@ireppm.ca are delivered to this mailbox too, so its own address
  // only says where the money went for a pending ("sent you money") notice.
  const sentTo = pick(/(?:Sent To|Recipient(?: Email)?|Deposited To):\s*(\S+@\S+)/i) || (pending ? msg.getTo() : '');
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
    sent_to: sentTo,
    pending: pending,
  };
}
