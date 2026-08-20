/**
 * sendEmail — Brevo v6 SDK (transactional email)
 *
 * Required .env vars:
 *   BREVO_API_KEY       — from Brevo dashboard → SMTP & API → API Keys
 *   BREVO_SENDER_EMAIL  — verified sender address in your Brevo account
 *
 * Usage (direct):
 *   const { sendEmail } = require("../utils/sendEmail");
 *   await sendEmail({ to, subject, html, displayName });
 *
 * Usage (template):
 *   const { sendEmailFromTemplate } = require("../utils/sendEmail");
 *   await sendEmailFromTemplate("otp", { otp: "123456" }, { to, displayName: "OTP" });
 *
 * displayName — sender label shown in the inbox, e.g. "OTP", "ScladApp".
 *   Must be passed by the caller — not stored in templates.
 */

const { BrevoClient } = require("@getbrevo/brevo");
const path = require("path");
const fs   = require("fs");

// ── Load email templates once at startup ─────────────────────────────────────
const TEMPLATES_PATH = path.join(__dirname, "./email-templates.json");
let _templates = null;
const getTemplates = () => {
  if (!_templates) {
    _templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, "utf8"));
  }
  return _templates;
};

// ── Singleton Brevo client ────────────────────────────────────────────────────
let _client = null;
const getClient = () => {
  if (!_client) {
    _client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
  }
  return _client;
};

/**
 * Send an email via Brevo.
 *
 * @param {object} options
 * @param {string}  options.to          - Recipient email address
 * @param {string}  options.subject     - Email subject line
 * @param {string}  options.html        - HTML body
 * @param {string}  options.displayName - Sender name shown in inbox (required)
 * @param {string}  [options.replyTo]   - Reply-to email address (optional)
 */
const sendEmail = async ({ to, subject, html, displayName, replyTo }) => {
  if (!displayName) throw new Error("sendEmail: displayName is required");

  const client = getClient();

  const payload = {
    sender:      { name: displayName, email: process.env.BREVO_SENDER_EMAIL },
    to:          [{ email: to }],
    subject,
    htmlContent: html,
    textContent: html.replace(/<[^>]*>/g, ""),
  };

  // Add reply-to if provided
  if (replyTo) {
    payload.replyTo = { email: replyTo, name: displayName };
  }

  // sendTransacEmail returns an HttpResponsePromise<T> which extends Promise<T>
  // awaiting it directly gives the parsed response data
  const data = await client.transactionalEmails.sendTransacEmail(payload);

  const messageId = data?.messageId ?? "n/a";
  console.log(
    `[sendEmail] Sent to ${to} | from: ${displayName} <${process.env.BREVO_SENDER_EMAIL}>${replyTo ? ` | replyTo: ${replyTo}` : ""} | subject: "${subject}" | messageId: ${messageId}`
  );
  return data;
};

// ── Template helper ───────────────────────────────────────────────────────────
/**
 * Send an email using a named template from email-templates.json.
 * Placeholders like {{otp}} in subject/html are replaced with `vars`.
 *
 * @param {string} templateKey   - Key in email-templates.json  e.g. "otp"
 * @param {object} vars          - Placeholder values  e.g. { otp: "123456" }
 * @param {object} sendOptions   - { to, displayName }  — displayName is required
 */
const sendEmailFromTemplate = async (templateKey, vars = {}, sendOptions = {}) => {
  const tpl = getTemplates()[templateKey];

  if (!tpl) {
    throw new Error(`Email template "${templateKey}" not found in email-templates.json`);
  }

  if (!sendOptions.displayName) {
    throw new Error(`sendEmailFromTemplate("${templateKey}"): displayName is required in sendOptions`);
  }

  // Replace {{placeholder}} tokens and {{#if key}}...{{/if}} blocks
  const interpolate = (str) => {
    // Handle {{#if key}}...{{else}}...{{/if}} blocks
    let result = str.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => {
      const val = vars[key];
      const hasTruthy = val && val !== "null" && val !== "undefined";
      const [truePart, falsePart = ""] = inner.split(/\{\{else\}\}/);
      return hasTruthy ? truePart : falsePart;
    });
    // Handle plain {{key}} tokens
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      vars[key] !== undefined ? vars[key] : ""
    );
    return result;
  };

  return sendEmail({
    to:          sendOptions.to,
    displayName: sendOptions.displayName,
    subject:     interpolate(tpl.subject),
    html:        interpolate(tpl.html),
  });
};

module.exports = { sendEmail, sendEmailFromTemplate };
