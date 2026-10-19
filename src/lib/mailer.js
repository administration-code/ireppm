import "server-only";
import { connect } from "node:tls";
import { randomBytes } from "node:crypto";
import { Resend as ResendClient } from "resend";

// Sends the website's email. With GMAIL_USER and GMAIL_APP_PASSWORD set (a Google Workspace
// mailbox with an app password), mail goes through Gmail's SMTP server as that mailbox;
// otherwise it falls back to Resend (RESEND_API_KEY). Callers use the Resend-style shape:
//   const { error } = await mailer().emails.send({ from, to, subject, html, text, replyTo, headers, attachments })
// where attachments are [{ filename, content (base64 string or Buffer), contentType? }].

const gmailReady = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
export const mailConfigured = () => gmailReady() || Boolean(process.env.RESEND_API_KEY);

export function mailer() {
  return { emails: { send } };
}

async function send(msg) {
  if (gmailReady()) {
    try {
      await sendViaGmail(msg);
      return { data: { ok: true }, error: null };
    } catch (err) {
      console.error("[mailer] Gmail send failed:", err?.message || err);
      return { data: null, error: { name: "gmail_error", message: err?.message || "Gmail send failed" } };
    }
  }
  if (!process.env.RESEND_API_KEY) return { data: null, error: { name: "not_configured", message: "Email isn't set up." } };
  return new ResendClient(process.env.RESEND_API_KEY).emails.send(msg);
}

// ---------------------------------------------------------------------------
// Message building (MIME)
// ---------------------------------------------------------------------------
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean);
const bare = (addr) => (String(addr).match(/<([^>]+)>/)?.[1] || String(addr)).trim();
const wrap76 = (b64) => b64.replace(/.{1,76}/g, "$&\r\n");
const b64 = (s) => wrap76(Buffer.from(s, "utf8").toString("base64"));
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const displayName = (from) => (String(from || "").match(/^\s*"?([^"<]*?)"?\s*</)?.[1] || "IRep Property Management").trim();

function buildMessage(msg, fromAddress) {
  const boundary = () => `=_irep_${randomBytes(12).toString("hex")}`;
  const to = list(msg.to);
  const cc = list(msg.cc);
  const replyTo = list(msg.replyTo || msg.reply_to);
  const domain = fromAddress.split("@")[1] || "ireppm.ca";
  const headers = [
    `From: "${encodeWord(displayName(msg.from))}" <${fromAddress}>`,
    `To: ${to.join(", ")}`,
    cc.length ? `Cc: ${cc.join(", ")}` : "",
    replyTo.length ? `Reply-To: ${replyTo.join(", ")}` : "",
    `Subject: ${encodeWord(String(msg.subject || ""))}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomBytes(16).toString("hex")}@${domain}>`,
    "MIME-Version: 1.0",
    ...Object.entries(msg.headers || {}).map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);

  const alt = boundary();
  const altPart = [
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(msg.text || ""),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(msg.html || `<pre>${String(msg.text || "")}</pre>`),
    `--${alt}--`,
    "",
  ].join("\r\n");

  const files = msg.attachments || [];
  if (!files.length) return `${headers.join("\r\n")}\r\n${altPart}`;

  const mixed = boundary();
  const parts = files.map((a) => {
    const data = Buffer.isBuffer(a.content) ? a.content : Buffer.from(String(a.content || ""), "base64");
    const name = encodeWord(String(a.filename || "attachment"));
    return [
      `--${mixed}`,
      `Content-Type: ${a.contentType || a.content_type || (/\.pdf$/i.test(a.filename || "") ? "application/pdf" : "application/octet-stream")}; name="${name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${name}"`,
      "",
      wrap76(data.toString("base64")),
    ].join("\r\n");
  });
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    altPart,
    ...parts,
    `--${mixed}--`,
    "",
  ].join("\r\n");
}

// ---------------------------------------------------------------------------
// SMTP over TLS to smtp.gmail.com:465 (AUTH LOGIN with the app password)
// ---------------------------------------------------------------------------
function sendViaGmail(msg) {
  const user = process.env.GMAIL_USER.trim();
  const pass = process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, "");
  const recipients = [...list(msg.to), ...list(msg.cc), ...list(msg.bcc)].map(bare);
  if (!recipients.length) return Promise.reject(new Error("No recipients"));
  const data = buildMessage(msg, user)
    .replace(/\r?\n/g, "\r\n")
    .replace(/^\./gm, ".."); // dot-stuffing

  return new Promise((resolve, reject) => {
    const socket = connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" });
    socket.setTimeout(20000, () => socket.destroy(new Error("Gmail SMTP timed out")));
    let buffer = "";
    let waiter = null;
    const failed = (err) => {
      socket.destroy();
      reject(err);
    };
    socket.on("error", failed);
    // A reply is complete when its last line is "NNN text" (a space after the code, not a dash).
    const deliver = () => {
      const lines = buffer.split("\r\n");
      const last = lines.length > 1 ? lines[lines.length - 2] : "";
      if (!waiter || !/^\d{3} /.test(last)) return;
      const reply = buffer;
      buffer = "";
      const w = waiter;
      waiter = null;
      w(reply);
    };
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      deliver();
    });
    const read = () =>
      new Promise((res) => {
        waiter = res;
        deliver();
      });
    const step = async (line, expect) => {
      if (line !== null) socket.write(`${line}\r\n`);
      const reply = await read();
      if (!expect.test(reply)) throw new Error(`Gmail SMTP: ${reply.trim().split("\r\n").pop()}`);
      return reply;
    };

    (async () => {
      await step(null, /^220/);
      await step("EHLO ireppm.ca", /^250/m);
      await step("AUTH LOGIN", /^334/);
      await step(Buffer.from(user).toString("base64"), /^334/);
      await step(Buffer.from(pass).toString("base64"), /^235/);
      await step(`MAIL FROM:<${user}>`, /^250/);
      for (const r of recipients) await step(`RCPT TO:<${r}>`, /^25[01]/);
      await step("DATA", /^354/);
      await step(`${data}\r\n.`, /^250/);
      socket.write("QUIT\r\n");
      socket.end();
      resolve();
    })().catch(failed);
  });
}
