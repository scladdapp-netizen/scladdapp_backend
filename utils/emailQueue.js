/**
 * emailQueue.js — Rate-limited email queue for Brevo (or any provider)
 *
 * Configurable via .env:
 *   EMAIL_DAILY_LIMIT      — max emails to send per period  (default: 300)
 *   EMAIL_PERIOD_HOURS     — period length in hours          (default: 24)
 *
 * How it works:
 *   • Every call to queueEmail() either sends immediately (if under our local
 *     limit) or appends the job to utils/email-queue.json for later.
 *   • A cron-style interval fires every hour, checks if our local period has
 *     elapsed, resets the counter, and drains queued emails.
 *   • If Brevo itself returns a rate-limit error (429 / "too many requests")
 *     during a drain, we treat that as "Brevo's window hasn't reset yet":
 *       – the failed job is put back at the front of the queue
 *       – the drain stops immediately (no point trying more)
 *       – our local sentCount is pushed to DAILY_LIMIT so no more sends
 *         are attempted until our own period resets
 *     This keeps our local window in sync with Brevo's actual window.
 *   • State (sentCount + periodStart) is persisted to email-queue-state.json
 *     so server restarts don't lose the window.
 */

const fs   = require("fs");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────
const DAILY_LIMIT  = parseInt(process.env.EMAIL_DAILY_LIMIT   || "300", 10);
const PERIOD_HOURS = parseFloat(process.env.EMAIL_PERIOD_HOURS || "24");
const PERIOD_MS    = PERIOD_HOURS * 60 * 60 * 1000;

// ── File paths ────────────────────────────────────────────────────────────────
const QUEUE_FILE = path.join(__dirname, "email-queue.json");
const STATE_FILE = path.join(__dirname, "email-queue-state.json");

// ── Lazy-load sendEmail to avoid circular dependency ─────────────────────────
let _sendEmail = null;
const getSendEmail = () => {
  if (!_sendEmail) _sendEmail = require("./sendEmail").sendEmail;
  return _sendEmail;
};

// ── Detect a Brevo daily-quota-exceeded error ─────────────────────────────────
// Brevo returns HTTP 402 with body { code: "not_enough_credits", message: "..." }
// when the free-plan daily limit (300/day) is hit.
const isRateLimitError = (err) => {
  if (!err) return false;
  // SDK exposes the parsed body on err.body or err.response?.body
  const body = err.body || err.response?.body || {};
  if (body.code === "not_enough_credits") return true;
  // Also catch by HTTP status in case the SDK surfaces it differently
  if (err.statusCode === 402)         return true;
  if (err.response?.status === 402)   return true;
  if (err.status === 402)             return true;
  // Fallback: check the message string
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("not_enough_credits")) return true;
  if (msg.includes("not enough credits")) return true;
  return false;
};

// ── State helpers ─────────────────────────────────────────────────────────────
const loadState = () => {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      return {
        periodStart: s.periodStart || Date.now(),
        sentCount:   typeof s.sentCount === "number" ? s.sentCount : 0,
      };
    }
  } catch { /* ignore */ }
  return { periodStart: Date.now(), sentCount: 0 };
};

const saveState = (s) => {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch { /* ignore */ }
};

// ── Queue helpers ─────────────────────────────────────────────────────────────
const loadQueue = () => {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const q = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
      return Array.isArray(q) ? q : [];
    }
  } catch { /* ignore */ }
  return [];
};

const saveQueue = (q) => {
  try { fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2)); } catch { /* ignore */ }
};

// ── In-memory state ───────────────────────────────────────────────────────────
let state = loadState();

// ── Reset our local period if it has elapsed ──────────────────────────────────
const maybeResetPeriod = () => {
  if (Date.now() - state.periodStart >= PERIOD_MS) {
    console.log(`[emailQueue] Period reset — sent ${state.sentCount}/${DAILY_LIMIT}. Starting fresh.`);
    state = { periodStart: Date.now(), sentCount: 0 };
    saveState(state);
    return true;
  }
  return false;
};

// ── Drain queued emails ───────────────────────────────────────────────────────
const drainQueue = async () => {
  maybeResetPeriod();

  const remaining = DAILY_LIMIT - state.sentCount;
  if (remaining <= 0) {
    console.log(`[emailQueue] Drain skipped — local limit reached (${state.sentCount}/${DAILY_LIMIT})`);
    return;
  }

  const queue = loadQueue();
  if (queue.length === 0) return;

  // Take up to `remaining` jobs off the front
  const toSend = queue.splice(0, remaining);
  saveQueue(queue); // persist the shorter queue immediately

  console.log(`[emailQueue] Draining ${toSend.length} queued email(s)...`);

  for (let i = 0; i < toSend.length; i++) {
    const job = toSend[i];
    try {
      await getSendEmail()(job);
      state.sentCount++;
      saveState(state);
      console.log(`[emailQueue] Drained → ${job.to} | subject: "${job.subject}" (${state.sentCount}/${DAILY_LIMIT})`);
    } catch (err) {
      if (isRateLimitError(err)) {
        // Brevo's window hasn't reset yet — stop draining and re-queue everything
        // that hasn't been sent (current job + any remaining in this batch)
        const unsent = [job, ...toSend.slice(i + 1)];
        const current = loadQueue();
        saveQueue([...unsent, ...current]);

        // Lock our local counter at the limit so nothing else is attempted
        state.sentCount = DAILY_LIMIT;
        saveState(state);

        console.warn(
          `[emailQueue] Brevo quota exceeded (402 not_enough_credits) — stopped drain. ` +
          `Re-queued ${unsent.length} job(s). Will retry next period.`
        );
        return; // abort the rest of the drain
      }

      // Non-rate-limit error (bad address, network blip, etc.) — re-queue this
      // job but continue trying the remaining ones
      console.error(`[emailQueue] Transient error for ${job.to}:`, err.message, '— re-queuing');
      const current = loadQueue();
      current.push(job); // push to end, not front (don't block the queue)
      saveQueue(current);
    }
  }
};

// ── Main entry point ──────────────────────────────────────────────────────────
/**
 * Send immediately if under the local limit, otherwise queue for next period.
 * If Brevo rejects with a rate-limit error even though we thought we were under
 * the limit, the job is re-queued and the local counter is locked at the limit.
 *
 * @returns {{ sent: boolean, queued?: boolean }}
 */
const queueEmail = async (emailOptions) => {
  maybeResetPeriod();

  if (state.sentCount < DAILY_LIMIT) {
    try {
      await getSendEmail()(emailOptions);
      state.sentCount++;
      saveState(state);
      console.log(`[emailQueue] Sent immediately (${state.sentCount}/${DAILY_LIMIT}) → ${emailOptions.to}`);
      return { sent: true };
    } catch (err) {
      if (isRateLimitError(err)) {
        // Brevo says no even though our counter said yes — lock and queue
        state.sentCount = DAILY_LIMIT;
        saveState(state);
        console.warn(`[emailQueue] Brevo quota exceeded (402) on immediate send — locking counter and queuing → ${emailOptions.to}`);
      } else {
        throw err; // propagate non-rate-limit errors to the caller
      }
    }
  }

  // Queue for next period
  const queue = loadQueue();
  queue.push({ ...emailOptions, queuedAt: new Date().toISOString() });
  saveQueue(queue);
  console.log(`[emailQueue] Queued (${state.sentCount}/${DAILY_LIMIT}) → ${emailOptions.to} (queue size: ${queue.length})`);
  return { sent: false, queued: true };
};

/**
 * Current email quota for the rolling daily period.
 */
const getEmailQuota = () => {
  maybeResetPeriod();
  const queue = loadQueue();
  return {
    sent_count: state.sentCount,
    daily_limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - state.sentCount),
    queued: queue.length,
    period_hours: PERIOD_HOURS,
  };
};

// ── Hourly scheduler ──────────────────────────────────────────────────────────
setInterval(async () => {
  const wasReset = maybeResetPeriod();
  if (wasReset) await drainQueue();
}, 60 * 60 * 1000);

// Drain on startup if there are queued emails and the period has already elapsed
(async () => {
  const queue = loadQueue();
  if (queue.length > 0) {
    console.log(`[emailQueue] Startup: ${queue.length} queued email(s) found. Attempting drain...`);
    await drainQueue();
  }
})();

module.exports = { queueEmail, drainQueue, getEmailQuota };
